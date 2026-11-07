/**
 * Owner-scoped CRUD helper (redesign BE §8.0.3). Every Mi espacio table, the
 * notifications, Gmail threads, assistant threads and a person's own time
 * entries are instances of it: owner checks live in one place. A row owned
 * by another staff → `FORBIDDEN`, a missing row → `NOT_FOUND`; `staffId`
 * always comes from the session argument.
 *
 * Soft-deleted rows (`deleted_at` set) count as missing unless the call
 * passes `{ includeDeleted: true }` (restore paths such as
 * `restoreNoteAction`). Errors are `Error("CODE: <table>")`, read by
 * `actionErrorCode` / `actionErrorText` in `lib/errors.ts`.
 */
import { and, desc, eq, getTableColumns, getTableName, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { FlowExecutor, FlowTx } from "@/lib/project-flow/db";

/** The executor owner-scoped repositories take (the app's `db` or an open transaction). */
export type OwnerDb = FlowExecutor;

export type OwnerScopedTable = PgTable & { staffId: AnyPgColumn; id: AnyPgColumn; deletedAt?: AnyPgColumn };

/**
 * `where` is ANDed with the owner filter; `orderBy` defaults to newest first
 * (`created_at desc, id desc`); `cursor` is the opaque value returned by
 * {@link nextOwnerCursor} for the previous page; soft-deleted rows are left
 * out unless `includeDeleted`.
 */
export type OwnerListOptions = {
  where?: SQL;
  orderBy?: SQL[];
  limit?: number;
  cursor?: string;
  includeDeleted?: boolean;
};

/** Options of the single-row calls. */
export type OwnerRowOptions = { includeDeleted?: boolean };

export type OwnerScoped<T extends OwnerScopedTable> = {
  list(db: OwnerDb, staffId: string, opts?: OwnerListOptions): Promise<T["$inferSelect"][]>;
  get(db: OwnerDb, staffId: string, id: string, opts?: OwnerRowOptions): Promise<T["$inferSelect"]>;
  insert(db: OwnerDb, staffId: string, values: Omit<T["$inferInsert"], "staffId">): Promise<T["$inferSelect"]>;
  update(
    db: OwnerDb,
    staffId: string,
    id: string,
    patch: Partial<T["$inferInsert"]>,
    opts?: OwnerRowOptions,
  ): Promise<T["$inferSelect"]>;
  /** Uses `deletedAt`; tables without it refuse. */
  softDelete(db: OwnerDb, staffId: string, id: string): Promise<void>;
  /** `select … for update` (time entries, checklist reorder). */
  lockForUpdate(tx: FlowTx, staffId: string, id: string, opts?: OwnerRowOptions): Promise<T["$inferSelect"]>;
};

/** Upper bound of one `list` page. */
export const OWNER_LIST_MAX = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,9}$/.test(cursor)) throw new Error("INVALID: cursor");
  return Number(cursor);
}

/** The cursor of the page after `rows`, or null when `rows` was the last page. */
export function nextOwnerCursor(
  opts: Pick<OwnerListOptions, "limit" | "cursor">,
  rows: readonly unknown[],
): string | null {
  if (!opts.limit || rows.length < opts.limit) return null;
  return String(decodeCursor(opts.cursor) + rows.length);
}

/** Drops the owner and primary key (never settable through the helper) and undefined fields. */
function writableFields(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "staffId" || key === "id" || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function ownerScoped<T extends OwnerScopedTable>(table: T): OwnerScoped<T> {
  type Row = T["$inferSelect"];

  const name = getTableName(table);
  const columns = getTableColumns(table) as Record<string, AnyPgColumn | undefined>;
  const idCol = columns.id!;
  const staffCol = columns.staffId!;
  const deletedCol = columns.deletedAt ?? null;
  const createdCol = columns.createdAt ?? null;
  const uuidId = idCol.columnType === "PgUUID";

  const fail = (code: "FORBIDDEN" | "NOT_FOUND"): never => {
    throw new Error(`${code}: ${name}`);
  };

  /** A uuid primary key never matches a malformed id; skip the query (Postgres would raise). */
  const assertId = (id: string) => {
    if (typeof id !== "string" || id === "" || (uuidId && !UUID_RE.test(id))) fail("NOT_FOUND");
  };

  const live = (includeDeleted?: boolean): SQL | undefined =>
    deletedCol && !includeDeleted ? isNull(deletedCol) : undefined;

  const ownRow = (staffId: string, id: string, includeDeleted?: boolean) =>
    and(eq(idCol, id), eq(staffCol, staffId), live(includeDeleted));

  /** The caller's row is not there: tell `FORBIDDEN` (someone else's) from `NOT_FOUND`. */
  const explainMiss = async (db: OwnerDb, id: string, includeDeleted?: boolean): Promise<never> => {
    const other = await db
      .select({ id: idCol })
      .from(table as PgTable)
      .where(and(eq(idCol, id), live(includeDeleted)))
      .limit(1);
    return fail(other.length > 0 ? "FORBIDDEN" : "NOT_FOUND");
  };

  const selectOwn = async (
    db: OwnerDb,
    staffId: string,
    id: string,
    includeDeleted: boolean | undefined,
    lock: boolean,
  ): Promise<Row> => {
    let query = db
      .select()
      .from(table as PgTable)
      .where(ownRow(staffId, id, includeDeleted))
      .$dynamic();
    if (lock) query = query.for("update");
    const rows = (await query.limit(1)) as Row[];
    return rows[0] ?? (await explainMiss(db, id, includeDeleted));
  };

  return {
    async list(db, staffId, opts = {}) {
      const offset = decodeCursor(opts.cursor);
      const order = opts.orderBy?.length ? opts.orderBy : [...(createdCol ? [desc(createdCol)] : []), desc(idCol)];
      let query = db
        .select()
        .from(table as PgTable)
        .where(and(eq(staffCol, staffId), live(opts.includeDeleted), opts.where))
        .orderBy(...order)
        .$dynamic();
      if (opts.limit !== undefined) {
        if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error("INVALID: limit");
        query = query.limit(Math.min(opts.limit, OWNER_LIST_MAX));
      }
      if (offset > 0) query = query.offset(offset);
      return (await query) as Row[];
    },

    async get(db, staffId, id, opts = {}) {
      assertId(id);
      return selectOwn(db, staffId, id, opts.includeDeleted, false);
    },

    async insert(db, staffId, values) {
      // The owner is the session argument, whatever the values carry.
      const row = { ...(values as Record<string, unknown>), staffId };
      const inserted = (await db
        .insert(table as PgTable)
        .values(row as never)
        .returning()) as Row[];
      return inserted[0]!;
    },

    async update(db, staffId, id, patch, opts = {}) {
      assertId(id);
      const set = writableFields(patch as Record<string, unknown>);
      if (Object.keys(set).length === 0) return selectOwn(db, staffId, id, opts.includeDeleted, false);
      const updated = (await db
        .update(table as PgTable)
        .set(set as never)
        .where(ownRow(staffId, id, opts.includeDeleted))
        .returning()) as Row[];
      return updated[0] ?? (await explainMiss(db, id, opts.includeDeleted));
    },

    async softDelete(db, staffId, id) {
      if (!deletedCol) throw new Error(`INVALID: ${name} has no deleted_at`);
      assertId(id);
      const deleted = await db
        .update(table as PgTable)
        .set({ deletedAt: new Date() } as never)
        .where(ownRow(staffId, id))
        .returning({ id: idCol });
      if (deleted.length === 0) await explainMiss(db, id);
    },

    async lockForUpdate(tx, staffId, id, opts = {}) {
      assertId(id);
      return selectOwn(tx, staffId, id, opts.includeDeleted, true);
    },
  };
}
