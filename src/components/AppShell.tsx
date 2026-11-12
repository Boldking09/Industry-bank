import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import Brand from "./Brand";

export default function AppShell() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = session
    ? session.name
        .split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "IB";

  function handleSignOut() {
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Brand />
          <nav className="nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/transfer"
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Transfer
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Profile
            </NavLink>
            <NavLink
              to="/support"
              className={({ isActive }) =>
                isActive ? "nav__link nav__link--active" : "nav__link"
              }
            >
              Support
            </NavLink>
          </nav>
          <div className="user">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="user__meta">
              <span className="user__name">{session?.name}</span>
              <span className="user__email">{session?.email}</span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Industry Bank. All rights reserved.</p>
      </footer>
    </div>
  );
}
