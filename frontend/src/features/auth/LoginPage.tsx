import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { TextField } from "../../shared/ui/TextField";
import { authErrorMessage } from "./errors";
import { useLogin } from "./hooks";
import { redirectTarget } from "./redirect";

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(redirectTarget(location.state), { replace: true }) },
    );
  }

  return (
    <section className="card auth-card">
      <h1>Sign in</h1>
      <form onSubmit={onSubmit} className="form">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.isError ? (
          <p role="alert" className="form__error">
            {authErrorMessage(login.error)}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </section>
  );
}
