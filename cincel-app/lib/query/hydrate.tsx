import { HydrationBoundary, dehydrate, defaultShouldDehydrateQuery, type QueryClient } from "@tanstack/react-query";

/**
 * Hands a server `QueryClient`'s cache to the client. Pending queries are
 * dehydrated too, so `void prefetch(...)` streams its result instead of the
 * client fetching again.
 *
 * Security (plan §4.8 rule 2): the dehydrated state is serialized into the
 * page HTML. It is public to anyone who can load the page, so loaders strip
 * admin-only fields before they reach the cache; components never do.
 */
export function Hydrate({ qc, children }: { qc: QueryClient; children: React.ReactNode }) {
  return <HydrationBoundary state={dehydrateQueries(qc)}>{children}</HydrationBoundary>;
}

/** The dehydrate call `<Hydrate>` makes: successful queries plus the pending ones. */
export function dehydrateQueries(qc: QueryClient) {
  return dehydrate(qc, {
    shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) || q.state.status === "pending",
  });
}
