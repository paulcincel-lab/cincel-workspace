import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * postgres.js is lazy — no socket is opened until the first query — so
 * constructing this at import time is safe during `next build` (which has no
 * DATABASE_URL and never issues a query for a cookie-less request). A missing
 * DATABASE_URL only surfaces as an error on the first real query.
 */
const globalForDb = globalThis as unknown as {
  __cincelSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__cincelSql ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: 10,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__cincelSql = sql;
}

export const db = drizzle(sql, { schema });

export { schema };
