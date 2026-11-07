"use server";

import { stubDefault } from "@/lib/stubs";
import type { SearchResult } from "@/lib/types/redesign";

/**
 * Global search (redesign BE §7.3, §8.9). Phase 1 stub returns no results.
 * Auth: staff, scoped like the list actions. Errors: `INVALID` (trimmed query
 * < 2), `RATE_LIMITED` (> 30/min).
 */
export async function searchWorkspaceAction(input: {
  query: string;
  types?: SearchResult["type"][];
  limit?: number;
}): Promise<SearchResult[]> {
  return stubDefault<SearchResult[]>([], input);
}
