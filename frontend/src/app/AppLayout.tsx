import { Link, Outlet, useNavigate } from "react-router-dom";

import { useCurrentUser, useLogout } from "../features/auth";

export function AppLayout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="shell__header">
        <Link to="/" className="shell__brand">
          Maumbile
          <span className="shell__tagline"> — design your land</span>
        </Link>
        <nav aria-label="Main" className="shell__nav">
          {user ? <Link to="/">My sites</Link> : null}
          <Link to="/credits">Data sources &amp; credits</Link>
          {user ? (
            <>
              <span className="muted" data-testid="current-user">
                {user.display_name || user.email}
              </span>
              <button
                type="button"
                className="btn"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
      <footer className="shell__footer" aria-label="Legal">
        <Link to="/terms">Terms</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
