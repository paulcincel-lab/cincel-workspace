/**
 * Helpers over `core.import_refs`: the map from a source id (a monday item,
 * group, update, asset…) to the Cincel row an import created for it
 * (docs/specs/monday-migration/backend.md §2, §8).
 *
 * Every function takes `db` as a parameter, so the same code runs with the
 * app's drizzle client, the monday CLI's own client (scripts/monday/db.ts) or
 * a transaction of either. Nothing in lib/import may import the app's db
 * client module or the RSC-only guard package; tests/unit/monday/refs.test.ts
 * checks this.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "../db/schema";
import { importRefs, type ImportRef, type NewImportRef } from "../db/schema/import";

/** Any drizzle Postgres client or transaction over the full schema. */
export type ImportDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The Cincel tables an import ref can point at (BE §8). */
export const IMPORT_ENTITIES = [
  "contact",
  "contact_person",
  "provider_profile",
  "project",
  "project_schedule",
  "task",
  "checklist_item",
  "task_support",
  "task_dependency",
  "history_event",
  "schedule_task",
  "task_link",
  "project_link",
  "drive_file",
] as const;

export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** The primary key of an import ref. */
export interface ImportRefKey {
  source: string;
  entity: ImportEntity;
  externalId: string;
}

/** A row to insert. `createdAt` is always the database default. */
export type ImportRefInput = Omit<NewImportRef, "entity" | "createdAt"> & {
  entity: ImportEntity;
};

/**
 * Rows per INSERT / ids per IN list. Postgres caps a statement at 65,535
 * bind parameters; an import ref insert uses 7 per row.
 */
export const IMPORT_REFS_CHUNK = 1000;

/** Thrown when a ref with the same (source, entity, external_id) exists. */
export class DuplicateImportRefError extends Error {
  readonly keys: ImportRefKey[];

  constructor(keys: ImportRefKey[], options?: { cause?: unknown }) {
    const first = keys[0];
    const what = first
      ? `${first.source}/${first.entity}/${first.externalId}`
      : "unknown key";
    const more = keys.length > 1 ? ` (and ${keys.length - 1} more in the batch)` : "";
    super(`import_refs: ${what} is already imported${more}`, options);
    this.name = "DuplicateImportRefError";
    this.keys = keys;
  }
}

const UNIQUE_VIOLATION = "23505";

/** Whether an error (or its `cause`, as drizzle wraps driver errors) is a unique violation. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function toRow(ref: ImportRefInput): NewImportRef {
  return {
    source: ref.source,
    entity: ref.entity,
    externalId: ref.externalId,
    rowId: ref.rowId,
    batchId: ref.batchId,
    data: ref.data ?? null,
    rowUpdatedAt: ref.rowUpdatedAt ?? null,
  };
}

function keyOf(ref: ImportRefInput): ImportRefKey {
  return { source: ref.source, entity: ref.entity, externalId: ref.externalId };
}

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/**
 * Inserts one import ref and returns the stored row.
 * @throws DuplicateImportRefError if the key is already in `import_refs`.
 */
export async function insertImportRef(db: ImportDb, ref: ImportRefInput): Promise<ImportRef> {
  try {
    const [row] = await db.insert(importRefs).values(toRow(ref)).returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateImportRefError([keyOf(ref)], { cause: err });
    throw err;
  }
}

/**
 * Inserts many import refs, in chunks of {@link IMPORT_REFS_CHUNK}, and
 * returns the stored rows in input order.
 *
 * A key repeated within `refs` is refused before anything is written. A key
 * already in the table fails the statement; run this inside a transaction to
 * keep earlier chunks from being committed on its own.
 * @throws DuplicateImportRefError on a repeated or existing key.
 */
export async function insertImportRefs(
  db: ImportDb,
  refs: readonly ImportRefInput[],
): Promise<ImportRef[]> {
  if (refs.length === 0) return [];

  const seen = new Set<string>();
  const repeated: ImportRefKey[] = [];
  for (const ref of refs) {
    const k = JSON.stringify([ref.source, ref.entity, ref.externalId]);
    if (seen.has(k)) repeated.push(keyOf(ref));
    seen.add(k);
  }
  if (repeated.length > 0) throw new DuplicateImportRefError(repeated);

  const rows: ImportRef[] = [];
  for (const chunk of chunks(refs, IMPORT_REFS_CHUNK)) {
    try {
      rows.push(...(await db.insert(importRefs).values(chunk.map(toRow)).returning()));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DuplicateImportRefError(chunk.map(keyOf), { cause: err });
      }
      throw err;
    }
  }
  return rows;
}

/** Looks up one import ref by its key; `null` when it was never imported. */
export async function findImportRef(db: ImportDb, key: ImportRefKey): Promise<ImportRef | null> {
  const [row] = await db
    .select()
    .from(importRefs)
    .where(
      and(
        eq(importRefs.source, key.source),
        eq(importRefs.entity, key.entity),
        eq(importRefs.externalId, key.externalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Looks up many import refs of one source and entity. The result is keyed by
 * `external_id`; ids that were never imported are absent from the map.
 */
export async function findImportRefs(
  db: ImportDb,
  source: string,
  entity: ImportEntity,
  externalIds: readonly string[],
): Promise<Map<string, ImportRef>> {
  const found = new Map<string, ImportRef>();
  const unique = [...new Set(externalIds)];
  for (const chunk of chunks(unique, IMPORT_REFS_CHUNK)) {
    const rows = await db
      .select()
      .from(importRefs)
      .where(
        and(
          eq(importRefs.source, source),
          eq(importRefs.entity, entity),
          inArray(importRefs.externalId, chunk),
        ),
      );
    for (const row of rows) found.set(row.externalId, row);
  }
  return found;
}
