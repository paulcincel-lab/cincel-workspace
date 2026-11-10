// @vitest-environment node
/**
 * Name-only project create and admin-only project fields against a real
 * Postgres (project flow BE §9.4, §9.5, §9.9). Runs only when
 * TEST_DATABASE_URL points at a migrated, seeded database. Every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockTramoCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("createProject / updateProject (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockTramoCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { and, asc, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/projects-repository");
  const adminTasks = await import("@/lib/project-flow/admin-tasks");

  let actorId = "";
  let adminId = "";
  let contactId = "";
  const projectIds: string[] = [];
  let firstWorkflow: { id: string; autoStart: "manual" | "on_create" | "on_ready" } | null = null;

  const admin = { staffId: "", isAdmin: true };
  const nonAdmin = { staffId: "", isAdmin: false };

  async function create(name: string) {
    const project = await repo.createProject({ name }, actorId);
    projectIds.push(project.id);
    return project;
  }

  async function assignClientTasks(projectId: string) {
    return db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.tasks.systemKey, "assign_client"),
          isNull(schema.tasks.deletedAt)
        )
      );
  }

  async function setFirstAutoStart(value: "manual" | "on_create") {
    if (!firstWorkflow) return;
    await db.update(schema.workflows).set({ autoStart: value }).where(eq(schema.workflows.id, firstWorkflow.id));
  }

  beforeAll(async () => {
    // What scripts/migrate.mjs seeds after the migrations (BE §5.4); idempotent, never updates existing rows.
    const { default: postgres } = await import("postgres");
    const { ensureDefaultWorkflows } = await import("@/scripts/default-workflows.mjs");
    const { ensureDefaultCatalog } = await import("@/scripts/default-catalog.mjs");
    const seedSql = postgres(url!, { max: 1, onnotice: () => {} });
    try {
      await ensureDefaultWorkflows(seedSql);
      await ensureDefaultCatalog(seedSql);
    } finally {
      await seedSql.end();
    }

    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Flow staff ${run}`, role: "Colaborador" })
      .returning({ id: schema.staff.id });
    actorId = member!.id;
    nonAdmin.staffId = actorId;
    const [adminRow] = await db
      .insert(schema.staff)
      .values({ name: `Flow admin ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    adminId = adminRow!.id;
    admin.staffId = adminId;
    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ${run}` })
      .returning({ id: schema.contacts.id });
    contactId = contact!.id;
    const [wf] = await db
      .select({ id: schema.workflows.id, autoStart: schema.workflows.autoStart })
      .from(schema.workflows)
      .where(and(eq(schema.workflows.active, true), isNull(schema.workflows.deletedAt)))
      .orderBy(asc(schema.workflows.sortOrder), asc(schema.workflows.name))
      .limit(1);
    firstWorkflow = wf ?? null;
  });

  afterAll(async () => {
    if (firstWorkflow) {
      await db
        .update(schema.workflows)
        .set({ autoStart: firstWorkflow.autoStart })
        .where(eq(schema.workflows.id, firstWorkflow.id));
    }
    if (projectIds.length > 0) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, projectIds));
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.tramoStartBatches).where(inArray(schema.tramoStartBatches.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [actorId, adminId]));
  });

  it("creates a project with only a name: Presale with its tasks and one open assign_client task", async () => {
    expect(firstWorkflow).not.toBeNull();
    await setFirstAutoStart("on_create");
    const project = await create(`Casa Flujo ${run}`);

    expect(project.client).toBeNull();
    expect(project.tramos.map((t) => t.id)).toEqual([firstWorkflow!.id]);
    expect(project.currentWorkflow?.id).toBe(firstWorkflow!.id);

    const templates = await db
      .select({ id: schema.workflowTaskTemplates.id })
      .from(schema.workflowTaskTemplates)
      .where(
        and(
          eq(schema.workflowTaskTemplates.workflowId, firstWorkflow!.id),
          eq(schema.workflowTaskTemplates.active, true)
        )
      );
    const workflowTasks = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, project.id), eq(schema.tasks.kind, "workflow")));
    expect(workflowTasks).toHaveLength(templates.length);
    expect(workflowTasks.length).toBe(10);
    expect(workflowTasks.every((t) => t.managerId === null)).toBe(true);

    const adminRows = await assignClientTasks(project.id);
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0]).toMatchObject({
      kind: "admin",
      title: "Asignar cliente y origen",
      priority: "alta",
      managerId: null,
      status: "pendiente",
      closedAt: null,
    });
    expect(adminRows[0].commitmentDate).toBe(adminTasks.todayInAppTimeZone());
  });

  it("does not start the first tramo when its auto-start is off", async () => {
    await setFirstAutoStart("manual");
    const project = await create(`Casa Manual ${run}`);
    expect(project.tramos).toEqual([]);
    expect(project.needsTramo).toBe(true);
    const workflowTasks = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, project.id), eq(schema.tasks.kind, "workflow")));
    expect(workflowTasks).toHaveLength(0);
    expect(await assignClientTasks(project.id)).toHaveLength(1);
  });

  it("rejects a duplicate name (any case) with NAME_TAKEN and an empty name with EMPTY", async () => {
    await setFirstAutoStart("manual");
    await create(`Casa Única ${run}`);
    await expect(repo.createProject({ name: `  casa única ${run.toUpperCase()}  ` }, actorId)).rejects.toThrow(
      "NAME_TAKEN"
    );
    await expect(repo.createProject({ name: "   " }, actorId)).rejects.toThrow("EMPTY");
  });

  it("ensureAssignClientTask called twice does not create a second task", async () => {
    await setFirstAutoStart("manual");
    const project = await create(`Casa Doble ${run}`);
    const second = await db.transaction((tx) => adminTasks.ensureAssignClientTask(tx, project.id, actorId));
    expect(second).toBeNull();
    expect(await assignClientTasks(project.id)).toHaveLength(1);
  });

  it("refuses client, origin and origin staff to non-admins", async () => {
    await setFirstAutoStart("manual");
    const project = await create(`Casa Privada ${run}`);
    for (const patch of [{ clientId: contactId }, { origin: "Referido" }, { originStaffId: adminId }]) {
      await expect(repo.updateProject(project.id, patch, actorId, nonAdmin)).rejects.toThrow("FORBIDDEN");
    }
  });

  it("closes the assign_client task when an admin sets the client", async () => {
    await setFirstAutoStart("manual");
    const project = await create(`Casa Cliente ${run}`);
    const updated = await repo.updateProject(
      project.id,
      { clientId: contactId, origin: "Referido", originStaffId: adminId },
      adminId,
      admin
    );
    expect(updated.client?.id).toBe(contactId);
    const [task] = await assignClientTasks(project.id);
    expect(task.status).toBe("completado");
    expect(task.closedAt).not.toBeNull();
    expect(task.customStatusId).toBeNull();
  });

  it("rejects renaming onto a taken name", async () => {
    await setFirstAutoStart("manual");
    await create(`Casa Norte ${run}`);
    const other = await create(`Casa Sur ${run}`);
    await expect(repo.updateProject(other.id, { name: `CASA NORTE ${run}` }, actorId, nonAdmin)).rejects.toThrow(
      "NAME_TAKEN"
    );
  });

  async function workflowByKey(key: string) {
    const [wf] = await db
      .select({ id: schema.workflows.id })
      .from(schema.workflows)
      .where(and(eq(schema.workflows.key, key), isNull(schema.workflows.deletedAt)))
      .limit(1);
    const phases = await db
      .select({ id: schema.workflowPhases.id })
      .from(schema.workflowPhases)
      .where(and(eq(schema.workflowPhases.workflowId, wf!.id), eq(schema.workflowPhases.active, true)))
      .orderBy(asc(schema.workflowPhases.sortOrder));
    return { id: wf!.id, phaseIds: phases.map((p) => p.id) };
  }

  async function stagesOf(projectId: string) {
    return db
      .select({ workflowId: schema.projectStages.workflowId })
      .from(schema.projectStages)
      .where(eq(schema.projectStages.projectId, projectId));
  }

  async function workflowTasksOf(projectId: string) {
    return db
      .select({ workflowId: schema.tasks.workflowId, phaseId: schema.tasks.phaseId, managerId: schema.tasks.managerId })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.kind, "workflow")));
  }

  it("starts the chosen tramo with only the checked fases (#1034)", async () => {
    await setFirstAutoStart("on_create");
    const diseno = await workflowByKey("diseno");
    expect(diseno.phaseIds.length).toBeGreaterThan(1);
    const checked = diseno.phaseIds.slice(0, 1);
    const project = await repo.createProject(
      { name: `Casa Diseño ${run}`, startWorkflowId: diseno.id, phaseIds: checked },
      actorId
    );
    projectIds.push(project.id);

    expect(await stagesOf(project.id)).toEqual([{ workflowId: diseno.id }]);
    expect(project.currentWorkflow?.id).toBe(diseno.id);
    const tasks = await workflowTasksOf(project.id);
    const templates = await db
      .select({ id: schema.workflowTaskTemplates.id })
      .from(schema.workflowTaskTemplates)
      .where(
        and(
          inArray(schema.workflowTaskTemplates.phaseId, checked),
          eq(schema.workflowTaskTemplates.active, true)
        )
      );
    expect(tasks).toHaveLength(templates.length);
    expect(tasks.every((t) => t.workflowId === diseno.id && checked.includes(t.phaseId!))).toBe(true);
    expect(tasks.every((t) => t.managerId === null)).toBe(true);
    const [batch] = await db
      .select({ trigger: schema.tramoStartBatches.trigger })
      .from(schema.tramoStartBatches)
      .where(eq(schema.tramoStartBatches.projectId, project.id));
    expect(batch?.trigger).toBe("on_create");
    expect(await assignClientTasks(project.id)).toHaveLength(1);
  });

  it("starts every active fase of the chosen tramo when phaseIds is missing", async () => {
    await setFirstAutoStart("manual");
    const diseno = await workflowByKey("diseno");
    const project = await repo.createProject({ name: `Casa Diseño Todo ${run}`, startWorkflowId: diseno.id }, actorId);
    projectIds.push(project.id);
    const tasks = await workflowTasksOf(project.id);
    expect(new Set(tasks.map((t) => t.phaseId))).toEqual(
      new Set(
        (
          await db
            .select({ phaseId: schema.workflowTaskTemplates.phaseId })
            .from(schema.workflowTaskTemplates)
            .where(
              and(
                inArray(schema.workflowTaskTemplates.phaseId, diseno.phaseIds),
                eq(schema.workflowTaskTemplates.active, true)
              )
            )
        ).map((t) => t.phaseId)
      )
    );
  });

  it("starts no tramo with startWorkflowId null, even when the first tramo auto-starts", async () => {
    await setFirstAutoStart("on_create");
    const project = await repo.createProject({ name: `Casa Ninguno ${run}`, startWorkflowId: null }, actorId);
    projectIds.push(project.id);
    expect(await stagesOf(project.id)).toEqual([]);
    expect(project.currentWorkflow).toBeNull();
    expect(project.needsTramo).toBe(true);
    expect(await workflowTasksOf(project.id)).toHaveLength(0);
    expect(await assignClientTasks(project.id)).toHaveLength(1);
  });

  it("rejects an unknown or inactive tramo with INVALID and a foreign fase with PHASE_MISMATCH", async () => {
    await setFirstAutoStart("manual");
    await expect(
      repo.createProject({ name: `Casa Rara ${run}`, startWorkflowId: randomUUID() }, actorId)
    ).rejects.toThrow(/^INVALID/);

    const construccion = await workflowByKey("construccion");
    await db.update(schema.workflows).set({ active: false }).where(eq(schema.workflows.id, construccion.id));
    try {
      await expect(
        repo.createProject({ name: `Casa Inactiva ${run}`, startWorkflowId: construccion.id }, actorId)
      ).rejects.toThrow(/^INVALID/);
    } finally {
      await db.update(schema.workflows).set({ active: true }).where(eq(schema.workflows.id, construccion.id));
    }

    const diseno = await workflowByKey("diseno");
    await expect(
      repo.createProject(
        { name: `Casa Mezcla ${run}`, startWorkflowId: diseno.id, phaseIds: [construccion.phaseIds[0]!] },
        actorId
      )
    ).rejects.toThrow("PHASE_MISMATCH");
    await expect(
      repo.createProject({ name: `Casa Vacía ${run}`, startWorkflowId: diseno.id, phaseIds: [] }, actorId)
    ).rejects.toThrow("NO_PHASES");
    await expect(
      repo.createProject({ name: `Casa Sin Tramo ${run}`, startWorkflowId: null, phaseIds: diseno.phaseIds }, actorId)
    ).rejects.toThrow(/^INVALID/);

    // Every rejection rolled back: none of those projects exists.
    const names = [`Casa Rara ${run}`, `Casa Inactiva ${run}`, `Casa Mezcla ${run}`, `Casa Vacía ${run}`, `Casa Sin Tramo ${run}`];
    const rows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(inArray(schema.projects.name, names));
    expect(rows).toEqual([]);
  });

  it("assertAdminAssignees accepts admins and refuses anyone else", async () => {
    await expect(adminTasks.assertAdminAssignees(db, [adminId])).resolves.toBeUndefined();
    await expect(adminTasks.assertAdminAssignees(db, [adminId, actorId])).rejects.toThrow("ASSIGNEE_NOT_ADMIN");
    await expect(adminTasks.assertAdminAssignees(db, [randomUUID()])).rejects.toThrow("ASSIGNEE_NOT_ADMIN");
    await expect(adminTasks.assertAdminAssignees(db, [])).resolves.toBeUndefined();
  });
});
