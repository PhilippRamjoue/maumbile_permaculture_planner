import { ApiError } from "../../shared/api/client";

/** Message for a failed auth request, friendly for the common cases. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
    return error.userMessage;
  }
  return "Could not reach the server. Check your connection and try again.";
}
