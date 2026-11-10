import "server-only";

import { getDirectory, type DirectoryClient } from "@/lib/google/directory";
import { STALE } from "@/lib/query/keys";
import type { GroupMapping } from "@/lib/types/workspace-access";

/**
 * Directory facts of the mapped Workspace groups for Ajustes › Google (canvas
 * `Ajustes-Google`, "Grupos de Google"): whether each group still exists
 * (`groups.get`) and how many members it has (`members.list`, count only).
 * Cached per group email for the Google health check's TTL
 * (`STALE.ajustesGoogleHealth`), so a page load does not call the Directory
 * again within it. A failed lookup leaves both facts null and is not cached;
 * the Estado row "Último error del Directorio" keeps reporting as before.
 */

export type GroupStats = Pick<GroupMapping, "memberCount" | "exists">;

const UNCHECKED: GroupStats = { memberCount: null, exists: null };

type CacheEntry = { at: number; stats: GroupStats };

const cache = new Map<string, CacheEntry>();

/** Tests: forget every cached group. */
export function clearGroupStatsCache(): void {
  cache.clear();
}

async function lookup(directory: DirectoryClient, email: string): Promise<GroupStats> {
  const group = await directory.getGroup(email);
  if (!group) return { memberCount: null, exists: false };
  return { memberCount: await directory.countMembers(group.id), exists: true };
}

export type GroupStatsOptions = {
  /** Defaults to the app's Directory client; null when the service account isn't set up. */
  directory?: DirectoryClient | null;
  now?: () => number;
  ttlMs?: number;
};

/**
 * The mappings with `memberCount` and `exists` filled from the Directory
 * (cached), in parallel. Without a Directory client every mapping stays
 * unchecked (null).
 */
export async function withGroupStats(mappings: GroupMapping[], options: GroupStatsOptions = {}): Promise<GroupMapping[]> {
  const directory = options.directory === undefined ? getDirectory() : options.directory;
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? STALE.ajustesGoogleHealth;
  if (!directory || mappings.length === 0) return mappings.map((mapping) => ({ ...mapping, ...UNCHECKED }));

  const emails = [...new Set(mappings.map((mapping) => mapping.groupEmail.trim().toLowerCase()))];
  const entries = await Promise.all(
    emails.map(async (email): Promise<[string, GroupStats]> => {
      const hit = cache.get(email);
      if (hit && now() - hit.at < ttl) return [email, hit.stats];
      try {
        const stats = await lookup(directory, email);
        cache.set(email, { at: now(), stats });
        return [email, stats];
      } catch (error) {
        console.error("[ajustes/google] group stats", error);
        return [email, UNCHECKED];
      }
    }),
  );
  const byEmail = new Map(entries);
  return mappings.map((mapping) => ({
    ...mapping,
    ...(byEmail.get(mapping.groupEmail.trim().toLowerCase()) ?? UNCHECKED),
  }));
}
