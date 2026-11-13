// @vitest-environment node
/**
 * Task sheet page data (Query Migration 4b, #956) against a real Postgres.
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and is
 * deleted afterwards.
 *
 * - `loadTaskSheet` runs ≤ 6 statements (`countQueries`) and its task equals
 *   today's `getTaskForViewer` detail.
 * - `assignable` rows carry only `{id,name,suggested}`.
 * - Viewer rules: an admin task for a non-admin, a task in a deleted project,
 *   no `canViewProjects`, a missing or deleted task → null; no Tareas
 *   capability or a guest → FORBIDDEN.
 * - `searchProjectTasksAction`: FORBIDDEN for a project the viewer can't see;
 *   never admin tasks; `q` matching (case-insensitive, literal `%`/`_`),
 *   `limit` and `excludeId`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns the Tareas or Proyectos capability off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noProjects: false, noActivities: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveProjectsCapabilities: (user: Parameters<typeof actual.resolveProjectsCapabilities>[0]) => {
      const caps = actual.resolveProjectsCapabilities(user);
      return perms.noProjects ? { ...caps, canViewProjects: false } : caps;
    },
    resolveActivitiesCapabilities: (user: Parameters<typeof actual.resolveActivitiesCapabilities>[0]) => {
      const caps = actual.resolveActivitiesCapabilities(user);
      return perms.noActivities ? { ...caps, canViewActivities: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("task sheet page data (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { getTaskSheetData, searchProjectTasksAction } = await import("@/lib/actions/page-data/tareas-actions");
  const { loadTaskSheet } = await import("@/lib/loaders/tareas");
  const { getTaskForViewer } = await import("@/lib/repositories/tasks-repository");
  const { viewerScopeOf } = await import("@/lib/auth/viewer-scope");

  const ids = { projects: [] as string[], staff: [] as string[], workflows: [] as string[], tasks: [] as string[] };
  let viewerId = "";
  let projectId = "";
  let deletedProjectId = "";
  let workflowId = "";
  let phaseId = "";
  let inactivePhaseId = "";
  let spaceId = "";
  let taskId = "";
  let adminTaskId = "";
  let deletedTaskId = "";
  let orphanTaskId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Hoja ${run}`, lastName: "Prueba", email: `hoja-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const [workflow] = await db
      .insert(schema.workflows)
      .values({ key: `hoja-${run}`, name: `Etapa hoja ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    workflowId = workflow.id;
    ids.workflows.push(workflow.id);
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId, name: `Fase B ${run}`, sortOrder: 2 },
        { workflowId, name: `Fase A ${run}`, sortOrder: 1 },
        { workflowId, name: `Fase inactiva ${run}`, sortOrder: 3, active: false },
      ])
      .returning({ id: schema.workflowPhases.id });
    phaseId = phases[1].id;
    inactivePhaseId = phases[2].id;

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Hoja ${run}`, status: "activo", managerId: viewerId })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    const [space] = await db
      .insert(schema.projectSpaces)
      .values({ projectId, name: `Depto ${run}`, sortOrder: 1 })
      .returning({ id: schema.projectSpaces.id });
    spaceId = space.id;

    const base = { projectId, createdById: viewerId, managerId: viewerId };
    const [task] = await db
      .insert(schema.tasks)
      .values({
        ...base,
        kind: "usuario",
        workflowId,
        phaseId,
        spaceId,
        title: `Planos ${run}`,
        notes: "Con cotas",
        commitmentDate: "2026-11-20",
      })
      .returning({ id: schema.tasks.id });
    taskId = task.id;

    const [adminTask] = await db
      .insert(schema.tasks)
      .values({ ...base, kind: "admin", title: `Cobranza ${run}` })
      .returning({ id: schema.tasks.id });
    adminTaskId = adminTask.id;

    const [deletedTask] = await db
      .insert(schema.tasks)
      .values({ ...base, kind: "usuario", title: `Borrada ${run}`, deletedAt: new Date() })
      .returning({ id: schema.tasks.id });
    deletedTaskId = deletedTask.id;

    // Subtareas (one done, one archived that doesn't count) and a pending dependency.
    const [dependency] = await db
      .insert(schema.tasks)
      .values([
        { ...base, kind: "usuario", title: `Sub hecha ${run}`, parentTaskId: taskId, status: "completado" },
        { ...base, kind: "usuario", title: `Sub archivada ${run}`, parentTaskId: taskId, archived: true },
        { ...base, kind: "usuario", title: `Dependencia ${run}`, status: "en_proceso" },
      ])
      .returning({ id: schema.tasks.id })
      .then((rows) => [rows[2]]);
    await db.insert(schema.taskDependencies).values({ taskId, dependsOnTaskId: dependency.id });

    await db.insert(schema.taskSupport).values({ taskId, staffId: viewerId });
    const [item] = await db
      .insert(schema.taskChecklistItems)
      .values([
        { taskId, title: "Medir", completed: true, sortOrder: 1 },
        { taskId, title: "Subir", completed: false, sortOrder: 2 },
      ])
      .returning({ id: schema.taskChecklistItems.id });
    await db.insert(schema.taskAttachments).values({
      taskId,
      fileName: "nota.txt",
      mimeType: "text/plain",
      sizeBytes: 4,
      data: Buffer.from("hola"),
      uploadedById: viewerId,
      checklistItemId: item.id,
    });
    await db.insert(schema.taskLinks).values({ taskId, kind: "interno", title: "Drive", url: "https://example.com/d" });
    await db.insert(schema.historyEvents).values([
      { entity: "task", entityId: taskId, kind: "comentario", actorId: viewerId, comment: "Primero", eventAt: new Date("2026-11-01T10:00:00.123Z") },
      { entity: "task", entityId: taskId, kind: "cambio", actorId: null, field: "status", beforeValue: "pendiente", afterValue: "en_proceso", eventAt: new Date("2026-11-02T10:00:00Z") },
    ]);

    // Search rows: plain, literal-% and admin titles.
    await db
      .insert(schema.tasks)
      .values([
        { ...base, kind: "usuario", title: `Buscar alfa ${run}` },
        { ...base, kind: "usuario", title: `BUSCAR beta ${run}` },
        { ...base, kind: "usuario", title: `Buscar 100% ${run}` },
        { ...base, kind: "admin", title: `Buscar admin ${run}` },
        { ...base, kind: "usuario", title: `Buscar archivada ${run}`, archived: true },
      ]);

    const [deletedProject] = await db
      .insert(schema.projects)
      .values({ name: `Hoja ${run} borrado`, status: "activo", deletedAt: new Date() })
      .returning({ id: schema.projects.id });
    deletedProjectId = deletedProject.id;
    ids.projects.push(deletedProject.id);
    const [orphan] = await db
      .insert(schema.tasks)
      .values({ projectId: deletedProjectId, createdById: viewerId, kind: "usuario", title: `Huérfana ${run}` })
      .returning({ id: schema.tasks.id });
    orphanTaskId = orphan.id;
    ids.tasks.push(taskId, adminTaskId, deletedTaskId, orphanTaskId);
  });

  afterAll(async () => {
    if (ids.tasks.length) await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.tasks));
    // Projects cascade to their tasks (and those to checklist, attachments, links, support, dependencies) and espacios.
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.workflows.length) {
      await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, ids.workflows));
      await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    }
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
    perms.noActivities = false;
  });

  describe("getTaskSheetData", () => {
    it("loads in ≤ 6 statements and the task equals today's getTaskForViewer detail", async () => {
      const user = await asViewer(admin(), () => requireCapabilityUser());
      const { result, count } = await countQueries(() => loadTaskSheet(user, { id: taskId }));
      expect(count).toBeLessThanOrEqual(6);
      expect(result).not.toBeNull();
      const today = await getTaskForViewer(taskId, viewerScopeOf(user));
      expect(result?.task).toEqual(today);
    });

    it("carries the catalogs the sheet seeds", async () => {
      const data = await asViewer(admin(), () => getTaskSheetData({ id: taskId }));
      expect(data?.task.checklist).toEqual({ total: 2, completed: 1 });
      expect(data?.task.subtaskCount).toBe(1);
      expect(data?.task.subtaskDoneCount).toBe(1);
      expect(data?.task.waitingOn).toBe(1);
      expect(data?.task.history.map((h) => h.comment ?? h.field)).toEqual(["status", "Primero"]);
      expect(data?.task.history[1].eventAt).toBe("2026-11-01T10:00:00.123Z");
      expect(data?.task.attachments[0]).toMatchObject({ fileName: "nota.txt", uploadedBy: { id: viewerId } });
      expect(data?.task.links).toHaveLength(1);
      // Active fases of the task's tramo, by sortOrder; the inactive one is left out.
      expect(data?.phases.map((p) => p.id)).toEqual([phaseId, expect.any(String)]);
      expect(data?.phases.map((p) => p.id)).not.toContain(inactivePhaseId);
      expect(data?.workflows.some((w) => w.id === workflowId)).toBe(true);
      expect(data?.spaces).toEqual([{ id: spaceId, name: `Depto ${run}`, projectId, sortOrder: 1, taskCount: 1 }]);
      expect(Array.isArray(data?.statuses)).toBe(true);
    });

    it("assignable rows are {id,name,suggested} only, never full Staff", async () => {
      const data = await asViewer(admin(), () => getTaskSheetData({ id: taskId }));
      expect(data?.assignable.length).toBeGreaterThan(0);
      for (const row of data?.assignable ?? []) expect(Object.keys(row).sort()).toEqual(["id", "name", "suggested"]);
      expect(data?.assignable.find((s) => s.id === viewerId)?.name).toBe(`Hoja ${run} Prueba`);
    });

    it("strips the client name for a non-admin", async () => {
      const data = await asViewer(colaborador(), () => getTaskSheetData({ id: taskId }));
      expect(data?.task.id).toBe(taskId);
      expect(data?.task.project.clientName).toBeNull();
    });

    it("is null for an admin task opened by a non-admin, and loads it for an administrator", async () => {
      expect(await asViewer(colaborador(), () => getTaskSheetData({ id: adminTaskId }))).toBeNull();
      const data = await asViewer(admin(), () => getTaskSheetData({ id: adminTaskId }));
      expect(data?.task.kind).toBe("admin");
      // An admin task gets no espacios.
      expect(data?.spaces).toEqual([]);
    });

    it("is null for a task in a deleted project, a deleted task and an unknown id", async () => {
      expect(await asViewer(admin(), () => getTaskSheetData({ id: orphanTaskId }))).toBeNull();
      expect(await asViewer(admin(), () => getTaskSheetData({ id: deletedTaskId }))).toBeNull();
      expect(await asViewer(admin(), () => getTaskSheetData({ id: randomUUID() }))).toBeNull();
    });

    it("is null without canViewProjects", async () => {
      perms.noProjects = true;
      expect(await asViewer(colaborador(), () => getTaskSheetData({ id: taskId }))).toBeNull();
    });

    it("is FORBIDDEN without the Tareas capability, for a guest, and INVALID for a non-uuid id", async () => {
      perms.noActivities = true;
      await expect(asViewer(colaborador(), () => getTaskSheetData({ id: taskId }))).rejects.toThrow("FORBIDDEN");
      perms.noActivities = false;
      await expect(asViewer(null, () => getTaskSheetData({ id: taskId }))).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(admin(), () => getTaskSheetData({ id: "t-1" }))).rejects.toThrow("INVALID");
    });
  });

  describe("searchProjectTasksAction", () => {
    it("matches the title case-insensitively and never returns admin or archived tasks", async () => {
      const rows = await asViewer(colaborador(), () => searchProjectTasksAction({ projectId, q: `buscar` }));
      const titles = rows.map((r) => r.title);
      expect(titles).toEqual(expect.arrayContaining([`Buscar alfa ${run}`, `BUSCAR beta ${run}`, `Buscar 100% ${run}`]));
      expect(titles).not.toContain(`Buscar admin ${run}`);
      expect(titles).not.toContain(`Buscar archivada ${run}`);
      expect(Object.keys(rows[0]).sort()).toEqual(["commitmentDate", "id", "managerName", "status", "title"]);
    });

    it("leaves admin tasks out for administrators too, as the project task list did", async () => {
      const rows = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: `admin ${run}` }));
      expect(rows).toEqual([]);
    });

    it("treats % and _ literally", async () => {
      const rows = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "100%" }));
      expect(rows.map((r) => r.title)).toEqual([`Buscar 100% ${run}`]);
      expect(await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "_" }))).toEqual([]);
    });

    it("returns at most `limit` rows (20 by default) and leaves `excludeId` out", async () => {
      const all = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "" }));
      expect(all.length).toBeLessThanOrEqual(20);
      expect(all.map((r) => r.id)).toContain(taskId);
      const two = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "", limit: 2 }));
      expect(two).toHaveLength(2);
      const without = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "", excludeId: taskId }));
      expect(without.map((r) => r.id)).not.toContain(taskId);
      await expect(asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "", limit: 51 }))).rejects.toThrow(
        "INVALID",
      );
    });

    it("rejects a search over 200 characters", async () => {
      await expect(
        asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "x".repeat(201) })),
      ).rejects.toThrow("INVALID");
    });

    it("is FORBIDDEN for a project the viewer can't see", async () => {
      await expect(
        asViewer(admin(), () => searchProjectTasksAction({ projectId: deletedProjectId, q: "" })),
      ).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(admin(), () => searchProjectTasksAction({ projectId: randomUUID(), q: "" }))).rejects.toThrow(
        "FORBIDDEN",
      );
      perms.noProjects = true;
      await expect(asViewer(colaborador(), () => searchProjectTasksAction({ projectId, q: "" }))).rejects.toThrow(
        "FORBIDDEN",
      );
    });

    it("is FORBIDDEN without the Tareas capability and for a guest", async () => {
      perms.noActivities = true;
      await expect(asViewer(colaborador(), () => searchProjectTasksAction({ projectId, q: "" }))).rejects.toThrow(
        "FORBIDDEN",
      );
      perms.noActivities = false;
      await expect(asViewer(null, () => searchProjectTasksAction({ projectId, q: "" }))).rejects.toThrow("FORBIDDEN");
    });

    it("searches only the given project", async () => {
      const rows = await asViewer(admin(), () => searchProjectTasksAction({ projectId, q: "Huérfana" }));
      expect(rows).toEqual([]);
      const [check] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, orphanTaskId));
      expect(check?.id).toBe(orphanTaskId);
    });
  });
});
