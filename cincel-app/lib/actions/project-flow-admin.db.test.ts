// @vitest-environment node
/**
 * Name-only project create, the "Asignar cliente y origen" admin task and the
 * admin task assignee rules, against a real Postgres (project flow BE §7.3,
 * §7.5, §9.4, §9.5, §16). Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`).
 *
 * The actions run with their real repositories; only the session (who is
 * signed in), the capability resolvers (all granted, so the admin rules are
 * what is tested), revalidation, `after()` and Drive are mocked.
 *
 * `db:migrate` skips the `ensure*` steps, so the fixture makes sure the first
 * tramo has its catalog fases and templates (the Presale rows of
 * DEFAULT_CATALOG, BE §5.1-5.2) and removes what it added afterwards. Every
 * other row carries a per-run marker and is deleted at the end.
 */
import { unwrapActions } from "@/tests/helpers/action-result";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lockTramoCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

type Actor = { id: string; name: string; email: string; access: "Administrador" | "Colaborador" };
const session = vi.hoisted(() => ({ actor: null as null | Actor }));

function sessionUser() {
  const actor = session.actor;
  if (!actor) throw new Error("no test actor");
  return {
    member: {
      id: actor.id,
      name: actor.name,
      role: actor.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: actor.email,
      phone: "",
    },
    email: actor.email,
    access: actor.access,
  };
}

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityUser: vi.fn(async () => sessionUser()),
}));

// Every capability granted, so only the administrator rules can refuse.
const allGranted = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (key === "statusScope" ? "all" : key === "then" ? undefined : true),
  });
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => allGranted(),
  resolveActivitiesCapabilities: () => allGranted(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// Drive and the closing hooks run after the response; not part of these tests.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/google/project-folders-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/project-folders-app")>()),
  syncProjectFolders: vi.fn(async () => undefined),
  syncProjectFolderName: vi.fn(async () => undefined),
  retryProjectFolders: vi.fn(async () => undefined),
}));

/** Presale fases and templates of DEFAULT_CATALOG (BE §5.1-5.2): 10 templates. */
const PRESALE_CATALOG: ReadonlyArray<{ key: string; name: string; titles: string[] }> = [
  { key: "inicial", name: "Inicial", titles: ["Presentación \"Quiénes somos\""] },
  {
    key: "presentacion",
    name: "Presentación",
    titles: [
      "Reporte Estado Actual",
      "Imágenes de Referencia",
      "Plano preliminar",
      "Primeras Visualizaciones",
      "Rango de Precios",
      "Presupuesto Diseño",
    ],
  },
  { key: "con_cliente", name: "Con Cliente", titles: ["Presentar a cliente"] },
  { key: "minutas", name: "Minutas", titles: ["Minuta"] },
  { key: "cobro", name: "Cobro", titles: ["Cobrar Inicio de proyecto"] },
];

describe.skipIf(!url)("project create and admin tasks (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockTramoCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { and, asc, eq, inArray, isNull, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { ASSIGN_CLIENT_SYSTEM_KEY, ASSIGN_CLIENT_TASK_TITLE } = await import("@/lib/project-flow/catalog");
  const { createProjectAction, updateProjectAction } = unwrapActions(await import("./projects-actions"));
  const {
    assignTaskAction,
    createAdminTaskAction,
    createSubtaskAction,
    mergeTasksAction,
    setTaskSupportAction,
    updateTaskAction,
  } = unwrapActions(await import("./tasks-actions"));

  type CreateInput = Parameters<typeof createProjectAction>[0];
  const createInput = (name: string) => ({ name }) as unknown as CreateInput;

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[] };
  const seeded = { phases: [] as string[], templates: [] as string[] };
  let firstTramo = { id: "", key: "", autoStart: "manual" as "manual" | "on_create" | "on_ready" };
  let expectedTaskCount = 0;
  let admin: Actor;
  let admin2: Actor;
  let colaborador: Actor;
  let inactiveAdminId = "";
  let clientId = "";
  let n = 0;

  const name = (label: string) => `Flujo ${run} ${label} ${++n}`;

  async function addStaff(label: string, access: Actor["access"], active = true): Promise<Actor> {
    const email = `flujo-${run}-${label}@cincel.example`;
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Flujo ${run} ${label}`, email, role: access, active })
      .returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return { id: row.id, name: `Flujo ${run} ${label}`, email, access };
  }

  async function setFirstTramoAutoStart(value: "manual" | "on_create" | "on_ready") {
    await db.update(schema.workflows).set({ autoStart: value }).where(eq(schema.workflows.id, firstTramo.id));
  }

  async function createAs(actor: Actor, label: string) {
    session.actor = actor;
    const project = await createProjectAction(createInput(name(label)));
    ids.projects.push(project.id);
    return project;
  }

  async function liveTasks(projectId: string) {
    return db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), isNull(schema.tasks.deletedAt)));
  }

  async function insertAdminTask(projectId: string, title = "Revisar contrato") {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "admin", title: `${title} ${run}`, createdById: admin.id })
      .returning({ id: schema.tasks.id });
    return row.id;
  }

  beforeAll(async () => {
    admin = await addStaff("admin", "Administrador");
    admin2 = await addStaff("admin2", "Administrador");
    colaborador = await addStaff("colab", "Colaborador");
    inactiveAdminId = (await addStaff("admin-baja", "Administrador", false)).id;

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente flujo ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(contact.id);
    clientId = contact.id;

    // A database migrated with drizzle-kit has no workflows: create the defaults as migrate.mjs does.
    const live = await db
      .select({ id: schema.workflows.id })
      .from(schema.workflows)
      .where(and(eq(schema.workflows.active, true), isNull(schema.workflows.deletedAt)))
      .limit(1);
    if (live.length === 0) {
      const postgres = (await import("postgres")).default;
      const { ensureDefaultWorkflows } = await import("@/scripts/default-workflows.mjs");
      const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
      try {
        await ensureDefaultWorkflows(client);
      } finally {
        await client.end();
      }
    }

    const [first] = await db
      .select({ id: schema.workflows.id, key: schema.workflows.key, autoStart: schema.workflows.autoStart })
      .from(schema.workflows)
      .where(and(eq(schema.workflows.active, true), isNull(schema.workflows.deletedAt)))
      .orderBy(asc(schema.workflows.sortOrder))
      .limit(1);
    firstTramo = { id: first.id, key: first.key, autoStart: first.autoStart };

    const existingPhases = await db
      .select({ id: schema.workflowPhases.id })
      .from(schema.workflowPhases)
      .where(eq(schema.workflowPhases.workflowId, first.id));
    if (existingPhases.length === 0) {
      let templateOrder = 0;
      for (const [i, fase] of PRESALE_CATALOG.entries()) {
        const [phase] = await db
          .insert(schema.workflowPhases)
          .values({ workflowId: first.id, key: fase.key, name: fase.name, sortOrder: i })
          .returning({ id: schema.workflowPhases.id });
        seeded.phases.push(phase.id);
        for (const title of fase.titles) {
          const [template] = await db
            .insert(schema.workflowTaskTemplates)
            .values({ workflowId: first.id, phaseId: phase.id, title, sortOrder: templateOrder++ })
            .returning({ id: schema.workflowTaskTemplates.id });
          seeded.templates.push(template.id);
        }
      }
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.workflowTaskTemplates)
      .innerJoin(schema.workflowPhases, eq(schema.workflowPhases.id, schema.workflowTaskTemplates.phaseId))
      .where(
        and(
          eq(schema.workflowTaskTemplates.workflowId, first.id),
          eq(schema.workflowTaskTemplates.active, true),
          eq(schema.workflowPhases.active, true)
        )
      );
    expectedTaskCount = count;

    await setFirstTramoAutoStart("on_create");
  });

  beforeEach(() => {
    session.actor = admin;
  });

  afterAll(async () => {
    await setFirstTramoAutoStart(firstTramo.autoStart);
    const projectTaskIds = ids.projects.length
      ? (
          await db
            .select({ id: schema.tasks.id })
            .from(schema.tasks)
            .where(inArray(schema.tasks.projectId, ids.projects))
        ).map((r) => r.id)
      : [];
    const historyIds = [...ids.projects, ...projectTaskIds];
    if (historyIds.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, historyIds));
    }
    // Cascades tasks, stages, start batches and espacios.
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    // Best effort: another test file may have created tasks on the seeded fases meanwhile.
    try {
      if (seeded.templates.length) {
        await db.delete(schema.workflowTaskTemplates).where(inArray(schema.workflowTaskTemplates.id, seeded.templates));
      }
      if (seeded.phases.length) {
        await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.id, seeded.phases));
      }
    } catch {
      // Left in place; a fresh CI database is thrown away after the run.
    }
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  describe("createProjectAction (name only)", () => {
    it("opens the first etapa with every template task, unassigned, plus one assign_client admin task", async () => {
      const project = await createAs(admin, "nuevo");

      const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
      expect(row.clientId).toBeNull();
      expect(row.status).toBe("activo");
      expect(row.currentWorkflowId).toBe(firstTramo.id);

      const stages = await db
        .select()
        .from(schema.projectStages)
        .where(eq(schema.projectStages.projectId, project.id));
      expect(stages.map((s) => s.workflowId)).toEqual([firstTramo.id]);

      const tasks = await liveTasks(project.id);
      const flow = tasks.filter((t) => t.kind === "workflow");
      if (seeded.templates.length || firstTramo.key === "presale") expect(expectedTaskCount).toBe(10);
      expect(flow).toHaveLength(expectedTaskCount);
      expect(flow.every((t) => t.workflowId === firstTramo.id && t.phaseId && t.templateId)).toBe(true);
      // Auto-started tasks are "Sin asignar" (BE §9.4).
      expect(flow.every((t) => t.managerId === null)).toBe(true);
      expect(new Set(flow.map((t) => t.templateId)).size).toBe(flow.length);

      const adminTasks = tasks.filter((t) => t.kind === "admin");
      expect(adminTasks).toHaveLength(1);
      expect(adminTasks[0]).toMatchObject({
        systemKey: ASSIGN_CLIENT_SYSTEM_KEY,
        title: ASSIGN_CLIENT_TASK_TITLE,
        priority: "alta",
        managerId: null,
        workflowId: null,
        phaseId: null,
        closedAt: null,
      });
      expect(adminTasks[0].status).not.toBe("completado");
      expect(adminTasks[0].commitmentDate).toBeTruthy();
      expect(tasks.filter((t) => t.kind === "usuario")).toHaveLength(0);
    });

    it("with auto-start off leaves the etapa unstarted but still adds the admin task", async () => {
      await setFirstTramoAutoStart("manual");
      try {
        const project = await createAs(admin, "sin-inicio");

        const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
        expect(row.currentWorkflowId).toBeNull();
        const stages = await db
          .select()
          .from(schema.projectStages)
          .where(eq(schema.projectStages.projectId, project.id));
        expect(stages).toHaveLength(0);

        const tasks = await liveTasks(project.id);
        expect(tasks.filter((t) => t.kind === "workflow")).toHaveLength(0);
        expect(tasks.filter((t) => t.kind === "admin" && t.systemKey === ASSIGN_CLIENT_SYSTEM_KEY)).toHaveLength(1);
      } finally {
        await setFirstTramoAutoStart("on_create");
      }
    });

    it("refuses a name an active project already uses with NAME_TAKEN", async () => {
      const project = await createAs(admin, "duplicado");
      const [row] = await db
        .select({ name: schema.projects.name })
        .from(schema.projects)
        .where(eq(schema.projects.id, project.id));
      await expect(createProjectAction(createInput(` ${row.name.toUpperCase()} `))).rejects.toThrow(/^NAME_TAKEN/);
    });

    it("refuses a blank name with EMPTY", async () => {
      await expect(createProjectAction(createInput("   "))).rejects.toThrow(/^EMPTY/);
    });

    it("lets a non-administrator create a project, with the same admin task", async () => {
      const project = await createAs(colaborador, "colab");
      const tasks = await liveTasks(project.id);
      expect(tasks.filter((t) => t.kind === "admin" && t.systemKey === ASSIGN_CLIENT_SYSTEM_KEY)).toHaveLength(1);
    });
  });

  describe("updateProjectAction (client and origin)", () => {
    it("setting a client closes the assign_client task", async () => {
      const project = await createAs(admin, "cliente");
      await updateProjectAction(project.id, { clientId });

      const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
      expect(row.clientId).toBe(clientId);

      const [task] = await db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, project.id), eq(schema.tasks.systemKey, ASSIGN_CLIENT_SYSTEM_KEY)));
      expect(task.status).toBe("completado");
      expect(task.customStatusId).toBeNull();
      expect(task.closedAt).not.toBeNull();
      expect(task.deletedAt).toBeNull();
    });

    it("clearing the client later doesn't reopen or recreate the task", async () => {
      const project = await createAs(admin, "cliente-quitado");
      await updateProjectAction(project.id, { clientId });
      await updateProjectAction(project.id, { clientId: null });

      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, project.id),
            eq(schema.tasks.systemKey, ASSIGN_CLIENT_SYSTEM_KEY),
            isNull(schema.tasks.deletedAt)
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("completado");
    });

    it("a non-administrator sending clientId gets FORBIDDEN and nothing changes", async () => {
      const project = await createAs(admin, "cliente-colab");
      session.actor = colaborador;
      await expect(updateProjectAction(project.id, { clientId })).rejects.toThrow(/^FORBIDDEN/);
      await expect(updateProjectAction(project.id, { origin: "Recomendación" })).rejects.toThrow(/^FORBIDDEN/);
      await expect(updateProjectAction(project.id, { originStaffId: colaborador.id })).rejects.toThrow(/^FORBIDDEN/);

      const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
      expect(row.clientId).toBeNull();
      expect(row.origin).toBeNull();
      expect(row.originStaffId).toBeNull();
      const [task] = await db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, project.id), eq(schema.tasks.systemKey, ASSIGN_CLIENT_SYSTEM_KEY)));
      expect(task.status).not.toBe("completado");
    });

    it("a non-administrator can still edit the general fields", async () => {
      const project = await createAs(admin, "general-colab");
      session.actor = colaborador;
      const renamed = name("renombrado");
      await updateProjectAction(project.id, { name: renamed });
      const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
      expect(row.name).toBe(renamed);
    });
  });

  describe("admin task actions", () => {
    let projectId = "";
    let phaseId = "";
    let spaceId = "";

    beforeAll(async () => {
      session.actor = admin;
      projectId = (await createAs(admin, "tareas-admin")).id;
      const [phase] = await db
        .select({ id: schema.workflowPhases.id })
        .from(schema.workflowPhases)
        .where(and(eq(schema.workflowPhases.workflowId, firstTramo.id), eq(schema.workflowPhases.active, true)))
        .limit(1);
      phaseId = phase.id;
      const [space] = await db
        .insert(schema.projectSpaces)
        .values({ projectId, name: `Depto ${run}` })
        .returning({ id: schema.projectSpaces.id });
      spaceId = space.id;
    });

    describe("createAdminTaskAction", () => {
      it("creates an admin task with administrator assignees", async () => {
        const task = await createAdminTaskAction({
          projectId,
          title: `Firmar contrato ${run}`,
          managerId: admin.id,
          supportIds: [admin2.id],
        });
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
        expect(row).toMatchObject({ kind: "admin", managerId: admin.id, workflowId: null, phaseId: null, spaceId: null });
        const support = await db.select().from(schema.taskSupport).where(eq(schema.taskSupport.taskId, task.id));
        expect(support.map((s) => s.staffId)).toEqual([admin2.id]);
      });

      it("refuses a non-administrator responsable with ASSIGNEE_NOT_ADMIN", async () => {
        await expect(
          createAdminTaskAction({ projectId, title: `Cobro ${run}`, managerId: colaborador.id })
        ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });

      it("refuses a non-administrator in apoyo with ASSIGNEE_NOT_ADMIN", async () => {
        await expect(
          createAdminTaskAction({ projectId, title: `Cobro ${run}`, managerId: admin.id, supportIds: [colaborador.id] })
        ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });

      it("refuses an inactive administrator with ASSIGNEE_NOT_ADMIN", async () => {
        await expect(
          createAdminTaskAction({ projectId, title: `Cobro ${run}`, managerId: inactiveAdminId })
        ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });

      it("is FORBIDDEN for a non-administrator", async () => {
        session.actor = colaborador;
        await expect(createAdminTaskAction({ projectId, title: `Cobro ${run}` })).rejects.toThrow(/^FORBIDDEN/);
      });

      it("refuses an unknown project with NOT_FOUND", async () => {
        await expect(createAdminTaskAction({ projectId: randomUUID(), title: `Cobro ${run}` })).rejects.toThrow(
          /^NOT_FOUND/
        );
      });
    });

    describe("updateTaskAction on an admin task", () => {
      it("accepts an administrator responsable", async () => {
        const taskId = await insertAdminTask(projectId);
        await updateTaskAction(taskId, { managerId: admin2.id });
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
        expect(row.managerId).toBe(admin2.id);
      });

      it("refuses a non-administrator responsable with ASSIGNEE_NOT_ADMIN", async () => {
        const taskId = await insertAdminTask(projectId);
        await expect(updateTaskAction(taskId, { managerId: colaborador.id })).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
        expect(row.managerId).toBeNull();
      });

      it("refuses a fase with ADMIN_TASK", async () => {
        const taskId = await insertAdminTask(projectId);
        await expect(updateTaskAction(taskId, { phaseId })).rejects.toThrow(/^ADMIN_TASK/);
      });

      it("refuses an espacio with ADMIN_TASK", async () => {
        const taskId = await insertAdminTask(projectId);
        await expect(updateTaskAction(taskId, { spaceId })).rejects.toThrow(/^ADMIN_TASK/);
      });

      it("is FORBIDDEN for a non-administrator", async () => {
        const taskId = await insertAdminTask(projectId);
        session.actor = colaborador;
        await expect(updateTaskAction(taskId, { title: `Otro ${run}` })).rejects.toThrow(/^FORBIDDEN/);
      });
    });

    describe("assignTaskAction on an admin task", () => {
      it("accepts an administrator", async () => {
        const taskId = await insertAdminTask(projectId);
        await assignTaskAction(taskId, admin.id);
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
        expect(row.managerId).toBe(admin.id);
      });

      it("refuses a non-administrator with ASSIGNEE_NOT_ADMIN", async () => {
        const taskId = await insertAdminTask(projectId);
        await expect(assignTaskAction(taskId, colaborador.id)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });

      it("still lets a non-admin assignee take an ordinary task", async () => {
        const [task] = await db
          .insert(schema.tasks)
          .values({ projectId, kind: "usuario", title: `Usuario ${run}`, createdById: admin.id })
          .returning({ id: schema.tasks.id });
        await assignTaskAction(task.id, colaborador.id);
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
        expect(row.managerId).toBe(colaborador.id);
      });
    });

    describe("setTaskSupportAction on an admin task", () => {
      it("accepts administrators", async () => {
        const taskId = await insertAdminTask(projectId);
        await setTaskSupportAction(taskId, [admin2.id]);
        const support = await db.select().from(schema.taskSupport).where(eq(schema.taskSupport.taskId, taskId));
        expect(support.map((s) => s.staffId)).toEqual([admin2.id]);
      });

      it("refuses a non-administrator with ASSIGNEE_NOT_ADMIN", async () => {
        const taskId = await insertAdminTask(projectId);
        await expect(setTaskSupportAction(taskId, [admin2.id, colaborador.id])).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
        const support = await db.select().from(schema.taskSupport).where(eq(schema.taskSupport.taskId, taskId));
        expect(support).toHaveLength(0);
      });
    });

    describe("createSubtaskAction under an admin task", () => {
      it("makes an admin child with no etapa or fase", async () => {
        const parentId = await insertAdminTask(projectId);
        const child = await createSubtaskAction(parentId, { title: `Hija ${run}`, managerId: admin2.id });
        const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, child.id));
        expect(row).toMatchObject({ kind: "admin", parentTaskId: parentId, workflowId: null, phaseId: null });
      });

      it("refuses a non-administrator responsable with ASSIGNEE_NOT_ADMIN", async () => {
        const parentId = await insertAdminTask(projectId);
        await expect(
          createSubtaskAction(parentId, { title: `Hija ${run}`, managerId: colaborador.id })
        ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });

      it("refuses a non-administrator in apoyo with ASSIGNEE_NOT_ADMIN", async () => {
        const parentId = await insertAdminTask(projectId);
        await expect(
          createSubtaskAction(parentId, { title: `Hija ${run}`, supportIds: [colaborador.id] })
        ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
      });
    });

    describe("mergeTasksAction", () => {
      it("refuses to merge an admin task with an ordinary one, either way", async () => {
        const adminTaskId = await insertAdminTask(projectId);
        const [usuario] = await db
          .insert(schema.tasks)
          .values({ projectId, kind: "usuario", title: `Duplicada ${run}`, createdById: admin.id })
          .returning({ id: schema.tasks.id });

        await expect(mergeTasksAction(adminTaskId, [usuario.id])).rejects.toThrow(/^INVALID/);
        await expect(mergeTasksAction(usuario.id, [adminTaskId])).rejects.toThrow(/^INVALID/);

        const rows = await db
          .select({ id: schema.tasks.id, deletedAt: schema.tasks.deletedAt })
          .from(schema.tasks)
          .where(inArray(schema.tasks.id, [adminTaskId, usuario.id]));
        expect(rows.every((r) => r.deletedAt === null)).toBe(true);
      });

      it("merges two admin tasks", async () => {
        const keepId = await insertAdminTask(projectId, "Conservar");
        const dupId = await insertAdminTask(projectId, "Duplicada");
        await mergeTasksAction(keepId, [dupId]);
        const [dup] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, dupId));
        expect(dup.deletedAt).not.toBeNull();
      });
    });
  });
});
