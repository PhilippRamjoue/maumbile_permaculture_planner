import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useRef } from "react";

import { useCurrentUser } from "../features/auth";

/** Routes that need a signed-in user; anonymous visitors are sent to /login and returned after. */
export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useCurrentUser();
  const location = useLocation();
  const hadSession = useRef(false);
  if (user) hadSession.current = true;
  // A session can expire while a plan has an unsaved in-memory draft. Keep that mounted
  // instance available for recovery/retry; new anonymous visits still go to sign-in.
  const keepDraft = hadSession.current && /^\/sites\/[^/]+\/design\/[^/]+$/.test(location.pathname);

  if (isPending && !keepDraft) return <p role="status">Loading…</p>;
  if (isError && !user && !keepDraft) {
    return (
      <div role="alert" className="notice notice--error">
        <p>Could not reach the server.</p>
        <button type="button" className="btn" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (!user && !keepDraft) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return (
    <>
      {!user && keepDraft && (
        <p role="alert">
          Your session expired. Your draft is still here.{" "}
          <a href="/login" target="_blank" rel="noopener noreferrer">
            Sign in in another tab
          </a>
          , then{" "}
          <button type="button" className="btn" onClick={() => void refetch()}>
            Check session
          </button>{" "}
          and retry saving.
        </p>
      )}
      {isError && <p role="alert">Could not refresh your session. Your draft is still here.</p>}
      <Outlet />
    </>
  );
}

/** Login / register: already signed-in users go straight to the dashboard. */
export function GuestOnly() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending) return <p role="status">Loading…</p>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
