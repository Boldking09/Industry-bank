import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

type Role = "agent" | "user" | "system";
type Step = 1 | 2 | 3 | 4 | 5;
type Author = "Maya" | "David";

interface ChatMessage {
  id: number;
  role: Role;
  text: string;
  time: string;
  author?: Author;
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

const DAVID_INTRO =
  "Hi, I'm David. I've reviewed the details you provided. I can see the issue with your account. Let me help you resolve this right now.";

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function respondTo(
  input: string,
  step: Step,
  specialistConnected: boolean,
): TurnResult {
  if (specialistConnected) {
    return {
      reply:
        "Thanks for that — I've added it to your case notes. I can see your account details on my end and I'll keep working on this. Is there anything else you'd like me to check?",
      nextStep: 5,
    };
  }

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

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 1,
      role: "agent",
      author: "Maya",
      text: `Hi ${firstName}, I'm Maya from Industry Bank support. I'm here to help with pending transfers, failed payments, and account questions. How can I help today?`,
      time: timeNow(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [canEscalate, setCanEscalate] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [specialistConnected, setSpecialistConnected] = useState(false);

  const nextId = useRef(2);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const specialistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) {
      return;
    }
    history.scrollTo({ top: history.scrollHeight, behavior: "smooth" });
  }, [messages, typing, connecting]);

  useEffect(() => {
    return () => {
      if (replyTimer.current) {
        clearTimeout(replyTimer.current);
      }
      if (specialistTimer.current) {
        clearTimeout(specialistTimer.current);
      }
    };
  }, []);

  const agentName = specialistConnected
    ? "David - Senior Specialist"
    : "Maya - Live Agent";
  const agentInitial = specialistConnected ? "D" : "M";

  function sendMessage(rawText?: string) {
    const text = (rawText ?? draft).trim();
    if (!text || typing || connecting) {
      return;
    }

    const result = respondTo(text, step, specialistConnected);
    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: "user",
      text,
      time: timeNow(),
    };
    setMessages((previous) => [...previous, userMessage]);
    setDraft("");
    setTyping(true);

    const author: Author = specialistConnected ? "David" : "Maya";
    replyTimer.current = setTimeout(
      () => {
        setMessages((previous) => [
          ...previous,
          {
            id: nextId.current++,
            role: "agent",
            author,
            text: result.reply,
            time: timeNow(),
          },
        ]);
        setStep(result.nextStep);
        if (result.escalateReady) {
          setCanEscalate(true);
        }
        setTyping(false);
        replyTimer.current = null;
      },
      1200 + Math.random() * 500,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleConnect() {
    if (!canEscalate || connecting || specialistConnected) {
      return;
    }

    setConnecting(true);
    setMessages((previous) => [
      ...previous,
      {
        id: nextId.current++,
        role: "system",
        text: "Connecting you to a live specialist...",
        time: timeNow(),
      },
    ]);

    specialistTimer.current = setTimeout(() => {
      setSpecialistConnected(true);
      setConnecting(false);
      setMessages((previous) => [
        ...previous,
        {
          id: nextId.current++,
          role: "agent",
          author: "David",
          text: DAVID_INTRO,
          time: timeNow(),
        },
      ]);
      specialistTimer.current = null;
    }, 2000);
  }

  const inputDisabled = typing || connecting;

  return (
    <div className="support">
      <header className="page__header">
        <div>
          <p className="greeting">We're here to help</p>
          <h1 className="page__title">Live support</h1>
          <p className="page__sub">
            Chat with a live Industry Bank agent about pending transfers,
            payments, or your account.
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
              {connecting
                ? "Connecting you to a specialist…"
                : specialistConnected
                  ? "Online · Senior specialist"
                  : "Online · typically replies in under a minute"}
            </span>
          </div>
        </div>

        <div
          className="support__history"
          ref={historyRef}
          role="log"
          aria-live="polite"
        >
          {messages.map((message) => {
            if (message.role === "system") {
              return (
                <div
                  key={message.id}
                  style={{ display: "flex", justifyContent: "center" }}
                >
                  <span
                    style={{
                      padding: "7px 13px",
                      border: "1px solid var(--line)",
                      borderRadius: "999px",
                      background: "#eef4fb",
                      color: "var(--muted)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {message.text}
                  </span>
                </div>
              );
            }

            const bubbleAuthor = message.author ?? (specialistConnected ? "David" : "Maya");
            const bubbleInitial = bubbleAuthor === "David" ? "D" : "M";

            return (
              <div
                key={message.id}
                className={`support__row support__row--${message.role}`}
              >
                {message.role === "agent" ? (
                  <span className="support__bubble-avatar" aria-hidden="true">
                    {bubbleInitial}
                  </span>
                ) : null}
                <div
                  className={`support__bubble support__bubble--${message.role}`}
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

        {canEscalate && !specialistConnected && !connecting ? (
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

        {messages.length === 1 ? (
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
              connecting ? "Connecting to a specialist…" : "Type your message…"
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
