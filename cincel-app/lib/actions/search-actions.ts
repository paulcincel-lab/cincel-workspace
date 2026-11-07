"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { searchRateLimiter, searchWorkspace } from "@/lib/search/search";
import type { SearchResult } from "@/lib/types/redesign";
import { parseInput } from "@/lib/validation/project-flow";
import { SearchInputSchema } from "@/lib/validation/redesign";

/**
 * Global search (redesign BE §7.3, §8.9). Auth: staff, scoped like the list
 * actions. Errors: `INVALID` (trimmed query < 2, limit outside 1–50),
 * `RATE_LIMITED` (> 30/min per staff member).
 */
export async function searchWorkspaceAction(input: {
  query: string;
  types?: SearchResult["type"][];
  limit?: number;
}): Promise<SearchResult[]> {
  const user = await requireCapabilityUser();
  const parsed = parseInput(SearchInputSchema, input);
  if (!searchRateLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");
  return searchWorkspace(user, parsed);
}
