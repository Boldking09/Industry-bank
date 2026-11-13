import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import {
  supportTime,
  supportWhen,
  type SupportMessageRow,
  type SupportSender,
} from "../lib/support";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  created_at: string;
}

interface SessionSummary {
  userId: string;
  profile?: ProfileRow;
  latest: SupportMessageRow;
  messageCount: number;
}

function displayName(profile?: ProfileRow): string {
  if (profile?.full_name?.trim()) {
    return profile.full_name.trim();
  }
  if (profile?.email) {
    return profile.email.split("@")[0];
  }
  return "Customer";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function senderLabel(sender: SupportSender): string {
  if (sender === "human") {
    return "You";
  }
  if (sender === "ai") {
    return "AI assistant";
  }
  return "Customer";
}

export default function AdminPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const profilesRef = useRef(profiles);
  const localId = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    let active = true;
    const client = supabase;

    if (!client) {
      setError("Supabase is not configured. The support console cannot connect.");
      setLoading(false);
      return;
    }

    Promise.all([
      client
        .from("profiles")
        .select("id,email,full_name,phone_number,created_at")
        .order("created_at", { ascending: true }),
      client
        .from("support_messages")
        .select("id,user_id,sender,message,created_at")
        .order("created_at", { ascending: true }),
    ]).then(([profileResult, messageResult]) => {
      if (!active) {
        return;
      }

      if (profileResult.error || messageResult.error) {
        setError(
          profileResult.error?.message ??
            messageResult.error?.message ??
            "Unable to load support conversations.",
        );
      }

      const profileRows = (profileResult.data ?? []) as ProfileRow[];
      const nextProfiles = Object.fromEntries(
        profileRows.map((profile) => [profile.id, profile]),
      );
      const messageRows = (messageResult.data ?? []) as SupportMessageRow[];

      setProfiles(nextProfiles);
      setMessages(messageRows);

      const latestByUser = new Map<string, SupportMessageRow>();
      for (const message of messageRows) {
        const previous = latestByUser.get(message.user_id);
        if (!previous || message.created_at > previous.created_at) {
          latestByUser.set(message.user_id, message);
        }
      }

      const firstSession = [...latestByUser.values()].sort((left, right) =>
        right.created_at.localeCompare(left.created_at),
      )[0];

      setSelectedUserId((current) => {
        if (current && latestByUser.has(current)) {
          return current;
        }
        return firstSession?.user_id ?? null;
      });
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    const channel = client
      .channel("admin:support")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
        },
        (payload) => {
          const row = payload.new as SupportMessageRow;

          setMessages((previous) =>
            previous.some((message) => message.id === row.id)
              ? previous
              : [...previous, row],
          );
          setSelectedUserId((current) => current ?? row.user_id);

          if (!profilesRef.current[row.user_id]) {
            void client
              .from("profiles")
              .select("id,email,full_name,phone_number,created_at")
              .eq("id", row.user_id)
              .single()
              .then(({ data }) => {
                if (!data) {
                  return;
                }
                const profile = data as ProfileRow;
                setProfiles((previous) =>
                  previous[profile.id]
                    ? previous
                    : { ...previous, [profile.id]: profile },
                );
              });
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError(
            "Realtime updates are unavailable. Refresh the page to reconnect.",
          );
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const sessions = useMemo<SessionSummary[]>(() => {
    const grouped = new Map<
      string,
      { latest: SupportMessageRow; messageCount: number }
    >();

    for (const message of messages) {
      const current = grouped.get(message.user_id);
      if (!current) {
        grouped.set(message.user_id, { latest: message, messageCount: 1 });
        continue;
      }

      current.messageCount += 1;
      if (message.created_at > current.latest.created_at) {
        current.latest = message;
      }
    }

    return [...grouped.entries()]
      .map(([userId, entry]) => ({
        userId,
        profile: profiles[userId],
        latest: entry.latest,
        messageCount: entry.messageCount,
      }))
      .sort((left, right) =>
        right.latest.created_at.localeCompare(left.latest.created_at),
      );
  }, [messages, profiles]);

  useEffect(() => {
    if (!selectedUserId && sessions.length > 0) {
      setSelectedUserId(sessions[0].userId);
    }
  }, [selectedUserId, sessions]);

  const selectedSession =
    sessions.find((item) => item.userId === selectedUserId) ?? null;

  const conversation = useMemo(() => {
    if (!selectedUserId) {
      return [];
    }
    return messages
      .filter((message) => message.user_id === selectedUserId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }, [messages, selectedUserId]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [conversation.length, sending]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || !selectedUserId || sending) {
      return;
    }

    const client = supabase;
    if (!client) {
      setError("Supabase is not configured.");
      return;
    }

    const pendingId = `local-${Date.now()}-${localId.current++}`;
    const pending: SupportMessageRow = {
      id: pendingId,
      user_id: selectedUserId,
      sender: "human",
      message: text,
      created_at: new Date().toISOString(),
    };

    setDraft("");
    setSending(true);
    setError("");
    setMessages((previous) => [...previous, pending]);

    const { data, error: sendError } = await client
      .from("support_messages")
      .insert({
        user_id: selectedUserId,
        sender: "human",
        message: text,
      })
      .select("id,user_id,sender,message,created_at")
      .single();

    setSending(false);

    if (sendError) {
      setMessages((previous) =>
        previous.filter((message) => message.id !== pendingId),
      );
      setDraft(text);
      setError(`Reply not sent: ${sendError.message}`);
      return;
    }

    if (!data) {
      return;
    }

    const saved = data as SupportMessageRow;
    setMessages((previous) => {
      if (previous.some((message) => message.id === saved.id)) {
        return previous.filter((message) => message.id !== pendingId);
      }
      return previous.map((message) =>
        message.id === pendingId ? saved : message,
      );
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const adminInitials = initials(session?.name ?? "Support Admin");

  return (
    <div className="admin">
      <header className="admin__topbar">
        <Brand />
        <div className="admin__topbar-actions">
          <span className="admin__admin-badge">Support console</span>
          <Link to="/" className="btn btn--ghost btn--sm">
            Dashboard
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleSignOut}
          >
            Sign out
          </button>
          <span className="admin__admin-avatar" aria-hidden="true">
            {adminInitials}
          </span>
        </div>
      </header>

      <main className="admin__page">
        <header className="admin__intro">
          <div>
            <p className="greeting">Human support</p>
            <h1 className="page__title">Live conversations</h1>
            <p className="page__sub">
              Reply to customers as a human specialist. New messages appear here
              in real time.
            </p>
          </div>
          <span className="admin__live">
            <span className="admin__live-dot" aria-hidden="true" />
            Realtime connected
          </span>
        </header>

        {error ? (
          <p className="admin__error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <section className="card admin__empty">
            <p className="page__sub">Loading support conversations…</p>
          </section>
        ) : sessions.length === 0 ? (
          <section className="card admin__empty">
            <span className="admin__empty-icon" aria-hidden="true">
              IB
            </span>
            <h2>No active conversations</h2>
            <p>
              When a customer sends a support message or requests a specialist,
              their conversation will appear here.
            </p>
          </section>
        ) : (
          <div className="admin__layout">
            <aside className="card admin__sessions" aria-label="Support sessions">
              <div className="admin__sessions-head">
                <h2>Active sessions</h2>
                <span className="admin__count">{sessions.length}</span>
              </div>
              <div className="admin__session-list">
                {sessions.map((item) => {
                  const name = displayName(item.profile);
                  const email = item.profile?.email ?? "Email unavailable";
                  const active = item.userId === selectedUserId;

                  return (
                    <button
                      key={item.userId}
                      type="button"
                      className={`admin__session ${
                        active ? "admin__session--active" : ""
                      }`.trim()}
                      onClick={() => setSelectedUserId(item.userId)}
                    >
                      <span className="admin__session-avatar" aria-hidden="true">
                        {initials(name)}
                      </span>
                      <span className="admin__session-body">
                        <span className="admin__session-top">
                          <span className="admin__session-name">{name}</span>
                          <span className="admin__session-time">
                            {supportWhen(item.latest.created_at)}
                          </span>
                        </span>
                        <span className="admin__session-email">{email}</span>
                        <span className="admin__session-preview">
                          {item.latest.sender === "human"
                            ? "You: "
                            : item.latest.sender === "ai"
                              ? "AI: "
                              : ""}
                          {item.latest.message}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="card admin__chat" aria-label="Conversation">
              {selectedSession ? (
                <>
                  <div className="admin__chat-head">
                    <div className="admin__chat-person">
                      <span
                        className="admin__session-avatar admin__session-avatar--lg"
                        aria-hidden="true"
                      >
                        {initials(displayName(selectedSession.profile))}
                      </span>
                      <div>
                        <h2>{displayName(selectedSession.profile)}</h2>
                        <p>
                          {selectedSession.profile?.email ?? "Email unavailable"}
                          {selectedSession.profile?.phone_number
                            ? ` · ${selectedSession.profile.phone_number}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span className="admin__message-count">
                      {selectedSession.messageCount}{" "}
                      {selectedSession.messageCount === 1 ? "message" : "messages"}
                    </span>
                  </div>

                  <div
                    className="admin__thread"
                    ref={threadRef}
                    role="log"
                    aria-live="polite"
                  >
                    {conversation.map((message) => {
                      const mine = message.sender === "human";
                      return (
                        <div
                          key={message.id}
                          className={`admin__message ${
                            mine ? "admin__message--mine" : ""
                          }`.trim()}
                        >
                          <span className="admin__message-meta">
                            <span>{senderLabel(message.sender)}</span>
                            <span>{supportTime(message.created_at)}</span>
                          </span>
                          <div
                            className={`admin__bubble admin__bubble--${message.sender}`}
                          >
                            {message.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form className="admin__composer" onSubmit={handleSend}>
                    <label className="support__sr-only" htmlFor="admin-reply">
                      Reply to customer
                    </label>
                    <input
                      id="admin-reply"
                      className="input"
                      type="text"
                      autoComplete="off"
                      placeholder={`Reply to ${displayName(selectedSession.profile)}…`}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={sending || !draft.trim()}
                    >
                      {sending ? "Sending…" : "Send reply"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="admin__empty admin__empty--inline">
                  <p>Select a conversation to view the chat history.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="admin__footer">
        <p>
          © {new Date().getFullYear()} Industry Bank. Support console for
          authorized staff only.
        </p>
      </footer>
    </div>
  );
}
