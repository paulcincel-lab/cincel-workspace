import postgres from "postgres";

/** Advisory lock key shared by the DB test files that run the auto-close pass over every open time entry. */
const TIME_ENTRIES_LOCK_KEY = 703_815;

/**
 * Holds a session advisory lock on the test database until the returned function runs, so the files whose
 * auto-close pass looks at every open entry don't close each other's rows mid-test (vitest runs files in parallel).
 */
export async function lockTimeEntries(url: string): Promise<() => Promise<void>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`select pg_advisory_lock(${TIME_ENTRIES_LOCK_KEY})`;
  return async () => {
    try {
      await sql`select pg_advisory_unlock(${TIME_ENTRIES_LOCK_KEY})`;
    } finally {
      await sql.end();
    }
  };
}
