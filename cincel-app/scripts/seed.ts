/**
 * Database seed (rebuild Phase 1).
 *
 * Populates the minimum to log in and start using the app:
 *   - the three workflows (Presale, Diseño, Construcción)
 *   - the default fases, templates, puestos and flow statuses
 *     (scripts/default-catalog.mjs; only where none exist yet)
 *   - the staff roster with HR profiles
 *   - one admin login
 *
 * Idempotent: workflows upsert on key, staff match on name (case-insensitive),
 * profiles and credentials upsert on their primary key, and the catalog never
 * updates or revives existing rows.
 *
 * Run with: npm run db:seed
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { teamMembers as roster } from "../lib/data/team";
import * as schema from "../lib/db/schema";
import { ensureDefaultCatalog } from "./default-catalog.mjs";
import { DEFAULT_WORKFLOWS } from "./default-workflows.mjs";
import { resolveSeedAdminPassword } from "./seed-admin-password";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

const scrypt = promisify(scryptCb);

// Must match lib/auth/password.ts
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "paul@cincel.mx";
const ADMIN_PASSWORD = resolveSeedAdminPassword(process.env);

// Shared with scripts/migrate.mjs, which creates them on a fresh install.
const WORKFLOWS = DEFAULT_WORKFLOWS;

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

async function seedWorkflows() {
  const ids = new Map<string, string>();
  for (const [i, w] of WORKFLOWS.entries()) {
    const [row] = await db
      .insert(schema.workflows)
      .values({ key: w.key, name: w.name, sortOrder: i, autoStart: w.autoStart })
      .onConflictDoUpdate({
        target: schema.workflows.key,
        targetWhere: sql`${schema.workflows.deletedAt} is null`,
        set: { name: w.name, sortOrder: i },
      })
      .returning({ id: schema.workflows.id });
    ids.set(w.key, row.id);
  }
  console.log(`  workflows: ${ids.size} upserted`);
  return ids;
}

async function seedCatalog() {
  const c = await ensureDefaultCatalog(client);
  console.log(
    `  catalog: ${c.phases} fases, ${c.templates} templates, ${c.positions} puestos, ` +
      `${c.positionPhases} puesto fases, ${c.statuses} statuses created`
  );
}

async function seedStaff() {
  let count = 0;
  for (const m of roster) {
    const existing = await db.query.staff.findFirst({
      where: sql`lower(${schema.staff.name}) = lower(${m.name}) and ${schema.staff.deletedAt} is null`,
    });
    const values = {
      kind: "empleado" as const,
      name: m.name,
      phone: orNull(m.phone),
      email: orNull(m.institutionalEmail)?.toLowerCase() ?? null,
      role: orNull(m.role),
      capacity: m.capacity,
      availability: orNull(m.availability),
      active: m.active,
    };
    const row = existing
      ? (
          await db
            .update(schema.staff)
            .set(values)
            .where(eq(schema.staff.id, existing.id))
            .returning()
        )[0]
      : (await db.insert(schema.staff).values(values).returning())[0];

    const profile = {
      staffId: row.id,
      personalEmail: orNull(m.personalEmail),
      homePhone: orNull(m.homePhone),
      nationality: orNull(m.nationality),
      address: orNull(m.address),
      maritalStatus: orNull(m.maritalStatus),
      birthDate: orNull(m.birthDate),
      curp: orNull(m.curp),
      rfc: orNull(m.rfc),
      emergencyContactName: orNull(m.emergencyContact.name),
      emergencyContactRelation: orNull(m.emergencyContact.relation),
      emergencyContactPhone: orNull(m.emergencyContact.phone),
      emergencyContactAddress: orNull(m.emergencyContact.address),
    };
    await db
      .insert(schema.staffProfiles)
      .values(profile)
      .onConflictDoUpdate({ target: schema.staffProfiles.staffId, set: profile });
    count += 1;
  }
  console.log(`  staff: ${count} upserted (with profiles)`);
}

async function seedAdminCredential() {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const member = await db.query.staff.findFirst({
    where: sql`lower(${schema.staff.email}) = ${email} and ${schema.staff.deletedAt} is null`,
  });
  if (!member) {
    console.log(`  admin credential: SKIPPED (no staff with email ${email})`);
    return;
  }

  // Ensure the seeded admin actually has the Administrador role.
  if (member.role !== "Administrador") {
    await db
      .update(schema.staff)
      .set({ role: "Administrador" })
      .where(eq(schema.staff.id, member.id));
  }

  const { hash, salt } = await hashPassword(ADMIN_PASSWORD.password);
  const credential = {
    passwordHash: hash,
    salt,
    enabled: true,
    mustChangePassword: false,
    passwordUpdatedAt: new Date(),
  };
  await db
    .insert(schema.authCredentials)
    .values({ staffId: member.id, ...credential })
    .onConflictDoUpdate({ target: schema.authCredentials.staffId, set: credential });
  console.log(`  auth_credentials: admin ${email} upserted`);
  if (ADMIN_PASSWORD.generated) {
    console.log(`  SEED_ADMIN_PASSWORD is not set; generated password for ${email}: ${ADMIN_PASSWORD.password}`);
    console.log("  Store it now: it is not saved anywhere else, and the next seed run replaces it.");
  }
}

async function main() {
  console.log(`Seeding ${connectionString.replace(/:[^:@/]*@/, ":***@")}`);
  await seedWorkflows();
  await seedCatalog();
  await seedStaff();
  await seedAdminCredential();
  console.log("Seed complete.");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
