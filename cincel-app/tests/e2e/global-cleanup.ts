/**
 * Global setup + teardown for the e2e suite.
 *
 * The specs write to a real Postgres database (greenfield model, Rebuild
 * Phase 2+) and share a single dev server + DB across the run, with no
 * per-test isolation. Each spec tags the rows it creates with `E2E
 * <timestamp>`; this purges any such rows both before the run (leftovers
 * from a crashed/interrupted run) and after it, so repeated local runs stay
 * deterministic.
 *
 * Only touches rows whose name/title contains "E2E" — never seed data.
 */
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function purgeE2ERows(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`
      delete from core.task_checklist_items
      where task_id in (select id from core.tasks where title like '%E2E%')
    `;
    await sql`
      delete from core.task_support
      where task_id in (select id from core.tasks where title like '%E2E%')
    `;
    await sql`delete from core.tasks where title like '%E2E%'`;
    await sql`
      delete from core.project_members
      where project_id in (select id from core.projects where name like '%E2E%')
    `;
    await sql`
      delete from core.project_contacts
      where project_id in (select id from core.projects where name like '%E2E%')
    `;
    await sql`
      delete from core.project_links
      where project_id in (select id from core.projects where name like '%E2E%')
    `;
    await sql`delete from core.projects where name like '%E2E%'`;
    await sql`
      delete from core.contact_people
      where contact_id in (select id from core.contacts where name like '%E2E%')
    `;
    await sql`
      delete from core.contact_tags
      where contact_id in (select id from core.contacts where name like '%E2E%')
    `;
    await sql`
      delete from core.provider_profiles
      where contact_id in (select id from core.contacts where name like '%E2E%')
    `;
    await sql`delete from core.contacts where name like '%E2E%'`;
    await sql`
      delete from core.area_members
      where staff_id in (select id from core.staff where name like '%E2E%')
    `;
    await sql`delete from core.auth_credentials where staff_id in (select id from core.staff where name like '%E2E%')`;
    await sql`delete from core.staff where name like '%E2E%'`;
    await sql`delete from core.resource_links where title like '%E2E%'`;
  } catch (err) {
    // A missing DB in a pure-mock run is not fatal for the suite.
    console.warn("[e2e global-cleanup] skipped:", (err as Error).message);
  } finally {
    await sql.end();
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await purgeE2ERows();
  // E2E_KEEP_ROWS leaves rows in place after the run for manual DB inspection.
  return process.env.E2E_KEEP_ROWS ? async () => {} : purgeE2ERows;
}
