/**
 * Password cutover (backend spec §A.8 step 3): sets `auth_credentials.enabled = false`
 * and `must_change_password = false` for every staff member with a `google_sub`, so
 * they sign in with Google only. Rows are disabled, not deleted. Staff without a
 * `google_sub` are left alone. Safe to repeat: a second run changes nothing.
 *
 * Run with: npm run auth:disable-passwords (needs DATABASE_URL). Pair it with
 * AUTH_PASSWORD_ENABLED=false so the next deploy doesn't re-enable the bootstrap admin.
 */
import { pathToFileURL } from "node:url";

import postgres from "postgres";

/** Disables the matching credentials with `sql` and returns the staff ids it changed. */
export async function disablePasswords(sql: postgres.Sql | postgres.TransactionSql): Promise<string[]> {
  const rows = await sql<{ staff_id: string }[]>`
    update core.auth_credentials c
    set enabled = false, must_change_password = false, updated_at = now()
    from core.staff s
    where s.id = c.staff_id
      and s.google_sub is not null
      and (c.enabled or c.must_change_password)
    returning c.staff_id`;
  return rows.map((row) => row.staff_id);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const changed = await disablePasswords(sql);
    console.log(`passwords disabled for ${changed.length} staff with google_sub`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
