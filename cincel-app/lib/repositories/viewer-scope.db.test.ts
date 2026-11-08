// @vitest-environment node
/**
 * Viewer scope across task and project reads against a real Postgres
 * (project flow BE §7.5, §8.5, §8.6, §12, §16): a non-admin never receives
 * admin tasks or client/origin data; admins see everything. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ViewerScope } from "@/lib/types/core";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("viewer scope on task and project reads (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const tasksRepo = await import("@/lib/repositories/tasks-repository");
  const projectsRepo = await import("@/lib/repositories/projects-repository");
  const depsRepo = await import("@/lib/repositories/task-dependencies-repository");
  const { staffViewerScope } = await import("@/lib/repositories/viewer-scope-repository");

  let adminId = "";
  let staffId = "";
  let clientId = "";
  let projectId = "";
  let userTaskId = "";
  let adminTaskId = "";
  let adminChildId = "";
  let admin: ViewerScope;
  let member: ViewerScope;

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, role: "Administrador" },
        { name: `Colaborador ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    adminId = members[0]!.id;
    staffId = members[1]!.id;
    admin = { staffId: adminId, isAdmin: true };
    member = { staffId, isAdmin: false };

    const [client] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ${run}` })
      .returning({ id: schema.contacts.id });
    clientId = client!.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Visibilidad ${run}`, clientId, origin: "Referido", originStaffId: adminId })
      .returning({ id: schema.projects.id });
    projectId = project!.id;

    const rows = await db
      .insert(schema.tasks)
      .values([
        {
          projectId,
          kind: "usuario",
          title: `Usuario ${run}`,
          createdById: adminId,
          managerId: staffId,
          commitmentDate: "2030-03-10",
        },
        {
          projectId,
          kind: "admin",
          title: `Admin ${run}`,
          createdById: adminId,
          managerId: adminId,
          commitmentDate: "2030-03-11",
        },
      ])
      .returning({ id: schema.tasks.id });
    userTaskId = rows[0]!.id;
    adminTaskId = rows[1]!.id;
    const [child] = await db
      .insert(schema.tasks)
      .values({ projectId, parentTaskId: userTaskId, kind: "admin", title: `Hija admin ${run}`, createdById: adminId })
      .returning({ id: schema.tasks.id });
    adminChildId = child!.id;
    await db.insert(schema.taskDependencies).values({ taskId: userTaskId, dependsOnTaskId: adminTaskId });
    // The collaborator supports the admin task too: still hidden from their own lists.
    await db.insert(schema.taskSupport).values({ taskId: adminTaskId, staffId });
  });

  afterAll(async () => {
    const ids = [userTaskId, adminTaskId, adminChildId].filter(Boolean);
    if (ids.length) {
      await db.delete(schema.taskDependencies).where(inArray(schema.taskDependencies.taskId, ids));
      await db.delete(schema.taskSupport).where(inArray(schema.taskSupport.taskId, ids));
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.update(schema.tasks).set({ parentTaskId: null }).where(inArray(schema.tasks.id, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    if (clientId) await db.delete(schema.contacts).where(eq(schema.contacts.id, clientId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [adminId, staffId].filter(Boolean)));
  });

  const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

  it("task lists leave admin tasks out by default, for admins too", async () => {
    expect(ids(await tasksRepo.listTasks({ projectId }, admin))).not.toContain(adminTaskId);
    expect(ids(await tasksRepo.listTasks({ projectId }, member))).toEqual([userTaskId]);
  });

  it("admin tasks come back only when asked for and the viewer is admin", async () => {
    expect(ids(await tasksRepo.listTasks({ projectId, kind: "admin" }, admin))).toContain(adminTaskId);
    expect(await tasksRepo.listTasks({ projectId, kind: "admin" }, member)).toEqual([]);
    expect(ids(await tasksRepo.listTasks({ projectId, kind: ["usuario", "admin"] }, member))).toEqual([userTaskId]);
  });

  it("client name is null for non-admins in task rows", async () => {
    const [asAdmin] = await tasksRepo.listTasks({ projectId }, admin);
    const [asMember] = await tasksRepo.listTasks({ projectId }, member);
    expect(asAdmin!.project.clientName).toBe(`Cliente ${run}`);
    expect(asMember!.project.clientName).toBeNull();
  });

  it("board and calendar hide admin tasks from non-admins", async () => {
    const board = await tasksRepo.listBoardColumns({ projectId }, member, 20);
    expect(Object.values(board).flatMap((c) => c.rows.map((t) => t.id))).toEqual([userTaskId]);
    const calendar = await tasksRepo.listCalendar("2030-03-01", "2030-03-31", { projectId }, member);
    expect(ids(calendar)).toEqual([userTaskId]);
  });

  it("Mis tareas (feed, Google sync) has own admin tasks for an admin only", async () => {
    expect(ids(await tasksRepo.listMyTasks(adminId, { projectId }, admin))).toContain(adminTaskId);
    expect(ids(await tasksRepo.listMyTasks(staffId, { projectId }, member))).toEqual([userTaskId]);
    expect(await staffViewerScope(adminId)).toEqual(admin);
    expect(await staffViewerScope(staffId)).toEqual(member);
  });

  it("task detail is null for a non-admin on an admin task, client name scoped", async () => {
    expect(await tasksRepo.getTaskForViewer(adminTaskId, member)).toBeNull();
    expect((await tasksRepo.getTaskForViewer(adminTaskId, admin))?.id).toBe(adminTaskId);
    expect((await tasksRepo.getTaskForViewer(userTaskId, member))?.project.clientName).toBeNull();
  });

  it("assertTaskVisible refuses admin tasks for non-admins with FORBIDDEN", async () => {
    await expect(tasksRepo.assertTaskVisible(adminTaskId, member)).rejects.toThrow(/^FORBIDDEN$/);
    await expect(tasksRepo.assertTaskVisible(adminTaskId, admin)).resolves.toBeUndefined();
    await expect(tasksRepo.assertTaskVisible(userTaskId, member)).resolves.toBeUndefined();
    expect(await tasksRepo.isTaskVisible(adminTaskId, member)).toBe(false);
  });

  it("subtasks and dependency pickers leave admin tasks out for non-admins", async () => {
    expect(await tasksRepo.listSubtasks(userTaskId, member)).toEqual([]);
    expect(ids(await tasksRepo.listSubtasks(userTaskId, admin))).toEqual([adminChildId]);
    expect((await depsRepo.listTaskDependencies(userTaskId, member)).dependsOn).toEqual([]);
    expect(ids((await depsRepo.listTaskDependencies(userTaskId, admin)).dependsOn)).toEqual([adminTaskId]);
  });

  it("the dashboard trend source leaves admin tasks out", async () => {
    const source = await tasksRepo.listTaskTrendSource(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    const found = new Set(source.tasks.map((t) => t.id));
    expect(found.has(adminTaskId)).toBe(false);
    expect(found.has(userTaskId)).toBe(true);
  });

  it("project list and detail null client and origin for non-admins", async () => {
    const [asMember] = await projectsRepo.listProjects({ search: `Visibilidad ${run}` }, member);
    expect(asMember).toMatchObject({ clientId: null, origin: null, originStaffId: null, client: null });
    // Admin tasks don't count for them either.
    expect(asMember!.taskCounts.total).toBe(1);

    const [asAdmin] = await projectsRepo.listProjects({ search: `Visibilidad ${run}` }, admin);
    expect(asAdmin).toMatchObject({ clientId, origin: "Referido", originStaffId: adminId });
    expect(asAdmin!.client?.name).toBe(`Cliente ${run}`);
    expect(asAdmin!.taskCounts.total).toBe(3);

    const detail = await projectsRepo.getProject(projectId, member);
    expect(detail).toMatchObject({ clientId: null, origin: null, originStaffId: null, client: null, originStaff: null });
    const adminDetail = await projectsRepo.getProject(projectId, admin);
    expect(adminDetail?.originStaff?.id).toBe(adminId);
  });

  it("non-admins can't find projects by client name or client id", async () => {
    expect(await projectsRepo.listProjects({ search: `Cliente ${run}` }, member)).toEqual([]);
    const byClient = await projectsRepo.listProjects({ clientId, search: `Visibilidad ${run}` }, member);
    expect(byClient.map((p) => p.id)).toEqual([projectId]);
    expect(ids(await projectsRepo.listProjects({ search: `Cliente ${run}` }, admin))).toEqual([projectId]);
  });
});
