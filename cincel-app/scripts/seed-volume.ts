/**
 * Volume fixture (rebuild Phase 8 hardening — issue #320).
 *
 * Loads a realistic volume of synthetic projects/tasks on top of whatever
 * `scripts/seed.ts` already seeded (workflows, areas, staff), so the board
 * and calendar queries can be profiled under real load.
 *
 * Defaults: 50 projects x 40 tasks/project = 2,000 tasks. That's roughly the
 * scale where an unfiltered "load everything" board query stops being free
 * (a few hundred KB of JSON, a few thousand rows joined against projects/
 * contacts/staff) without being an unrealistic multi-year backlog for a
 * single architecture/construction practice. Override with:
 *   VOLUME_PROJECTS=<n>            (default 50)
 *   VOLUME_TASKS_PER_PROJECT=<n>   (default 40)
 *
 * Every row this script creates is tagged with a "VOLUME " name prefix
 * (contacts, projects, tasks) so it's trivially identifiable. It is NOT
 * wired into the e2e global-cleanup (that convention tags rows "E2E" and is
 * a separate concern) — these are meant to persist across a profiling
 * session. To remove them later, run (order matters: projects before
 * clients, FKs are restrict-on-delete):
 *
 *   delete from core.projects where name like 'VOLUME %';
 *   delete from core.contacts where name like 'VOLUME %' and type = 'cliente';
 *
 * (Deleting a project cascades its tasks — see tasks.projectId onDelete.)
 *
 * Idempotent-ish: re-running adds another batch (names include a run
 * timestamp), it does not upsert. Run once per profiling session and clean
 * up with the query above when done.
 *
 * Run with: DATABASE_URL=... npx tsx scripts/seed-volume.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";
import type { ProjectStatus, TaskPriority, TaskStatus } from "../lib/types/core";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

const VOLUME_PROJECTS = Number(process.env.VOLUME_PROJECTS ?? 50);
const VOLUME_TASKS_PER_PROJECT = Number(process.env.VOLUME_TASKS_PER_PROJECT ?? 40);
const VOLUME_CLIENTS = Math.max(1, Math.min(20, Math.ceil(VOLUME_PROJECTS / 5)));

// Distinguishes this run's rows from a prior run's, without needing upsert.
const RUN_TAG = Date.now();

// Weighted so "completado" and "pendiente" dominate, like a real backlog.
const STATUS_WEIGHTS: Record<TaskStatus, number> = {
  pendiente: 35,
  en_proceso: 25,
  completado: 30,
  bloqueado: 10,
};
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  alta: 20,
  media: 50,
  baja: 30,
};
const PROJECT_STATUS_WEIGHTS: Record<ProjectStatus, number> = {
  activo: 55,
  pausado: 15,
  completado: 25,
  cancelado: 5,
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function weightedPick<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** ISO date string offset from today by `days` (negative = past). */
function offsetDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Insert task rows in chunks to stay well under Postgres' parameter limit. */
async function insertTasksChunked(rows: (typeof schema.tasks.$inferInsert)[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(schema.tasks).values(rows.slice(i, i + chunkSize));
  }
}

async function loadFixtures() {
  const workflowRows = await db.query.workflows.findMany({
    where: (w, { isNull }) => isNull(w.deletedAt),
  });
  const staffRows = await db.query.staff.findMany({
    where: (s, { isNull, and, eq }) => and(isNull(s.deletedAt), eq(s.active, true)),
  });
  if (workflowRows.length === 0 || staffRows.length === 0) {
    throw new Error(
      "No workflows/staff found. Run `npm run db:seed` before seed-volume.ts."
    );
  }
  return { workflowRows, staffRows };
}

async function ensureClients(): Promise<string[]> {
  const existing = await db.query.contacts.findMany({
    where: (c, { isNull, and, eq }) => and(isNull(c.deletedAt), eq(c.type, "cliente")),
  });

  // If there's already a healthy pool of clients, reuse them instead of
  // piling on more synthetic contacts.
  if (existing.length >= VOLUME_CLIENTS) {
    console.log(`  clients: reusing ${existing.length} existing`);
    return existing.map((c) => c.id);
  }

  const toCreate = VOLUME_CLIENTS - existing.length;
  const rows = Array.from({ length: toCreate }, (_, i) => ({
    type: "cliente" as const,
    kind: (i % 3 === 0 ? "particular" : "empresa") as "particular" | "empresa",
    name: `VOLUME Cliente ${RUN_TAG}-${i + 1}`,
    phone: null,
    email: null,
    website: null,
    location: pick(["CDMX", "Guadalajara", "Monterrey", "Querétaro", "Puebla"]),
    acquisitionChannel: null,
    notes: null,
  }));
  const inserted = await db.insert(schema.contacts).values(rows).returning({ id: schema.contacts.id });
  console.log(`  clients: ${existing.length} existing + ${inserted.length} synthetic created`);
  return [...existing.map((c) => c.id), ...inserted.map((r) => r.id)];
}

async function seedProjects(clientIds: string[], workflowIds: string[], staffIds: string[]) {
  const rows = Array.from({ length: VOLUME_PROJECTS }, (_, i) => {
    const start = offsetDate(randomInt(-540, 30));
    // end is either unset (in-flight project) or after start.
    const hasEnd = Math.random() < 0.6;
    return {
      code: null,
      name: `VOLUME Proyecto ${RUN_TAG}-${i + 1}`,
      clientId: pick(clientIds),
      status: weightedPick(PROJECT_STATUS_WEIGHTS),
      currentWorkflowId: Math.random() < 0.85 ? pick(workflowIds) : null,
      phase: pick(["inicio", "desarrollo", "cierre", null]),
      projectType: pick(["residencial", "comercial", "remodelacion", "obra_nueva"]),
      addressStreet: null,
      addressCity: pick(["CDMX", "Guadalajara", "Monterrey", "Querétaro", "Puebla"]),
      addressState: null,
      managerId: Math.random() < 0.9 ? pick(staffIds) : null,
      coordinatorId: Math.random() < 0.7 ? pick(staffIds) : null,
      progress: randomInt(0, 100),
      startDate: start,
      endDate: hasEnd ? offsetDate(randomInt(31, 720)) : null,
      contractAmountMxn: String(randomInt(50_000, 5_000_000)),
    };
  });
  const inserted = await db.insert(schema.projects).values(rows).returning({ id: schema.projects.id });
  console.log(`  projects: ${inserted.length} created`);
  return inserted.map((r) => r.id);
}

async function seedTasks(projectIds: string[], workflowIds: string[], staffIds: string[]) {
  const rows: (typeof schema.tasks.$inferInsert)[] = [];
  for (const projectId of projectIds) {
    for (let i = 0; i < VOLUME_TASKS_PER_PROJECT; i++) {
      const status = weightedPick(STATUS_WEIGHTS);
      // Spread dates across a plausible +/- 9 month window; commitment
      // usually precedes review/delivery, but no ordering is enforced
      // (matches the schema: "no ordering check between the three dates").
      const commitmentDate = Math.random() < 0.85 ? offsetDate(randomInt(-270, 270)) : null;
      const reviewDate = Math.random() < 0.6 ? offsetDate(randomInt(-270, 270)) : null;
      const deliveryDate =
        status === "completado" || Math.random() < 0.5 ? offsetDate(randomInt(-270, 270)) : null;

      rows.push({
        projectId,
        kind: "usuario",
        templateId: null,
        workflowId: Math.random() < 0.9 ? pick(workflowIds) : null,
        phase: null,
        title: `VOLUME Tarea ${RUN_TAG}-${projectId.slice(0, 8)}-${i + 1}`,
        notes: null,
        createdById: pick(staffIds),
        managerId: Math.random() < 0.85 ? pick(staffIds) : null,
        status,
        priority: weightedPick(PRIORITY_WEIGHTS),
        commitmentDate,
        reviewDate,
        deliveryDate,
        archived: Math.random() < 0.05,
      });
    }
  }
  await insertTasksChunked(rows, 500);
  console.log(`  tasks: ${rows.length} created (${VOLUME_TASKS_PER_PROJECT}/project x ${projectIds.length} projects)`);
}

async function main() {
  console.log(`Seeding volume fixture into ${connectionString.replace(/:[^:@/]*@/, ":***@")}`);
  console.log(`  target: ${VOLUME_PROJECTS} projects x ${VOLUME_TASKS_PER_PROJECT} tasks/project`);

  const { workflowRows, staffRows } = await loadFixtures();
  const workflowIds = workflowRows.map((w) => w.id);
  const staffIds = staffRows.map((s) => s.id);

  const clientIds = await ensureClients();
  const projectIds = await seedProjects(clientIds, workflowIds, staffIds);
  await seedTasks(projectIds, workflowIds, staffIds);

  console.log("Volume fixture complete.");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
