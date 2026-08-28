/**
 * Minimal database seed (Phase 1).
 *
 * Populates just enough to run the app against a real Postgres database:
 *   - the full team roster (needed for login + assignment dropdowns)
 *   - the demo clients + contacts
 *   - the demo projects + drive links + project members
 *
 * Everything else (activities, contractors, collaborators, stores, resources) is
 * entered through the app. Idempotent: re-running upserts on `legacy_id`.
 *
 * Run with: npm run db:seed
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { teamMembers as teamSeed } from "../lib/data/team";
import { projects as projectSeed } from "../lib/data/projects";
import * as schema from "../lib/db/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql, { schema });

const scrypt = promisify(scryptCb);

// Must match lib/auth/password.ts
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "paul@cincel.mx";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "CincelAdmin2026!";

async function seedTeam() {
  for (const m of teamSeed) {
    await db
      .insert(schema.teamMembers)
      .values({
        legacyId: m.id,
        name: m.name,
        birthDate: m.birthDate || null,
        nationality: m.nationality || null,
        phone: m.phone || null,
        institutionalEmail: m.institutionalEmail || null,
        address: m.address || null,
        maritalStatus: m.maritalStatus || null,
        homePhone: m.homePhone || null,
        personalEmail: m.personalEmail || null,
        curp: m.curp || null,
        rfc: m.rfc || null,
        emergencyContact: m.emergencyContact,
        role: m.role || null,
        area: m.area || null,
        capacity: m.capacity,
        availability: m.availability || null,
        active: m.active,
        auth: m.auth ?? null,
      })
      .onConflictDoUpdate({
        target: schema.teamMembers.legacyId,
        set: {
          name: m.name,
          role: m.role || null,
          area: m.area || null,
          capacity: m.capacity,
          availability: m.availability || null,
          active: m.active,
          institutionalEmail: m.institutionalEmail || null,
          phone: m.phone || null,
        },
      });
  }
  console.log(`  team_members: ${teamSeed.length} upserted`);
}

async function seedProjects() {
  for (const p of projectSeed) {
    const c = p.client;

    // ── client ──
    const [clientRow] = await db
      .insert(schema.clients)
      .values({
        legacyId: c.id,
        name: c.name,
        kind: c.kind as "Empresa" | "Particular",
        phone: c.phone || null,
        acquisitionChannel: c.acquisitionChannel || null,
        totalSpentMxn: String(c.totalSpent ?? 0),
      })
      .onConflictDoUpdate({
        target: schema.clients.legacyId,
        set: {
          name: c.name,
          kind: c.kind as "Empresa" | "Particular",
          phone: c.phone || null,
          acquisitionChannel: c.acquisitionChannel || null,
          totalSpentMxn: String(c.totalSpent ?? 0),
        },
      })
      .returning();

    await db
      .delete(schema.clientContacts)
      .where(eq(schema.clientContacts.clientId, clientRow.id));
    if (c.contacts.length > 0) {
      await db.insert(schema.clientContacts).values(
        c.contacts.map((contact, i) => ({
          clientId: clientRow.id,
          name: contact.name,
          role: contact.role || null,
          phone: contact.phone || null,
          email: contact.email || null,
          sortOrder: i,
        }))
      );
    }

    // ── project ──
    const [projectRow] = await db
      .insert(schema.projects)
      .values({
        legacyId: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        active: p.active,
        clientId: clientRow.id,
        projectType: p.type,
        stage: p.stage,
        phase: p.phase,
        addressStreet: p.address.street || null,
        addressCity: p.address.city || null,
        addressState: p.address.state || null,
        managerName: p.manager || null,
        coordinatorName: p.coordinator || null,
        progress: p.progress,
        startDate: p.startDate || null,
      })
      .onConflictDoUpdate({
        target: schema.projects.legacyId,
        set: {
          code: p.code,
          name: p.name,
          status: p.status,
          active: p.active,
          clientId: clientRow.id,
          projectType: p.type,
          stage: p.stage,
          phase: p.phase,
          managerName: p.manager || null,
          coordinatorName: p.coordinator || null,
          progress: p.progress,
          startDate: p.startDate || null,
        },
      })
      .returning();

    // ── drive links ──
    await db
      .insert(schema.projectDriveLinks)
      .values({
        projectId: projectRow.id,
        administrativoUrl: p.drive.administrativo || null,
        planosUrl: p.drive.planos || null,
        rendersUrl: p.drive.renders || null,
        reportesUrl: p.drive.reportes || null,
      })
      .onConflictDoUpdate({
        target: schema.projectDriveLinks.projectId,
        set: {
          administrativoUrl: p.drive.administrativo || null,
          planosUrl: p.drive.planos || null,
          rendersUrl: p.drive.renders || null,
          reportesUrl: p.drive.reportes || null,
        },
      });

    // ── members ──
    await db
      .delete(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, projectRow.id));
    for (const memberName of p.team) {
      const match = await db.query.teamMembers.findFirst({
        where: eq(schema.teamMembers.name, memberName),
      });
      await db.insert(schema.projectMembers).values({
        projectId: projectRow.id,
        teamMemberId: match?.id ?? null,
        memberNameSnapshot: memberName,
      });
    }
  }
  console.log(
    `  clients: ${projectSeed.length} upserted, projects: ${projectSeed.length} upserted`
  );
}

async function seedAdminCredential() {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const member = await db.query.teamMembers.findFirst({
    where: eq(schema.teamMembers.institutionalEmail, ADMIN_EMAIL),
  });
  if (!member) {
    console.log(`  admin credential: SKIPPED (no team member with email ${email})`);
    return;
  }

  // Ensure the seeded admin actually has the Administrador role.
  if (member.role !== "Administrador") {
    await db
      .update(schema.teamMembers)
      .set({ role: "Administrador" })
      .where(eq(schema.teamMembers.id, member.id));
  }

  const { hash, salt } = await hashPassword(ADMIN_PASSWORD);
  await db
    .insert(schema.authCredentials)
    .values({
      teamMemberId: member.id,
      passwordHash: hash,
      salt,
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.authCredentials.teamMemberId,
      set: {
        passwordHash: hash,
        salt,
        authEnabled: true,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      },
    });
  console.log(`  auth_credentials: admin ${email} upserted`);
}

async function main() {
  console.log(`Seeding ${connectionString.replace(/:[^:@/]*@/, ":***@")}`);
  await seedTeam();
  await seedProjects();
  await seedAdminCredential();
  console.log("Seed complete.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
