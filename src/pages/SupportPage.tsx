import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  SUPPORT_CONNECT_NOTICE,
  supportTime,
  type SupportMessageRow,
  type SupportSender,
} from "../lib/support";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

type Step = 1 | 2 | 3 | 4 | 5;
type ChatSender = SupportSender | "system";

interface ChatMessage {
  id: string;
  sender: ChatSender;
  text: string;
  time: string;
}

interface TurnResult {
  reply: string;
  nextStep: Step;
  escalateReady?: boolean;
}

const QUICK_REPLIES = [
  "My transfer is pending",
  "Why did my transfer fail?",
  "Speak to a specialist",
];

const HUMAN_REQUEST =
  /(speak|talk|connect)\b.*\b(human|person|specialist|agent)\b|\b(human|specialist)\b/i;

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toChatMessage(row: SupportMessageRow): ChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    text: row.message,
    time: supportTime(row.created_at),
  };
}

function welcomeMessage(firstName: string): ChatMessage {
  return {
    id: "local-welcome",
    sender: "ai",
    text: `Hi ${firstName}, I'm Maya from Industry Bank support. I'm here to help with pending transfers, failed payments, and account questions. How can I help today?`,
    time: timeNow(),
  };
}

function respondTo(input: string, step: Step): TurnResult {
  if (HUMAN_REQUEST.test(input)) {
    return {
      reply:
        "Absolutely — I can connect you with a senior specialist who can review your account. Tap \u201cConnect to Specialist\u201d below whenever you're ready.",
      nextStep: step,
      escalateReady: true,
    };
  }

  switch (step) {
    case 1:
      return {
        reply:
          "I'm sorry you're dealing with that — I can help. To pull up your account securely, could you share your 10-digit account number?",
        nextStep: 2,
      };

    case 2: {
      const accountNumber = input.replace(/\D/g, "");
      if (accountNumber.length !== 10) {
        return {
          reply:
            "I couldn't find a valid 10-digit account number there. Could you re-enter just the 10 digits?",
          nextStep: 2,
        };
      }
      return {
        reply: `Thanks — I've located the account ending in ${accountNumber.slice(-4)}. Next, could you share the phone number on file?`,
        nextStep: 3,
      };
    }

    case 3: {
      const phone = input.replace(/\D/g, "");
      if (phone.length < 7) {
        return {
          reply:
            "That phone number doesn't look complete. Please enter a phone number with at least 7 digits.",
          nextStep: 3,
        };
      }
      return {
        reply:
          "Got it, thank you. And what's the best email address to reach you at?",
        nextStep: 4,
      };
    }

    case 4: {
      const email = input.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
          reply:
            "That email doesn't look quite right. Please enter a valid email address, like name@example.com.",
          nextStep: 4,
        };
      }
      return {
        reply:
          "Perfect — I have your account number, phone, and email. I can connect you with a senior specialist who can review the transfer and help resolve it right away. Tap \u201cConnect to Specialist\u201d below when you're ready.",
        nextStep: 5,
        escalateReady: true,
      };
    }

    default:
      return {
        reply:
          "Thanks for the update. I've added it to your case notes. Tap \u201cConnect to Specialist\u201d below to speak with a senior specialist, or share anything else you'd like me to include.",
        nextStep: 5,
        escalateReady: true,
      };
  }
}

export default function SupportPage() {
  const { session } = useAuth();
  const firstName = session?.name.split(" ")[0] ?? "there";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [canEscalate, setCanEscalate] = useState(false);
  const [isHumanConnected, setIsHumanConnected] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(Boolean(supabase && session));
  const [chatError, setChatError] = useState("");

  const localId = useRef(0);
  const humanConnectedRef = useRef(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) {
      return;
    }
    history.scrollTo({ top: history.scrollHeight, behavior: "smooth" });
  }, [messages, typing, historyLoading]);

  useEffect(() => {
    return () => {
      if (replyTimer.current) {
        clearTimeout(replyTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!supabase || !session) {
      setMessages([welcomeMessage(firstName)]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);

    supabase
      .from("support_messages")
      .select("id,user_id,sender,message,created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) {
          return;
        }

        if (error) {
          setChatError(
            "We couldn't load your saved conversation. Messages you send may not reach a specialist.",
          );
          setMessages([welcomeMessage(firstName)]);
          setHistoryLoading(false);
          return;
        }

        const rows = (data ?? []) as SupportMessageRow[];

        if (rows.length === 0) {
          setMessages([welcomeMessage(firstName)]);
        } else {
          setMessages(rows.map(toChatMessage));
          setStep(5);
          setCanEscalate(true);

          const hasHuman = rows.some(
            (row) =>
              row.sender === "human" || row.message === SUPPORT_CONNECT_NOTICE,
          );

          if (hasHuman) {
            humanConnectedRef.current = true;
            setIsHumanConnected(true);
            setCanEscalate(false);
          }
        }

        setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [firstName, session]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) {
      return;
    }

    const channel = client
      .channel(`support:${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `user_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as SupportMessageRow;

          setMessages((previous) =>
            previous.some((message) => message.id === row.id)
              ? previous
              : [...previous, toChatMessage(row)],
          );

          if (
            row.sender === "human" ||
            row.message === SUPPORT_CONNECT_NOTICE
          ) {
            humanConnectedRef.current = true;
            setIsHumanConnected(true);
            setCanEscalate(false);
            setStep(5);
            setTyping(false);

            if (replyTimer.current) {
              clearTimeout(replyTimer.current);
              replyTimer.current = null;
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChatError(
            "Live updates are unavailable right now. Refresh the page to reconnect.",
          );
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [session]);

  function pushLocalMessage(sender: ChatSender, text: string): string {
    const id = `local-${Date.now()}-${localId.current++}`;
    setMessages((previous) => [
      ...previous,
      { id, sender, text, time: timeNow() },
    ]);
    return id;
  }

  async function persistMessage(
    sender: SupportSender,
    text: string,
    pendingId: string,
  ) {
    const client = supabase;
    const userId = session?.id;

    if (!client || !userId) {
      return;
    }

    const { data, error } = await client
      .from("support_messages")
      .insert({ user_id: userId, sender, message: text })
      .select("id,user_id,sender,message,created_at")
      .single();

    if (error) {
      setChatError(
        "A message could not be saved. Check your connection and try again.",
      );
      return;
    }

    if (!data) {
      return;
    }

    const saved = toChatMessage(data as SupportMessageRow);
    setMessages((previous) => {
      if (previous.some((message) => message.id === saved.id)) {
        return previous.filter((message) => message.id !== pendingId);
      }
      return previous.map((message) =>
        message.id === pendingId ? saved : message,
      );
    });
  }

  function sendMessage(rawText?: string) {
    const text = (rawText ?? draft).trim();
    if (!text || typing || historyLoading) {
      return;
    }

    const pendingId = pushLocalMessage("user", text);
    setDraft("");
    void persistMessage("user", text, pendingId);

    if (humanConnectedRef.current) {
      return;
    }

    const result = respondTo(text, step);
    setTyping(true);

    replyTimer.current = setTimeout(
      () => {
        replyTimer.current = null;

        if (humanConnectedRef.current) {
          setTyping(false);
          return;
        }

        const aiId = pushLocalMessage("ai", result.reply);
        void persistMessage("ai", result.reply, aiId);
        setStep(result.nextStep);
        if (result.escalateReady) {
          setCanEscalate(true);
        }
        setTyping(false);
      },
      1200 + Math.random() * 500,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleConnect() {
    if (!canEscalate || humanConnectedRef.current) {
      return;
    }

    humanConnectedRef.current = true;
    setIsHumanConnected(true);
    setCanEscalate(false);
    setStep(5);
    setTyping(false);

    if (replyTimer.current) {
      clearTimeout(replyTimer.current);
      replyTimer.current = null;
    }

    if (!supabase || !session) {
      pushLocalMessage(
        "system",
        "Live specialist chat is unavailable in local demo mode. Connect Supabase to reach the support team.",
      );
      return;
    }

    const pendingId = pushLocalMessage("ai", SUPPORT_CONNECT_NOTICE);
    void persistMessage("ai", SUPPORT_CONNECT_NOTICE, pendingId);
  }

  const inputDisabled = typing || historyLoading;
  const agentName = isHumanConnected
    ? "Live Specialist"
    : "Maya - Support Assistant";
  const agentInitial = isHumanConnected ? "S" : "M";

  return (
    <div className="support">
      <header className="page__header">
        <div>
          <p className="greeting">We're here to help</p>
          <h1 className="page__title">Live support</h1>
          <p className="page__sub">
            Chat with our support assistant, then connect with a human
            specialist whenever you need one.
          </p>
        </div>
        <Link to="/" className="btn btn--ghost">
          Back to dashboard
        </Link>
      </header>

      <section className="card support__chat" aria-label="Live chat with support">
        <div className="support__head">
          <span className="support__avatar" aria-hidden="true">
            {agentInitial}
          </span>
          <div className="support__identity">
            <span className="support__name">{agentName}</span>
            <span className="support__status">
              <span className="support__dot" aria-hidden="true" />
              {historyLoading
                ? "Loading your conversation…"
                : isHumanConnected
                  ? "Connected · Human specialist"
                  : "Online · AI assistant"}
            </span>
          </div>
        </div>

        {chatError ? (
          <p className="support__error" role="alert">
            {chatError}
          </p>
        ) : null}

        <div
          className="support__history"
          ref={historyRef}
          role="log"
          aria-live="polite"
        >
          {historyLoading ? (
            <p className="support__loading">Loading conversation…</p>
          ) : null}

          {messages.map((message) => {
            if (message.sender === "system") {
              return (
                <div key={message.id} className="support__notice-row">
                  <span className="support__notice">{message.text}</span>
                </div>
              );
            }

            const isUser = message.sender === "user";
            const rowRole = isUser ? "user" : "agent";
            const bubbleRole = isUser ? "user" : "agent";
            const initial = message.sender === "human" ? "S" : "M";

            return (
              <div
                key={message.id}
                className={`support__row support__row--${rowRole}`}
              >
                {!isUser ? (
                  <span
                    className={`support__bubble-avatar ${
                      message.sender === "human"
                        ? "support__bubble-avatar--human"
                        : ""
                    }`.trim()}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                ) : null}
                <div
                  className={`support__bubble support__bubble--${bubbleRole} ${
                    message.sender === "human"
                      ? "support__bubble--human"
                      : ""
                  }`.trim()}
                >
                  <p className="support__text">{message.text}</p>
                  <span className="support__time">{message.time}</span>
                </div>
              </div>
            );
          })}

          {typing ? (
            <div className="support__row support__row--agent">
              <span className="support__bubble-avatar" aria-hidden="true">
                {agentInitial}
              </span>
              <div className="support__bubble support__bubble--agent support__bubble--typing">
                <span className="support__typing" aria-label="Agent is typing">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="support__typing-label">Agent is typing…</span>
              </div>
            </div>
          ) : null}
        </div>

        {canEscalate && !isHumanConnected ? (
          <div className="support__quick">
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={handleConnect}
            >
              Connect to Specialist
            </button>
          </div>
        ) : null}

        {messages.length === 1 && !isHumanConnected && !historyLoading ? (
          <div className="support__quick">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                type="button"
                className="support__chip"
                onClick={() => sendMessage(reply)}
                disabled={inputDisabled}
              >
                {reply}
              </button>
            ))}
          </div>
        ) : null}

        <form className="support__composer" onSubmit={handleSubmit}>
          <label className="support__sr-only" htmlFor="support-message">
            Message
          </label>
          <input
            id="support-message"
            className="input support__input"
            type="text"
            autoComplete="off"
            placeholder={
              historyLoading
                ? "Loading conversation…"
                : isHumanConnected
                  ? "Message your specialist…"
                  : "Type your message…"
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={inputDisabled}
          />
          <button
            type="submit"
            className="btn btn--primary support__send"
            disabled={inputDisabled || !draft.trim()}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
