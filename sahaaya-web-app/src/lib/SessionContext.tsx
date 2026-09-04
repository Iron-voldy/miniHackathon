import { createContext, useContext, useState, type ReactNode } from "react";
import type { Session } from "./api";

interface SessionContextValue {
  session: Session | null;
  setSession: (s: Session | null) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);
const STORAGE_KEY = "sahaaya.session";

function loadStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(loadStoredSession);

  function setSession(s: Session | null) {
    setSessionState(s);
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }

  return <SessionContext.Provider value={{ session, setSession }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
