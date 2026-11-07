/**
 * Workspace search (redesign BE §8.9): one query per type in parallel, merged
 * and ranked (exact 3, prefix 2, word-start 1.5, contains 1, + similarity),
 * scoped like the list actions; contacts only with `clients.canViewClients`;
 * owner-only notes; admin data only with `canSeeAdminData`.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notImplemented } from "@/lib/stubs";
import type { SearchResult, SearchResultType } from "@/lib/types/redesign";

export async function searchWorkspace(
  user: AuthenticatedUser,
  input: { query: string; types?: SearchResultType[]; limit?: number },
): Promise<SearchResult[]> {
  return notImplemented("searchWorkspace", user, input);
}
