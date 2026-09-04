// Thin fetch wrapper against the Sahaaya backend (apps: sahaaya-api).
// Deliberately has zero dependency on Supabase or any other identity
// provider — the whole contract is: POST /auth/demo-login gives a JWT,
// every other call sends it as a Bearer token.

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8080";

export type Role = "communicator" | "caregiver";
export type Language = "en" | "si" | "ta";
export type InputMode = "touch" | "face";

export interface Session {
  token: string;
  userId: string;
  role: Role;
  name: string;
  // A patient created via a caregiver access code never has one.
  phone?: string;
  email?: string;
}

export interface Phrase {
  id: string;
  category: string;
  english: string;
  sinhala: string;
  tamil: string;
  symbolAsset: string;
  riskClass: "normal" | "sensitive";
  canNotify: boolean;
  requiresConfirmation: boolean;
  version: number;
}

export interface BoardSummary {
  id: string;
  title: string;
  context: string;
}

export interface BoardDetail extends BoardSummary {
  phrases: Phrase[];
}

export interface RequestRecord {
  id: string;
  communicatorId: string;
  phraseId: string;
  resolvedText: string;
  inputMode: InputMode;
  status: string;
  deliveries: Array<{ caregiverId: string; status: string; deliveredAt?: string }>;
  acknowledgement?: { caregiverId: string; responderName: string; respondedAt: string };
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// A stored session can outlive its JWT (expiry, or the account/role no longer
// matches). Without this, an authenticated page just shows a generic "could
// not load" error forever - registered by SessionProvider so any 401 from an
// authenticated request drops back to the login screen instead of getting stuck.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no/invalid body
  }

  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${res.status})`;
    if (res.status === 401 && options.token) unauthorizedHandler?.();
    throw new ApiError(res.status, message);
  }

  return json as T;
}

type AuthUser = { id: string; name: string; phone?: string; email?: string; role: Role };

function toSession(result: { token: string; user: AuthUser }): Session {
  return {
    token: result.token,
    userId: result.user.id,
    role: result.user.role,
    name: result.user.name,
    phone: result.user.phone,
    email: result.user.email,
  };
}

export const api = {
  // Legacy patient path: passwordless, name + phone. Superseded by patientLogin
  // (an access code from a caregiver) but kept for backend compatibility.
  async demoLogin(params: { name: string; phone: string }): Promise<Session> {
    const result = await request<{ token: string; user: AuthUser }>("/auth/demo-login", { method: "POST", body: params });
    return toSession(result);
  },

  // Patient side: a caregiver generates this code (see createPatient below) and
  // the patient's device logs in with just it - no name or phone typed here.
  async patientLogin(code: string): Promise<Session> {
    const result = await request<{ token: string; user: AuthUser }>("/auth/patient-code", { method: "POST", body: { code } });
    return toSession(result);
  },

  // Caregiver side: real password-protected account (no Google/OAuth for now).
  async signup(params: { name: string; phone: string; email: string; password: string }): Promise<Session> {
    const result = await request<{ token: string; user: AuthUser }>("/auth/signup", { method: "POST", body: params });
    return toSession(result);
  },

  async login(params: { email: string; password: string }): Promise<Session> {
    const result = await request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body: params });
    return toSession(result);
  },

  // Caregiver creates a patient profile and gets back a one-time access code
  // to hand to the patient's device.
  createPatient(token: string, params: { name: string; language?: Language }): Promise<{ patientId: string; name: string; accessCode: string }> {
    return request("/caregivers/patients", { method: "POST", token, body: params });
  },

  listBoards(token: string, context = "home"): Promise<BoardSummary[]> {
    return request(`/boards?context=${encodeURIComponent(context)}`, { token });
  },

  getBoard(token: string, boardId: string): Promise<BoardDetail> {
    return request(`/boards/${encodeURIComponent(boardId)}`, { token });
  },

  rankPhrases(
    token: string,
    body: { boardId: string; recentPhraseIds?: string[] }
  ): Promise<{ rankedPhraseIds: string[]; reasonCode: string }> {
    return request("/phrases/rank", { method: "POST", token, body });
  },

  createPairing(token: string): Promise<{ pairingCode: string }> {
    return request("/caregivers/pair", { method: "POST", token });
  },

  acceptPairing(token: string, pairingCode: string): Promise<{ id: string; status: string }> {
    return request("/caregivers/pair/accept", { method: "POST", token, body: { pairingCode } });
  },

  listCaregivers(
    token: string
  ): Promise<Array<{ id: string; communicator: { name: string } | null; caregiver: { name: string } | null }>> {
    return request("/caregivers", { token });
  },

  createRequest(
    token: string,
    body: { phraseId: string; inputMode: InputMode; clientRequestId: string }
  ): Promise<RequestRecord> {
    return request("/requests", { method: "POST", token, body: { ...body, confirmed: true } });
  },

  getRequest(token: string, id: string): Promise<RequestRecord> {
    return request(`/requests/${encodeURIComponent(id)}`, { token });
  },

  acknowledgeRequest(token: string, id: string): Promise<RequestRecord> {
    return request(`/requests/${encodeURIComponent(id)}/acknowledge`, { method: "POST", token });
  },

  /**
   * Native EventSource cannot carry an Authorization header, so the SSE
   * inbox is consumed via a manual fetch + streamed body reader instead,
   * parsing "data: ...\n\n" frames by hand.
   */
  async subscribeInbox(token: string, onItem: (item: RequestRecord) => void, signal: AbortSignal): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/v1/requests/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok || !res.body) throw new ApiError(res.status, "Could not open the live request stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          onItem(JSON.parse(line.slice(6)) as RequestRecord);
        } catch {
          // ignore a malformed frame
        }
      }
    }
  },
};
