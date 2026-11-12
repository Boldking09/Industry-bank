import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  LOCAL_ACCOUNT_EMAIL,
  LOCAL_ACCOUNT_PASSWORD,
  useAuth,
} from "../state/AuthContext";
import "./login.css";

type Mode = "signin" | "signup";

const MAX_ID_BYTES = 5 * 1024 * 1024;

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="9"
        width="12"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 9V6.5a3 3 0 016 0V9"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { session, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [email, setEmail] = useState(isSupabaseConfigured ? "" : LOCAL_ACCOUNT_EMAIL);
  const [password, setPassword] = useState(isSupabaseConfigured ? "" : LOCAL_ACCOUNT_PASSWORD);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <main className="page">
        <p className="page__sub">Loading…</p>
      </main>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (mode === "signup") {
      if (!name.trim()) {
        setError("Enter your full name.");
        return;
      }
      if (!dateOfBirth) {
        setError("Enter your date of birth.");
        return;
      }
      if (!address.trim()) {
        setError("Enter your home address.");
        return;
      }
      if (!idFront) {
        setError("Upload the front of your ID.");
        return;
      }
      if (!idBack) {
        setError("Upload the back of your ID.");
        return;
      }
      if (idFront.size > MAX_ID_BYTES || idBack.size > MAX_ID_BYTES) {
        setError("Each ID image must be 5 MB or smaller.");
        return;
      }
    }

    setSubmitting(true);

    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp({ name, dateOfBirth, address, idFront, idBack }, email, password);

    setSubmitting(false);

    if (!result.ok) {
      setError(result.message ?? "Unable to continue.");
      return;
    }

    if (result.needsEmailConfirmation) {
      setInfo("Account created. Check your inbox to confirm your email, then sign in.");
      setMode("signin");
      return;
    }

    navigate(from, { replace: true });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  return (
    <div className="ib-auth">
      <aside className="ib-auth__brand-panel">
        <div className="ib-auth__brand-top">
          <Brand className="ib-auth__brand" to="/login" />
          <span className="ib-auth__secure">
            <LockIcon />
            Secure client access
          </span>
        </div>

        <div className="ib-auth__brand-copy">
          <p className="ib-auth__eyebrow">Private banking, reimagined</p>
          <h1 className="ib-auth__headline">
            The confidence of a private bank, the ease of modern banking.
          </h1>
          <p className="ib-auth__lede">
            A considered home for your money. See every account, understand your
            spending, and move funds with clarity and control.
          </p>
          <ul className="ib-auth__points">
            <li className="ib-auth__point">
              <span className="ib-auth__point-icon">
                <CheckIcon />
              </span>
              Real-time balances across every account
            </li>
            <li className="ib-auth__point">
              <span className="ib-auth__point-icon">
                <CheckIcon />
              </span>
              Transfers completed in a few focused steps
            </li>
            <li className="ib-auth__point">
              <span className="ib-auth__point-icon">
                <CheckIcon />
              </span>
              Clear activity, without the clutter
            </li>
          </ul>
        </div>

        <div className="ib-auth__brand-foot">
          <div className="ib-auth__trust">
            <span className="ib-auth__trust-item">
              <CheckIcon /> Bank-grade encryption
            </span>
            <span className="ib-auth__trust-item">
              <CheckIcon /> 24/7 fraud monitoring
            </span>
            <span className="ib-auth__trust-item">
              <CheckIcon /> Dedicated support
            </span>
          </div>
          <p className="ib-auth__legal">
            © {new Date().getFullYear()} Industry Bank. Banking services provided by
            Industry Bank, N.A.
          </p>
        </div>
      </aside>

      <main className="ib-auth__panel">
        <div className="ib-auth__form-shell">
          <header className="ib-auth__form-head">
            <p className="ib-auth__form-eyebrow">
              {mode === "signin" ? "Welcome back" : "Open an account"}
            </p>
            <h2 className="ib-auth__form-title">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
            <p className="ib-auth__form-sub">
              {mode === "signin"
                ? "Enter your details to access your accounts and dashboard."
                : "Join Industry Bank in a few minutes and take control of your money."}
            </p>
          </header>

          <form className="ib-auth__form" onSubmit={handleSubmit} noValidate>
            {mode === "signup" ? (
              <div className="ib-field">
                <label className="ib-field__label" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  className="ib-input"
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  aria-invalid={error ? "true" : undefined}
                />
              </div>
            ) : null}

            {mode === "signup" ? (
              <>
                <div className="ib-field">
                  <label className="ib-field__label" htmlFor="dateOfBirth">
                    Date of birth
                  </label>
                  <input
                    id="dateOfBirth"
                    className="ib-input"
                    type="date"
                    name="dateOfBirth"
                    autoComplete="bday"
                    max={new Date().toISOString().slice(0, 10)}
                    value={dateOfBirth}
                    onChange={(event) => {
                      setDateOfBirth(event.target.value);
                      setError("");
                    }}
                  />
                </div>

                <div className="ib-field">
                  <label className="ib-field__label" htmlFor="address">
                    Home address
                  </label>
                  <input
                    id="address"
                    className="ib-input"
                    type="text"
                    name="address"
                    autoComplete="street-address"
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      setError("");
                    }}
                  />
                </div>

                <div className="ib-upload-grid">
                  <div className="ib-field">
                    <label className="ib-field__label" htmlFor="idFront">
                      Upload front of ID
                    </label>
                    <input
                      id="idFront"
                      className="ib-input ib-input--file"
                      type="file"
                      name="idFront"
                      accept="image/*"
                      onChange={(event) => {
                        setIdFront(event.target.files?.[0] ?? null);
                        setError("");
                      }}
                    />
                    <span className="ib-field__hint">
                      {idFront ? idFront.name : "PNG or JPG, up to 5 MB."}
                    </span>
                  </div>

                  <div className="ib-field">
                    <label className="ib-field__label" htmlFor="idBack">
                      Upload back of ID
                    </label>
                    <input
                      id="idBack"
                      className="ib-input ib-input--file"
                      type="file"
                      name="idBack"
                      accept="image/*"
                      onChange={(event) => {
                        setIdBack(event.target.files?.[0] ?? null);
                        setError("");
                      }}
                    />
                    <span className="ib-field__hint">
                      {idBack ? idBack.name : "PNG or JPG, up to 5 MB."}
                    </span>
                  </div>
                </div>
              </>
            ) : null}

            <div className="ib-field">
              <label className="ib-field__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="ib-input"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                aria-invalid={error ? "true" : undefined}
              />
            </div>

            <div className="ib-field">
              <label className="ib-field__label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="ib-input"
                type="password"
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                aria-invalid={error ? "true" : undefined}
              />
            </div>

            {error ? (
              <p className="ib-field__error" role="alert">
                {error}
              </p>
            ) : null}

            {info ? (
              <p className="ib-field__hint" role="status">
                {info}
              </p>
            ) : null}

            <button
              type="submit"
              className="ib-btn ib-btn--primary ib-btn--block"
              disabled={submitting}
            >
              {submitting
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <div className="ib-auth__switch">
            {mode === "signin" ? (
              <>
                <span className="ib-auth__switch-title">New to Industry Bank?</span>
                <button
                  type="button"
                  className="ib-link-btn"
                  onClick={() => switchMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                <span className="ib-auth__switch-title">Already have an account?</span>
                <button
                  type="button"
                  className="ib-link-btn"
                  onClick={() => switchMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <p className="ib-auth__fineprint">
            <LockIcon />
            Your connection is encrypted and secure.
          </p>
        </div>
      </main>
    </div>
  );
}
