import postgres from "postgres";

/** Advisory lock key shared by the DB test files that change the etapa catalog (workflows, fases, templates, auto-start). */
const CATALOG_LOCK_KEY = 703_003;

/**
 * Holds a session advisory lock on the test database until the returned function runs, so the files that seed or
 * toggle the shared etapa catalog run one at a time instead of racing each other (vitest runs files in parallel).
 */
export async function lockEtapaCatalog(url: string): Promise<() => Promise<void>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`select pg_advisory_lock(${CATALOG_LOCK_KEY})`;
  return async () => {
    try {
      await sql`select pg_advisory_unlock(${CATALOG_LOCK_KEY})`;
    } finally {
      await sql.end();
    }
  };
}
