import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  useAuth,
} from "../state/AuthContext";

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");

  if (session) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signIn(email, password);
    if (result.ok) {
      navigate(from, { replace: true });
      return;
    }
    setError(result.message ?? "Unable to sign in.");
  }

  return (
    <div className="auth">
      <aside className="auth__aside">
        <Brand className="auth__brand" to="/login" />
        <div>
          <p className="auth__eyebrow">Personal banking</p>
          <h1 className="auth__title">Banking that works as hard as you do.</h1>
          <p className="auth__lede">
            One clear view of your accounts, spending, and transfers. Built as a
            fictional product to demonstrate a modern banking experience.
          </p>
          <ul className="auth__points">
            <li className="auth__point">Real-time balances across every account</li>
            <li className="auth__point">Transfers in a few focused steps</li>
            <li className="auth__point">Clear activity, without the clutter</li>
          </ul>
        </div>
        <p className="auth__footnote">
          Demo environment. No real money or personal data is involved.
        </p>
      </aside>

      <section className="auth__panel">
        <div className="auth__form-wrap">
          <Brand className="auth__panel-brand" to="/login" />
          <p className="auth__eyebrow auth__eyebrow--dark">Welcome back</p>
          <h2 className="auth__form-title">Sign in</h2>
          <p className="auth__form-sub">
            Use the demo credentials below to explore the dashboard.
          </p>

          <form className="auth__form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
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

            <div className="field">
              <label className="field__label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                aria-invalid={error ? "true" : undefined}
              />
            </div>

            {error ? (
              <p className="field__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn btn--primary btn--block">
              Sign in
            </button>
          </form>

          <div className="demo-note">
            <p className="demo-note__title">Demo credentials</p>
            <div className="demo-note__row">
              <span>Email</span>
              <code>{DEMO_EMAIL}</code>
            </div>
            <div className="demo-note__row">
              <span>Password</span>
              <code>{DEMO_PASSWORD}</code>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
                setError("");
              }}
            >
              Fill demo credentials
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
