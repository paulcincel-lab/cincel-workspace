/**
 * `countQueries(fn)`: how many SQL statements `fn` sends through the app's
 * Drizzle client (`lib/db/client.ts`). Used by every "≤ N q" acceptance
 * criterion of the Query Migration (plan §5, Measuring).
 *
 * It swaps the Drizzle session logger for the duration of `fn`, so it counts
 * every query builder, relational (`db.query.*`) and `db.execute` statement,
 * including those inside `db.transaction` (BEGIN/COMMIT are not statements
 * Drizzle logs). Calls must not overlap: run one `countQueries` at a time.
 *
 * The client is imported lazily, so a DB test can point `DATABASE_URL` at
 * `TEST_DATABASE_URL` before the first query.
 */
import type { Logger } from "drizzle-orm/logger";

export type CountedStatement = { sql: string; params: unknown[] };

export type CountQueriesResult<T> = { result: T; count: number; statements: CountedStatement[] };

type LoggedSession = { logger: Logger; options: { logger?: Logger } };

export async function countQueries<T>(fn: () => Promise<T>): Promise<CountQueriesResult<T>> {
  const { db } = await import("@/lib/db/client");
  const session = (db as unknown as { session: LoggedSession }).session;
  const statements: CountedStatement[] = [];
  const previous = session.logger;
  const previousOption = session.options.logger;
  const counting: Logger = {
    logQuery(query, params) {
      statements.push({ sql: query, params });
      previous.logQuery(query, params);
    },
  };
  session.logger = counting;
  // Transactions build a new session from `options`, so they pick the counter up there.
  session.options.logger = counting;
  try {
    const result = await fn();
    return { result, count: statements.length, statements };
  } finally {
    session.logger = previous;
    session.options.logger = previousOption;
  }
}
