import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";

/**
 * Redesign flag helpers for e2e (redesign FE §2.3). The flag is the
 * `core.user_preferences.redesign_enabled` column of one staff member
 * (null = the org `redesignDefault`, which the seed leaves false). The server
 * re-validates it from the DB on every render, so specs flip it here before
 * logging in, and drop the `cincel-appearance` cookie so nothing cached in
 * the browser outlives the change.
 */

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Name of the appearance cookie (`APPEARANCE_COOKIE` in `lib/ui/preferences.ts`). */
export const APPEARANCE_COOKIE = "cincel-appearance";

/**
 * Sets the redesign flag of the active staff member with this email:
 * `true` / `false` force it, `null` goes back to the org default. Creates the
 * preferences row when it is missing (a missing row means all defaults).
 */
export async function setRedesignFor(email: string, enabled: boolean | null): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [member] = await sql`
      select id from core.staff
      where lower(email) = lower(${email}) and deleted_at is null
      limit 1`;
    if (!member) throw new Error(`No staff member with email ${email} to set the redesign flag on.`);
    await sql`
      insert into core.user_preferences (staff_id, redesign_enabled)
      values (${member.id}, ${enabled})
      on conflict (staff_id) do update set redesign_enabled = excluded.redesign_enabled, updated_at = now()`;
  } finally {
    await sql.end();
  }
}

/** Drops the appearance cookie so the next request renders from the DB. */
export async function clearAppearanceCookie(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: APPEARANCE_COOKIE });
}
