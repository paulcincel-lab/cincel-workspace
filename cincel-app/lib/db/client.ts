import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazily-created postgres.js pool + Drizzle instance. The connection is not
 * opened until the first query, so importing this module during `next build`
 * (which has no DATABASE_URL) does not fail.
 */
const globalForDb = globalThis as unknown as {
  __cincelSql?: ReturnType<typeof postgres>;
  __cincelDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSql() {
  if (globalForDb.__cincelSql) return globalForDb.__cincelSql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env (see .env.example) — " +
        "local docker-compose default: postgres://cincel:cincel@localhost:5432/cincel"
    );
  }

  const sql = postgres(connectionString, { max: 10 });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__cincelSql = sql;
  }
  return sql;
}

function getDb() {
  if (globalForDb.__cincelDb) return globalForDb.__cincelDb;
  const instance = drizzle(getSql(), { schema });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__cincelDb = instance;
  }
  return instance;
}

/**
 * Drizzle client. Proxy so `db.query` / `db.select()` etc. resolve the real
 * instance lazily on first access.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
