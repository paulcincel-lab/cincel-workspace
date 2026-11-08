import { QueryClient } from "@tanstack/react-query";

/**
 * The one `QueryClient` factory, shared by the browser provider and the
 * request-scoped server client (`lib/query/server.ts`). Defaults from plan
 * §4.5: 30 s stale (aligned with `staleTimes.dynamic`), 5 min gc, no focus
 * refetch unless a query opts in, one retry for queries and none for
 * mutations (a mutation is never repeated behind the user's back).
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
