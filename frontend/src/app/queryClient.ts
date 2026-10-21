import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "../shared/api/client";

/** Fresh client per app/test instance. Client errors (4xx) are answers, not worth retrying. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}
