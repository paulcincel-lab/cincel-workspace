/**
 * Volume fixture for the Tareas page tests (Query Migration 4a, #955): about
 * 2,900 live tasks over a few projects and two tramos of their own, close to
 * the measured production backlog. Same shape as `scripts/seed-volume.ts`
 * (weighted statuses and priorities, dates around today, chunked inserts),
 * but deterministic and self-contained: it creates its own staff, tramos,
 * custom status and projects, all tagged with `run`, and returns their ids so
 * the test deletes exactly what it made (projects first: tasks cascade).
 *
 * Mixed in on purpose: tasks without a tramo, archived and deleted ones, admin
 * tasks, a custom status column, support rows, null and repeated sort keys
 * (the keyset's tie-breaks) and long notes (never in list rows).
 */
import { inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/lib/db/schema";
import type { TaskPriority, TaskStatus } from "@/lib/types/core";

type Db = PostgresJsDatabase<typeof schema>;

export const VOLUME_TASKS = 2900;

export type TasksVolume = {
  run: string;
  /** Title marker of every task: `search: marker` reads only this fixture. */
  marker: string;
  managerId: string;
  helperId: string;
  workflows: { id: string; key: string }[];
  projects: { id: string; name: string }[];
  customStatusId: string;
  ids: { projects: string[]; staff: string[]; workflows: string[]; taskStatuses: string[] };
};

const STATUSES: TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];
const PRIORITIES: TaskPriority[] = ["alta", "media", "baja"];

/** A small deterministic generator (mulberry32), so every run seeds the same shape. */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function insertChunked(db: Db, rows: (typeof schema.tasks.$inferInsert)[], chunk = 400) {
  const out: { id: string }[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    out.push(...(await db.insert(schema.tasks).values(rows.slice(i, i + chunk)).returning({ id: schema.tasks.id })));
  }
  return out;
}

export async function seedTasksVolume(db: Db, run: string, count = VOLUME_TASKS): Promise<TasksVolume> {
  const rand = generator(0x955);
  const marker = `VOL${run}`;
  const ids: TasksVolume["ids"] = { projects: [], staff: [], workflows: [], taskStatuses: [] };

  const [manager, helper] = await db
    .insert(schema.staff)
    .values([
      { name: `Volumen ${run}`, lastName: "Gestor", email: `vol-${run}@cincel.example` },
      { name: `Apoyo ${run}`, email: `apoyo-${run}@cincel.example` },
    ])
    .returning({ id: schema.staff.id });
  ids.staff.push(manager.id, helper.id);

  const workflows = await db
    .insert(schema.workflows)
    .values([
      { key: `vol-a-${run}`, name: `Tramo A ${run}`, sortOrder: 901 },
      { key: `vol-b-${run}`, name: `Tramo B ${run}`, sortOrder: 902 },
    ])
    .returning({ id: schema.workflows.id, key: schema.workflows.key });
  ids.workflows.push(...workflows.map((w) => w.id));

  const [custom] = await db
    .insert(schema.taskStatuses)
    .values({ name: `Revisión ${run}`, closes: false })
    .returning({ id: schema.taskStatuses.id });
  ids.taskStatuses.push(custom.id);

  const projects = await db
    .insert(schema.projects)
    .values(Array.from({ length: 12 }, (_, i) => ({ name: `Proyecto ${marker} ${String(i + 1).padStart(2, "0")}` })))
    .returning({ id: schema.projects.id, name: schema.projects.name });
  ids.projects.push(...projects.map((p) => p.id));

  const notes = "Notas largas de la tarea. ".repeat(40);
  const rows: (typeof schema.tasks.$inferInsert)[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rand();
    const project = projects[Math.floor(rand() * projects.length)];
    const workflow = roll < 0.1 ? null : workflows[roll < 0.55 ? 0 : 1];
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    const kind = i % 97 === 0 ? ("admin" as const) : ("usuario" as const);
    rows.push({
      projectId: project.id,
      kind,
      workflowId: kind === "admin" ? null : (workflow?.id ?? null),
      title: `${marker} tarea ${i + 1}`,
      notes,
      createdById: manager.id,
      managerId: i % 3 === 0 ? helper.id : manager.id,
      status: i % 41 === 0 ? "en_proceso" : status,
      customStatusId: i % 41 === 0 ? custom.id : null,
      priority: PRIORITIES[Math.floor(rand() * PRIORITIES.length)],
      // Many ties and nulls: the keyset must still order and page them stably.
      sortOrder: i % 4 === 0 ? null : Math.floor(rand() * 20),
      commitmentDate: i % 5 === 0 ? null : isoOffset(Math.floor(rand() * 120) - 60),
      archived: i % 113 === 0,
      deletedAt: i % 127 === 0 ? new Date() : null,
    });
  }
  const tasks = await insertChunked(db, rows);

  const support = tasks.filter((_, i) => i % 7 === 0).map((t) => ({ taskId: t.id, staffId: helper.id }));
  for (let i = 0; i < support.length; i += 400) await db.insert(schema.taskSupport).values(support.slice(i, i + 400));
  // Planner statistics for the bulk insert, as autovacuum would gather them in a running database:
  // without them the list reads plan for empty tables and take seconds per page.
  await db.execute(sql`analyze ${schema.tasks}, ${schema.taskSupport}, ${schema.projects}`);

  return {
    run,
    marker,
    managerId: manager.id,
    helperId: helper.id,
    workflows,
    projects,
    customStatusId: custom.id,
    ids,
  };
}

/** Deletes everything `seedTasksVolume` made (projects first: their tasks cascade). */
export async function cleanupTasksVolume(db: Db, volume: TasksVolume | null): Promise<void> {
  if (!volume) return;
  const { ids } = volume;
  if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
  if (ids.workflows.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
  if (ids.taskStatuses.length) {
    await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, ids.taskStatuses));
  }
  if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
}
