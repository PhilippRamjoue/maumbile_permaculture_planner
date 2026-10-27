import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LoginRequest, RegisterRequest, User } from "../../entities/user";
import { ApiError } from "../../shared/api/client";
import { authApi } from "./api";
import { clearAllSetupDrafts } from "../site-setup/draftRecovery";

export const ME_QUERY_KEY = ["auth", "me"] as const;

/** The signed-in user, or `null` when anonymous. A 401 is an answer here, not an error. */
export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<User, Error, LoginRequest>({
    mutationFn: authApi.login,
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

/** Registration does not start a session on the backend, so sign in right after. */
export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation<User, Error, RegisterRequest>({
    mutationFn: async (body) => {
      await authApi.register(body);
      return authApi.login({ email: body.email, password: body.password });
    },
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearAllSetupDrafts();
      // Drop everything owned by the previous user, then record the anonymous state.
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}
