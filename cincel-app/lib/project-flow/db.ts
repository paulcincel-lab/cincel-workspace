import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import type * as schema from "@/lib/db/schema";

/**
 * Database handles the project flow modules take as their first parameter
 * (BE §2). No `server-only` import here: the app passes `db` from
 * lib/db/client.ts, the scripts (monday CLI, report) pass their own client.
 */
type Schema = typeof schema;

export type FlowDb = PostgresJsDatabase<Schema>;
export type FlowTx = PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Either the client or an open transaction. */
export type FlowExecutor = FlowDb | FlowTx;
