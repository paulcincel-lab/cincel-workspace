/**
 * Diff a parent's incoming child list against what's persisted, keyed by a
 * natural key, so a parent edit only touches the rows that actually changed
 * (instead of delete-all + reinsert, which churns `created_at` on every save).
 */
export type ChildDiff<Incoming> = {
  toInsert: Incoming[];
  toDeleteIds: string[];
};

export function diffChildRows<Persisted extends { id: string }, Incoming>(
  persisted: Persisted[],
  incoming: Incoming[],
  keyOfPersisted: (row: Persisted) => string,
  keyOfIncoming: (row: Incoming) => string
): ChildDiff<Incoming> {
  const persistedByKey = new Map<string, Persisted>();
  for (const row of persisted) {
    const k = keyOfPersisted(row);
    if (k && !persistedByKey.has(k)) persistedByKey.set(k, row);
  }

  const seenIncoming = new Set<string>();
  const toInsert: Incoming[] = [];
  for (const row of incoming) {
    const k = keyOfIncoming(row);
    if (!k || seenIncoming.has(k)) continue;
    seenIncoming.add(k);
    if (!persistedByKey.has(k)) toInsert.push(row);
  }

  const toDeleteIds: string[] = [];
  for (const [k, row] of persistedByKey) {
    if (!seenIncoming.has(k)) toDeleteIds.push(row.id);
  }

  return { toInsert, toDeleteIds };
}
