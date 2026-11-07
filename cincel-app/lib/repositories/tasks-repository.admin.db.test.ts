// @vitest-environment node
/**
 * Admin task rules in the tasks repository against a real Postgres (project
 * flow BE §7.5, §8.6, §9.5). Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). Every row a test creates carries
 * a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("tasks repository: admin tasks (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/tasks-repository");

  let adminId = "";
  let otherAdminId = "";
  let staffId = "";
  let projectId = "";
  let userTaskId = "";
  const taskIds: string[] = [];

  async function adminTask(title: string, extra: Partial<Parameters<typeof repo.createAdminTask>[0]> = {}) {
    const row = await repo.createAdminTask({ projectId, title: `${title} ${run}`, ...extra }, adminId);
    taskIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin A ${run}`, role: "Administrador" },
        { name: `Admin B ${run}`, role: "Administrador" },
        { name: `Colaborador ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    adminId = members[0]!.id;
    otherAdminId = members[1]!.id;
    staffId = members[2]!.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Admin tasks ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    const [task] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `Usuario ${run}`, createdById: adminId })
      .returning({ id: schema.tasks.id });
    userTaskId = task!.id;
    taskIds.push(userTaskId);
  });

  afterAll(async () => {
    const all = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId));
    const ids = [...new Set([...taskIds, ...all.map((r) => r.id)])];
    if (ids.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.delete(schema.taskSupport).where(inArray(schema.taskSupport.taskId, ids));
      await db.update(schema.tasks).set({ parentTaskId: null }).where(inArray(schema.tasks.id, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [adminId, otherAdminId, staffId]));
  });

  it("creates an admin task with administrator assignees and lists it", async () => {
    const row = await adminTask("Asignar cliente", { managerId: adminId, supportIds: [otherAdminId] });
    expect(row).toMatchObject({ kind: "admin", workflowId: null, phaseId: null, spaceId: null, managerId: adminId });
    expect(row.support.map((s) => s.id)).toEqual([otherAdminId]);
    const listed = await repo.listAdminTasks({ projectId });
    expect(listed.map((t) => t.id)).toContain(row.id);
    expect(listed.every((t) => t.kind === "admin")).toBe(true);
  });

  it("listAdminTasks hides closed tasks unless includeClosed, ordered by commitment date", async () => {
    const late = await adminTask("Tarde", { commitmentDate: "2030-02-01" });
    const early = await adminTask("Temprano", { commitmentDate: "2030-01-01" });
    const done = await adminTask("Hecha", { commitmentDate: "2029-12-01" });
    await repo.setTaskStatus(done.id, "completado", adminId);

    const open = (await repo.listAdminTasks({ projectId })).map((t) => t.id);
    expect(open).not.toContain(done.id);
    expect(open.indexOf(early.id)).toBeLessThan(open.indexOf(late.id));
    expect((await repo.listAdminTasks({ projectId, includeClosed: true })).map((t) => t.id)).toContain(done.id);
  });

  it("refuses a non-administrator assignee on create", async () => {
    await expect(repo.createAdminTask({ projectId, title: `x ${run}`, managerId: staffId }, adminId)).rejects.toThrow(
      /^ASSIGNEE_NOT_ADMIN/
    );
    await expect(
      repo.createAdminTask({ projectId, title: `x ${run}`, supportIds: [adminId, staffId] }, adminId)
    ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
  });

  it("returns NOT_FOUND for a missing project", async () => {
    await expect(repo.createAdminTask({ projectId: randomUUID(), title: `x ${run}` }, adminId)).rejects.toThrow(
      /^NOT_FOUND$/
    );
  });

  it("refuses a non-administrator on update, assign and support", async () => {
    const task = await adminTask("Asignaciones");
    await expect(repo.updateTask(task.id, { managerId: staffId }, adminId)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
    await expect(repo.assignTask(task.id, staffId, adminId)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
    await expect(repo.setTaskSupport(task.id, [staffId], adminId)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);

    await expect(repo.assignTask(task.id, otherAdminId, adminId)).resolves.toMatchObject({ managerId: otherAdminId });
    await expect(repo.assignTask(task.id, null, adminId)).resolves.toMatchObject({ managerId: null });
    await expect(repo.setTaskSupport(task.id, [otherAdminId], adminId)).resolves.toHaveLength(1);
  });

  it("a non-administrator stays assignable on a normal task", async () => {
    await expect(repo.assignTask(userTaskId, staffId, adminId)).resolves.toMatchObject({ managerId: staffId });
    await expect(repo.setTaskSupport(userTaskId, [staffId], adminId)).resolves.toHaveLength(1);
  });

  it("an admin parent makes an admin child with administrator assignees only", async () => {
    const parent = await adminTask("Padre");
    await expect(
      repo.createSubtask(parent.id, { title: `Hija ${run}`, managerId: staffId }, adminId)
    ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
    const child = await repo.createSubtask(parent.id, { title: `Hija ${run}`, managerId: otherAdminId }, adminId);
    taskIds.push(child.id);
    expect(child).toMatchObject({ kind: "admin", parentTaskId: parent.id, workflowId: null, spaceId: null });
  });

  it("refuses a fase or espacio on an admin task as ADMIN_TASK", async () => {
    const task = await adminTask("Sin fase");
    await expect(repo.updateTask(task.id, { phaseId: randomUUID() }, adminId)).rejects.toThrow(/^ADMIN_TASK$/);
    await expect(repo.updateTask(task.id, { spaceId: randomUUID() }, adminId)).rejects.toThrow(/^ADMIN_TASK$/);
    await expect(repo.updateTask(task.id, { workflowId: randomUUID() }, adminId)).rejects.toThrow(/^INVALID/);
    await expect(repo.updateTask(task.id, { phaseId: null, title: `Renombrada ${run}` }, adminId)).resolves.toMatchObject(
      { title: `Renombrada ${run}` }
    );
  });

  it("mergeTasks refuses mixing an admin task with a normal one", async () => {
    const task = await adminTask("Fusión");
    await expect(repo.mergeTasks(task.id, [userTaskId], adminId)).rejects.toThrow(/^INVALID/);
    await expect(repo.mergeTasks(userTaskId, [task.id], adminId)).rejects.toThrow(/^INVALID/);
    const [still] = await db
      .select({ deletedAt: schema.tasks.deletedAt })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, task.id));
    expect(still!.deletedAt).toBeNull();

    const twin = await adminTask("Fusión gemela");
    await expect(repo.mergeTasks(task.id, [twin.id], adminId)).resolves.toMatchObject({ id: task.id, kind: "admin" });
  });
});
