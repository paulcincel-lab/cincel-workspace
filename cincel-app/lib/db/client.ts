import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Configure it in .env (see .env.example) — " +
      "the local docker-compose default is postgres://cincel:cincel@localhost:5432/cincel"
  );
}

/**
 * Reuse a single postgres.js connection pool across hot reloads in dev.
 */
const globalForDb = globalThis as unknown as {
  __cincelSql?: ReturnType<typeof postgres>;
};

const sql = globalForDb.__cincelSql ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__cincelSql = sql;
}

export const db = drizzle(sql, { schema });

export { schema };
