/**
 * Database seed (rebuild Phase 1).
 *
 * Populates the minimum to log in and start using the app:
 *   - the four workflows (Presale, Diseño, Construcción, Decoración), zero
 *     templates until the client supplies them (Phase 0)
 *   - areas, derived from the roster plus Decoración, each owning its workflow
 *   - the staff roster with HR profiles and area memberships
 *   - one admin login
 *
 * Idempotent: workflows upsert on key, areas and staff match on name (case-
 * insensitive), memberships and credentials upsert on their primary key.
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
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "CincelAdmin2026!";

const WORKFLOWS = [
  { key: "presale", name: "Presale", area: "Presale" },
  { key: "diseno", name: "Diseño", area: "Diseño" },
  { key: "construccion", name: "Construcción", area: "Construcción" },
  { key: "decoracion", name: "Decoración", area: "Decoración" },
] as const;

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

async function seedWorkflows() {
  const ids = new Map<string, string>();
  for (const [i, w] of WORKFLOWS.entries()) {
    const [row] = await db
      .insert(schema.workflows)
      .values({ key: w.key, name: w.name, sortOrder: i })
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

async function seedAreas() {
  const names = new Set<string>(WORKFLOWS.map((w) => w.area));
  for (const m of roster) if (m.area.trim()) names.add(m.area.trim());

  const ids = new Map<string, string>();
  let i = 0;
  for (const name of names) {
    const existing = await db.query.areas.findFirst({
      where: sql`lower(${schema.areas.name}) = lower(${name}) and ${schema.areas.deletedAt} is null`,
    });
    const row =
      existing ??
      (
        await db
          .insert(schema.areas)
          .values({ name, sortOrder: i })
          .returning()
      )[0];
    ids.set(name.toLowerCase(), row.id);
    i += 1;
  }
  console.log(`  areas: ${ids.size} present`);
  return ids;
}

async function seedAreaWorkflows(
  workflowIds: Map<string, string>,
  areaIds: Map<string, string>
) {
  for (const w of WORKFLOWS) {
    await db
      .insert(schema.areaWorkflows)
      .values({
        areaId: areaIds.get(w.area.toLowerCase())!,
        workflowId: workflowIds.get(w.key)!,
      })
      .onConflictDoNothing();
  }
  console.log(`  area_workflows: ${WORKFLOWS.length} linked`);
}

async function seedStaff(areaIds: Map<string, string>) {
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

    const areaId = areaIds.get(m.area.trim().toLowerCase());
    if (areaId) {
      await db
        .insert(schema.areaMembers)
        .values({ areaId, staffId: row.id })
        .onConflictDoNothing();
    }
    count += 1;
  }
  console.log(`  staff: ${count} upserted (with profiles and area memberships)`);
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

  const { hash, salt } = await hashPassword(ADMIN_PASSWORD);
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
}

async function main() {
  console.log(`Seeding ${connectionString.replace(/:[^:@/]*@/, ":***@")}`);
  const workflowIds = await seedWorkflows();
  const areaIds = await seedAreas();
  await seedAreaWorkflows(workflowIds, areaIds);
  await seedStaff(areaIds);
  await seedAdminCredential();
  console.log("Seed complete.");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
