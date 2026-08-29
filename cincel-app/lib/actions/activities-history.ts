import type { Task } from "@/lib/types/task";

export type PersistedHistoryRow = {
  legacyId: number | null;
  eventDate: string | null;
  authorNameSnapshot: string | null;
  comment: string;
};

const idKey = (legacyId: number | null | undefined): string | null =>
  legacyId == null ? null : `id:${legacyId}`;

const contentKey = (
  eventDate: string | null | undefined,
  author: string | null | undefined,
  comment: string
): string => `k:${eventDate ?? ""}|${author ?? ""}|${comment}`;

/**
 * Given the history already in the DB and the client's full history array,
 * return only the entries not persisted yet. Append-only: entries the client
 * dropped are ignored, never deleted (AGENTS.md — "Nunca eliminar historial").
 *
 * An incoming entry is considered "already persisted" if either its legacy id
 * OR its (date, author, comment) matches a persisted row — the second check
 * covers rows first written without a legacy id (which later gain one).
 */
export function selectNewHistoryEntries(
  persisted: PersistedHistoryRow[],
  incoming: Task["history"]
): Task["history"] {
  const seen = new Set<string>();
  for (const p of persisted) {
    const k = idKey(p.legacyId);
    if (k) seen.add(k);
    seen.add(contentKey(p.eventDate, p.authorNameSnapshot, p.comment));
  }

  const out: Task["history"] = [];
  for (const h of incoming) {
    const numericId = typeof h.id === "number" ? h.id : null;
    const k1 = idKey(numericId);
    const k2 = contentKey(h.date || null, h.author || null, h.comment);
    if ((k1 && seen.has(k1)) || seen.has(k2)) continue;
    if (k1) seen.add(k1);
    seen.add(k2);
    out.push(h);
  }
  return out;
}
