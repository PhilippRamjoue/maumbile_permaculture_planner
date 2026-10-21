import type { LoginRequest, RegisterRequest, User } from "../../entities/user";
import { apiFetch } from "../../shared/api/client";

export const authApi = {
  me: () => apiFetch<User>("/auth/me"),
  login: (body: LoginRequest) => apiFetch<User>("/auth/login", { method: "POST", body }),
  register: (body: RegisterRequest) => apiFetch<User>("/auth/register", { method: "POST", body }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
};
