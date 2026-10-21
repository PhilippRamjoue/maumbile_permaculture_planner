import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { TextField } from "../../shared/ui/TextField";
import { authErrorMessage } from "./errors";
import { useRegister } from "./hooks";

const PASSWORD_MIN_LENGTH = 8;

export function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    register.mutate(
      {
        email: email.trim(),
        password,
        display_name: displayName.trim() || undefined,
        country_code: countryCode.trim().toUpperCase() || undefined,
      },
      { onSuccess: () => navigate("/", { replace: true }) },
    );
  }

  return (
    <section className="card auth-card">
      <h1>Create your account</h1>
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
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Name (optional)"
          autoComplete="name"
          maxLength={100}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label="Country code (optional)"
          maxLength={2}
          pattern="[A-Za-z]{2}"
          hint="Two letters, e.g. KE for Kenya or TZ for Tanzania."
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
        />
        {register.isError ? (
          <p role="alert" className="form__error">
            {authErrorMessage(register.error)}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={register.isPending}>
          {register.isPending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="muted">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
