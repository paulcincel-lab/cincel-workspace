/**
 * Institutional-email pre-check for Google Drive impersonation (#134).
 *
 * The domain-wide delegation grant is scoped to `drive.readonly` only (least
 * privilege, per docs/google-drive.md) -- deliberately NOT the Admin SDK
 * Directory API, so this script cannot live-diff `core.staff.email` against
 * real Workspace accounts. What it does instead: lists every active staff
 * member's email and flags anything that's missing or doesn't look like a
 * real institutional address, so a human can cross-check that list against
 * the Workspace Admin Console's user list before turning delegation on.
 *
 * Run with: npx tsx scripts/audit-staff-emails.ts
 * Optional: AUDIT_EMAIL_DOMAIN=cincel.mx (default) to check against a
 * different domain.
 */
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const EXPECTED_DOMAIN = process.env.AUDIT_EMAIL_DOMAIN ?? "cincel.mx";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function main() {
  const rows = await db
    .select({ id: schema.staff.id, name: schema.staff.name, email: schema.staff.email })
    .from(schema.staff)
    .where(and(isNull(schema.staff.deletedAt), eq(schema.staff.active, true)))
    .orderBy(schema.staff.name);

  const missing = rows.filter((r) => !r.email?.trim());
  const wrongDomain = rows.filter(
    (r) => r.email?.trim() && !r.email.trim().toLowerCase().endsWith(`@${EXPECTED_DOMAIN}`)
  );
  const ok = rows.filter((r) => r.email?.trim().toLowerCase().endsWith(`@${EXPECTED_DOMAIN}`));

  console.log(`Active staff: ${rows.length}\n`);

  console.log(`OK (@${EXPECTED_DOMAIN}): ${ok.length}`);
  for (const r of ok) console.log(`  ${r.name} <${r.email}>`);

  console.log(`\nMissing email: ${missing.length}`);
  for (const r of missing) console.log(`  ${r.name} (${r.id}) -- no email on file`);

  console.log(`\nUnexpected domain: ${wrongDomain.length}`);
  for (const r of wrongDomain) console.log(`  ${r.name} <${r.email}> -- not @${EXPECTED_DOMAIN}`);

  console.log(
    `\nNext step (manual): cross-check the "OK" list above against the Workspace Admin` +
      ` Console's user list (admin.google.com -> Directory -> Users). Any staff email that` +
      ` doesn't correspond to a real Workspace account will silently get an empty Drive` +
      ` picker once impersonation is on -- fix those in /equipo before enabling delegation.`
  );

  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
