import postgres from "postgres";

/** Advisory lock key shared by the DB test files that fire reminders. */
const REMINDERS_LOCK_KEY = 847_003;

/**
 * Holds a session advisory lock on the test database until the returned
 * function runs. `fireDueReminders` and the cron tick fire every due reminder
 * in the database, so the files that create and fire reminders run one at a
 * time instead of firing each other's rows (vitest runs files in parallel).
 */
export async function lockReminders(url: string): Promise<() => Promise<void>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`select pg_advisory_lock(${REMINDERS_LOCK_KEY})`;
  return async () => {
    try {
      await sql`select pg_advisory_unlock(${REMINDERS_LOCK_KEY})`;
    } finally {
      await sql.end();
    }
  };
}
