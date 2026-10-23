import { ApiError } from "../../shared/api/client";

/** A sentence for the user from whatever a failed request threw. */
export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "Something went wrong.";
