import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const SESSION_KEY = "ib.session.v1";

export const LOCAL_ACCOUNT_EMAIL = "alex.morgan@industrybank.com";
export const LOCAL_ACCOUNT_PASSWORD = "industry123";

export interface Session {
  id: string;
  name: string;
  email: string;
}

export interface SignInResult {
  ok: boolean;
  message?: string;
  /** True when sign-up succeeded but the email still needs to be confirmed. */
  needsEmailConfirmation?: boolean;
}

export interface SignUpDetails {
  name: string;
  dateOfBirth: string;
  address: string;
  idFront: File | null;
  idBack: File | null;
}

interface AuthValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (
    details: SignUpDetails,
    email: string,
    password: string,
  ) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Session, "name" | "email">>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function toSession(user: User): Session {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : undefined;
  const email = user.email ?? "";
  return {
    id: user.id,
    name: metadataName ?? email.split("@")[0] ?? "Customer",
    email,
  };
}

const ID_BUCKET = "id-cards";

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const cleaned = fromName.replace(/[^a-z0-9]/g, "");
  return cleaned || "jpg";
}

async function uploadIdCard(
  userId: string,
  file: File,
  side: "front" | "back",
): Promise<{ url?: string; error?: string }> {
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const path = `${userId}/${side}-${Date.now()}.${fileExtension(file)}`;
  const { error } = await supabase.storage.from(ID_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    return { error: error.message };
  }

  const { data } = supabase.storage.from(ID_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/* -------------------------------------------------------------------------- */
/* Supabase-backed provider (used when VITE_SUPABASE_* is configured)         */
/* -------------------------------------------------------------------------- */

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session ? toSession(data.session.user) : null);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next ? toSession(next.user) : null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    if (!supabase) {
      return { ok: false, message: "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }, []);

  const signUp = useCallback(
    async (
      details: SignUpDetails,
      email: string,
      password: string,
    ): Promise<SignInResult> => {
      if (!supabase) {
        return { ok: false, message: "Supabase is not configured." };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: details.name.trim() || "New Customer",
            date_of_birth: details.dateOfBirth || null,
            address: details.address.trim() || null,
          },
        },
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      if (!data.session || !data.user) {
        return { ok: true, needsEmailConfirmation: true };
      }

      const updates: { id_front_url?: string; id_back_url?: string } = {};

      if (details.idFront) {
        const upload = await uploadIdCard(data.user.id, details.idFront, "front");
        if (upload.error) {
          return {
            ok: false,
            message: `Account created, but the front ID upload failed: ${upload.error}`,
          };
        }
        updates.id_front_url = upload.url;
      }

      if (details.idBack) {
        const upload = await uploadIdCard(data.user.id, details.idBack, "back");
        if (upload.error) {
          return {
            ok: false,
            message: `Account created, but the back ID upload failed: ${upload.error}`,
          };
        }
        updates.id_back_url = upload.url;
      }

      if (Object.keys(updates).length > 0) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", data.user.id);

        if (profileError) {
          return {
            ok: false,
            message: `Account created, but saving the ID images failed: ${profileError.message}`,
          };
        }
      }

      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    (updates: Partial<Pick<Session, "name" | "email">>) => {
      setSession((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.email ? { email: updates.email } : {}),
        };
      });
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({ session, loading, signIn, signUp, signOut, updateProfile }),
    [session, loading, signIn, signUp, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Local provider (fallback when Supabase is not configured)                  */
/* -------------------------------------------------------------------------- */

function readLocalSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed?.email !== "string" || typeof parsed?.name !== "string") {
      return null;
    }
    return {
      id: typeof parsed.id === "string" ? parsed.id : "local-user",
      name: parsed.name,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readLocalSession);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const normalized = email.trim().toLowerCase();
      if (normalized !== LOCAL_ACCOUNT_EMAIL || password !== LOCAL_ACCOUNT_PASSWORD) {
        return {
          ok: false,
          message: "That email or password does not match our records.",
        };
      }
      const next: Session = {
        id: "local-user",
        name: "Alex Morgan",
        email: normalized,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    async (details: SignUpDetails, email: string): Promise<SignInResult> => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        return { ok: false, message: "Enter an email address." };
      }
      const next: Session = {
        id: "local-user",
        name: details.name.trim() || "New Customer",
        email: normalized,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const updateProfile = useCallback(
    (updates: Partial<Pick<Session, "name" | "email">>) => {
      setSession((previous) => {
        if (!previous) {
          return previous;
        }
        const next: Session = {
          ...previous,
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.email ? { email: updates.email } : {}),
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({ session, loading: false, signIn, signUp, signOut, updateProfile }),
    [session, signIn, signUp, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */

export function AuthProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <LocalAuthProvider>{children}</LocalAuthProvider>
  );
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
