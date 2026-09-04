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
  phone: string;
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
    throw new ApiError(res.status, message);
  }

  return json as T;
}

export const api = {
  async demoLogin(params: { name: string; phone: string; role: Role; email?: string }): Promise<Session> {
    const result = await request<{
      token: string;
      user: { id: string; name: string; phone: string; email?: string; role: Role };
    }>("/auth/demo-login", { method: "POST", body: params });
    return {
      token: result.token,
      userId: result.user.id,
      role: result.user.role,
      name: result.user.name,
      phone: result.user.phone,
      email: result.user.email,
    };
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
