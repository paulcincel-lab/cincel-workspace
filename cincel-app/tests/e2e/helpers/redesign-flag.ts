/**
 * Redesign flag for e2e (FE §2.3): `core.user_preferences.redesign_enabled`
 * for the seeded admin. `true` / `false` pins the flag, `null` falls back to
 * the org default (`OrgAppearance.redesignDefault`, seeded `false`).
 *
 * The `cincel-appearance` cookie carries no flag, so the next request renders
 * from the DB value set here; no reload of the login session is needed.
 *
 * Flag-on specs set it in `beforeAll` and reset it to `null` in `afterAll`,
 * and `global-cleanup.ts` resets it before every run, so a crashed run never
 * leaves the legacy specs running against the new shell.
 */
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";

/** Sets the admin's redesign flag; throws when the org kill switch makes `true` impossible. */
export async function setRedesignFlag(enabled: boolean | null, email: string = E2E_ADMIN_EMAIL): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    if (enabled) {
      const [row] = await sql`select value from core.app_settings where key = 'appearance.theme' limit 1`;
      if (row) {
        let available = true;
        try {
          available = (JSON.parse(row.value as string) as { redesignAvailable?: boolean }).redesignAvailable !== false;
        } catch {
          // An unreadable value is re-validated by the server; let the page decide.
        }
        if (!available) {
          throw new Error("appearance.theme has redesignAvailable = false; flag-on e2e specs cannot run.");
        }
      }
    }
    const rows = await sql`
      insert into core.user_preferences (staff_id, redesign_enabled)
      select id, ${enabled} from core.staff
      where lower(email) = lower(${email}) and deleted_at is null
      on conflict (staff_id) do update set redesign_enabled = excluded.redesign_enabled, updated_at = now()
      returning staff_id`;
    if (rows.length === 0) throw new Error(`staff ${email} not found`);
  } finally {
    await sql.end();
  }
}

/** Resets the admin's flag to the org default (used by global setup). Never throws. */
export async function resetRedesignFlag(email: string = E2E_ADMIN_EMAIL): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`
      update core.user_preferences set redesign_enabled = null, updated_at = now()
      where staff_id in (select id from core.staff where lower(email) = lower(${email}))`;
  } catch (err) {
    console.warn("[e2e redesign-flag] reset skipped:", (err as Error).message);
  } finally {
    await sql.end();
  }
}
