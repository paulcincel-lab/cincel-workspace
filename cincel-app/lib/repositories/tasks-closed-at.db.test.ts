// @vitest-environment node
/**
 * `tasks.closed_at` against a real Postgres (BE §3.6, §7.6, §8.6): every
 * status write keeps `tasks_closed_at_check` true, and listings tolerate a
 * project without a client. Runs only when TEST_DATABASE_URL points at a
 * migrated database. Every row a test creates carries a per-run marker and is
 * deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ProjectFilters } from "@/lib/repositories/projects-repository";
import type { ProjectListItem, TaskFilters, TaskListItem, ViewerScope } from "@/lib/types/core";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("task closed_at (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const tasksRepo = await import("./tasks-repository");
  const statusesRepo = await import("./task-statuses-repository");
  const projectsRepo = await import("./projects-repository");

  let staffId = "";
  let projectId = "";
  const taskIds: string[] = [];
  const statusIds: string[] = [];

  async function newTask(title: string): Promise<string> {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `${title} ${run}`, createdById: staffId })
      .returning({ id: schema.tasks.id });
    taskIds.push(row.id);
    return row.id;
  }

  async function closedAt(taskId: string): Promise<Date | null> {
    const [row] = await db
      .select({ closedAt: schema.tasks.closedAt })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId));
    return row.closedAt;
  }

  async function newStatus(name: string, closes: boolean, countsAsCompleted?: boolean) {
    const option = await statusesRepo.createTaskStatus({ name: `${name} ${run}`, closes, countsAsCompleted });
    statusIds.push(option.id);
    return option;
  }

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Cierre ${run}`, email: `cierre-${run}@example.test` })
      .returning({ id: schema.staff.id });
    staffId = member.id;
    // Name only: no client (ADR 0003).
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Proyecto sin cliente ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project.id;
  });

  afterAll(async () => {
    if (taskIds.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
    }
    if (statusIds.length) await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, statusIds));
    if (projectId) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    }
    if (staffId) await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
  });

  it("sets closed_at when a task is completed and clears it when it is reopened", async () => {
    const id = await newTask("Cerrar y reabrir");
    expect(await closedAt(id)).toBeNull();

    await tasksRepo.setTaskStatus(id, "completado", staffId);
    const first = await closedAt(id);
    expect(first).toBeInstanceOf(Date);

    // Completing again keeps the original date.
    await tasksRepo.updateTask(id, { status: "completado" }, staffId);
    expect((await closedAt(id))?.getTime()).toBe(first!.getTime());

    await tasksRepo.setTaskStatus(id, "en_proceso", staffId);
    expect(await closedAt(id)).toBeNull();

    await tasksRepo.updateTask(id, { status: "completado" }, staffId);
    expect(await closedAt(id)).toBeInstanceOf(Date);
    await tasksRepo.updateTask(id, { status: "pendiente" }, staffId);
    expect(await closedAt(id)).toBeNull();
  });

  it("follows a custom status: a closing one sets closed_at, an open one clears it", async () => {
    const closing = await newStatus("Entregado", true);
    const open = await newStatus("En revisión", false);
    const id = await newTask("Estatus personalizado");

    await tasksRepo.setTaskCustomStatus(id, closing.id, staffId);
    expect(await closedAt(id)).toBeInstanceOf(Date);

    await tasksRepo.setTaskCustomStatus(id, open.id, staffId);
    expect(await closedAt(id)).toBeNull();
  });

  it("re-syncs closed_at when a status catalog entry starts or stops closing", async () => {
    const status = await newStatus("Por validar", false);
    const id = await newTask("Re-sincronizar");
    await tasksRepo.setTaskCustomStatus(id, status.id, staffId);
    expect(await closedAt(id)).toBeNull();

    const closing = await statusesRepo.updateTaskStatus(status.id, { closes: true });
    expect(closing.countsAsCompleted).toBe(true);
    expect(await closedAt(id)).toBeInstanceOf(Date);

    const reopened = await statusesRepo.updateTaskStatus(status.id, { closes: false });
    expect(reopened.countsAsCompleted).toBe(false);
    expect(await closedAt(id)).toBeNull();
  });

  it("stores countsAsCompleted on the status catalog and refuses it without closes", async () => {
    const cancelled = await newStatus("Cancelado", true, false);
    expect(cancelled.countsAsCompleted).toBe(false);
    const updated = await statusesRepo.updateTaskStatus(cancelled.id, { countsAsCompleted: true });
    expect(updated.countsAsCompleted).toBe(true);
    await expect(newStatus("En espera", false, true)).rejects.toThrow("INVALID");
  });

  it("leaves tasks_closed_at_check valid after the writes", async () => {
    await expect(
      db.execute(sql`alter table core.tasks validate constraint tasks_closed_at_check`)
    ).resolves.toBeDefined();
  });

  it("lists a project without a client and its tasks", async () => {
    // Admin viewer, for when the listings take a ViewerScope (BE §8.5, §8.6).
    const viewer: ViewerScope = { staffId, isAdmin: true };
    const listProjects = projectsRepo.listProjects as (
      f: ProjectFilters,
      v?: ViewerScope
    ) => Promise<ProjectListItem[]>;
    const projects = await listProjects({ search: run }, viewer);
    const project = projects.find((p) => p.id === projectId);
    expect(project).toBeDefined();
    expect(project!.clientId).toBeNull();

    const listTasks = tasksRepo.listTasks as (f: TaskFilters, v?: ViewerScope) => Promise<TaskListItem[]>;
    const listed = await listTasks({ projectId }, viewer);
    expect(listed.map((t) => t.id).sort()).toEqual([...taskIds].sort());
  });
});
