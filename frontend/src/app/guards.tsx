import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useCurrentUser } from "../features/auth";

/** Routes that need a signed-in user; anonymous visitors are sent to /login and returned after. */
export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <p role="status">Loading…</p>;
  if (isError) {
    return (
      <div role="alert" className="notice notice--error">
        <p>Could not reach the server.</p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <Outlet />;
}

/** Login / register: already signed-in users go straight to the dashboard. */
export function GuestOnly() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <p role="status">Loading…</p>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
