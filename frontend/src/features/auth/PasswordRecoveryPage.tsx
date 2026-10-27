import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../shared/api/client";
import { TextField } from "../../shared/ui/TextField";
import { ME_QUERY_KEY } from "./hooks";

export function PasswordRecoveryPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["password-recovery-status"],
    queryFn: () => apiFetch<{ enabled: boolean }>("/auth/recovery/status"),
    enabled: !token,
  });
  const reset = useMutation({
    mutationFn: async () => {
      if (token) {
        await apiFetch<void>("/auth/password-reset/confirm", {
          method: "POST",
          body: { token, password },
          refreshOn401: false,
        });
        queryClient.clear();
        queryClient.setQueryData(ME_QUERY_KEY, null);
        navigate("/login", { replace: true, state: { passwordReset: true } });
      } else {
        return apiFetch<{ message: string }>("/auth/password-reset", {
          method: "POST",
          body: { email: email.trim() },
          refreshOn401: false,
        });
      }
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!token || password === confirmation) reset.mutate();
  };
  return (
    <section className="card auth-card">
      <h1>{token ? "Choose a new password" : "Reset your password"}</h1>
      {status.data?.enabled === false ? (
        <p role="status">
          Email recovery is not configured on this instance. Contact the operator privately for
          help.
        </p>
      ) : reset.isSuccess && !token ? (
        <p role="status">{reset.data?.message}</p>
      ) : (
        <form className="form" onSubmit={submit}>
          {token ? (
            <>
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              {confirmation && confirmation !== password && (
                <p role="alert">The passwords do not match.</p>
              )}
            </>
          ) : (
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
          <button
            className="btn btn--primary"
            disabled={
              reset.isPending ||
              (!!token && password !== confirmation) ||
              (!token && !status.data?.enabled)
            }
          >
            {reset.isPending ? "Please wait…" : token ? "Reset password" : "Email a reset link"}
          </button>
        </form>
      )}
      {reset.isError && (
        <p role="alert">
          {reset.error instanceof ApiError
            ? reset.error.userMessage
            : "Could not reach the server. Try again."}
        </p>
      )}
      {status.isError && (
        <p role="alert">
          Could not check recovery availability. Please reload or contact the operator.
        </p>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  );
}
