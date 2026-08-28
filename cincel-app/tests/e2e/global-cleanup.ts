/**
 * Global setup + teardown for the e2e suite.
 *
 * The specs now write to a real Postgres database (Phase 2 cutover) and share a
 * single dev server + DB across the run, with no per-test isolation. Each spec
 * tags the rows it creates with `E2E <timestamp>`; this purges any such rows
 * both before the run (leftovers from a crashed/interrupted run) and after it,
 * so repeated local runs stay deterministic.
 *
 * Only touches rows whose name/description contains "E2E" — never seed data.
 */
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function purgeE2ERows(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`
      delete from core.project_members
      where project_id in (select id from core.projects where name like '%E2E%')
    `;
    await sql`
      delete from core.project_drive_links
      where project_id in (select id from core.projects where name like '%E2E%')
    `;
    await sql`delete from core.projects where name like '%E2E%'`;
    await sql`
      delete from core.client_contacts
      where client_id in (select id from core.clients where name like '%E2E%')
    `;
    await sql`delete from core.clients where name like '%E2E%'`;
    await sql`delete from core.team_members where name like '%E2E%'`;
  } catch (err) {
    // A missing DB in a pure-mock run is not fatal for the suite.
    console.warn("[e2e global-cleanup] skipped:", (err as Error).message);
  } finally {
    await sql.end();
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await purgeE2ERows();
  return purgeE2ERows;
}
