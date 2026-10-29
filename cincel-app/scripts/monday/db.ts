/**
 * Database client for the monday migration CLI.
 *
 * The app's client (lib/db/client.ts) imports `server-only`, which throws
 * under plain `tsx`, so the CLI builds its own drizzle client like
 * scripts/seed.ts: postgres-js with a single connection. Nothing here may
 * import `server-only` or lib/db/client.ts.
 *
 * Against production, DATABASE_URL points at the prod database through an
 * SSH tunnel (docs/specs/monday-migration/backend.md §2.1).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../../lib/db/schema";

export const DEFAULT_DATABASE_URL = "postgres://cincel:cincel@localhost:5432/cincel";

export type MondayDb = ReturnType<typeof drizzle<typeof schema>>;

export interface MondayDbHandle {
  db: MondayDb;
  /** The underlying postgres-js client. */
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Creates the CLI's own drizzle client. The connection is opened lazily on
 * the first query; call `close()` when the command is done so the process
 * can exit.
 */
export function createMondayDb(
  connectionString: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): MondayDbHandle {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
