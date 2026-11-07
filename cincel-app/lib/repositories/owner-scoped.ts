/**
 * Owner-scoped CRUD helper (redesign BE §8.0.3). Every Mi espacio table, the
 * notifications, Gmail threads, assistant threads and a person's own time
 * entries are instances of it: owner checks live in one place. A row owned
 * by another staff → `FORBIDDEN`, a missing row → `NOT_FOUND`; `staffId`
 * always comes from the session argument.
 */
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { FlowExecutor, FlowTx } from "@/lib/project-flow/db";
import { notImplemented } from "@/lib/stubs";

/** The executor owner-scoped repositories take (the app's `db` or an open transaction). */
export type OwnerDb = FlowExecutor;

export type OwnerScopedTable = PgTable & { staffId: AnyPgColumn; id: AnyPgColumn; deletedAt?: AnyPgColumn };

export type OwnerListOptions = { where?: SQL; orderBy?: SQL[]; limit?: number; cursor?: string };

export type OwnerScoped<T extends OwnerScopedTable> = {
  list(db: OwnerDb, staffId: string, opts?: OwnerListOptions): Promise<T["$inferSelect"][]>;
  get(db: OwnerDb, staffId: string, id: string): Promise<T["$inferSelect"]>;
  insert(db: OwnerDb, staffId: string, values: Omit<T["$inferInsert"], "staffId">): Promise<T["$inferSelect"]>;
  update(db: OwnerDb, staffId: string, id: string, patch: Partial<T["$inferInsert"]>): Promise<T["$inferSelect"]>;
  /** Uses `deletedAt`; tables without it refuse. */
  softDelete(db: OwnerDb, staffId: string, id: string): Promise<void>;
  /** `select … for update` (time entries, checklist reorder). */
  lockForUpdate(tx: FlowTx, staffId: string, id: string): Promise<T["$inferSelect"]>;
};

export function ownerScoped<T extends OwnerScopedTable>(table: T): OwnerScoped<T> {
  return {
    list: (db, staffId, opts) => notImplemented("ownerScoped.list", table, db, staffId, opts),
    get: (db, staffId, id) => notImplemented("ownerScoped.get", table, db, staffId, id),
    insert: (db, staffId, values) => notImplemented("ownerScoped.insert", table, db, staffId, values),
    update: (db, staffId, id, patch) => notImplemented("ownerScoped.update", table, db, staffId, id, patch),
    softDelete: (db, staffId, id) => notImplemented("ownerScoped.softDelete", table, db, staffId, id),
    lockForUpdate: (tx, staffId, id) => notImplemented("ownerScoped.lockForUpdate", table, tx, staffId, id),
  };
}
