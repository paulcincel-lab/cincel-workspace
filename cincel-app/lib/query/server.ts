import "server-only";

import { cache } from "react";
import type { FetchQueryOptions, QueryClient, QueryKey } from "@tanstack/react-query";

import { makeQueryClient } from "./client";

/**
 * Request-scoped `QueryClient` for Server Components: every component of one
 * request gets the same client, so a layout and a page can prefetch into one
 * cache and dehydrate once.
 */
export const getQueryClient = cache(makeQueryClient);

/**
 * Prefetches one query on the server by calling its **loader directly**,
 * under the same key the client's `queryOptions` use. No action POST and no
 * second session check: the page already resolved the viewer and passes it
 * to the loader.
 *
 * Security (plan §4.8 rule 2): whatever the loader returns is dehydrated into
 * the page HTML, which is public to whoever loads the page. Strip admin-only
 * fields **in the loader**, never in a component. A loader returns only what
 * the viewer may see.
 *
 * `await prefetch(...)` renders the data in the first HTML; `void prefetch(...)`
 * streams it (the pending query is dehydrated by `<Hydrate>`).
 */
export function prefetch<TData>(
  qc: QueryClient,
  options: { queryKey: QueryKey; staleTime?: FetchQueryOptions<TData, Error, TData, QueryKey>["staleTime"] },
  loader: () => Promise<NoInfer<TData>>,
): Promise<void> {
  return qc.prefetchQuery<TData, Error, TData, QueryKey>({
    queryKey: options.queryKey,
    queryFn: loader,
    ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
  });
}
