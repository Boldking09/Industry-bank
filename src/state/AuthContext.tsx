import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SESSION_KEY = "ib.session.v1";

export const DEMO_EMAIL = "demo@industrybank.test";
export const DEMO_PASSWORD = "industry123";

export interface Session {
  name: string;
  email: string;
}

export interface SignInResult {
  ok: boolean;
  message?: string;
}

interface AuthValue {
  session: Session | null;
  signIn: (email: string, password: string) => SignInResult;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed?.email !== "string" || typeof parsed?.name !== "string") {
      return null;
    }
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);

  const signIn = useCallback((email: string, password: string): SignInResult => {
    const normalized = email.trim().toLowerCase();
    if (normalized !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      return {
        ok: false,
        message: "That email or password does not match the demo account.",
      };
    }
    const next: Session = { name: "Alex Morgan", email: normalized };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
