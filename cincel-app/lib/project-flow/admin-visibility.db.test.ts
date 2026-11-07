// @vitest-environment node
/**
 * Admin visibility across every reader (project flow BE §12, §16; issue 736).
 *
 * One seeded project with a client, an origin and an admin task, read through
 * every reader as an administrator and as a non-administrator ("Dirección":
 * every module capability, but not admin data). Non-admins must never get the
 * admin task, the client or the origin from lists, board, calendar, ICS feed,
 * Google Calendar sync, dashboard, Mis tareas, project and contact reads,
 * project history and monday import data; crafted calls on the admin task id
 * get `FORBIDDEN`. Administrators see everything. The client-less project
 * refuses portal invites with `no_client`.
 *
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row a test creates carries a per-run marker
 * and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

// ── Session: the viewer is switched per test ────────────────────────────────

const viewer = vi.hoisted(() => ({ user: null as AuthenticatedUser | null }));

function sessionUser() {
  const user = viewer.user;
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => sessionUser()),
  requireSessionAccess: vi.fn(async () => {
    const user = sessionUser();
    return {
      id: user.member.id,
      name: user.member.name,
      email: user.email,
      role: user.access,
      active: true,
      access: user.access,
    };
  }),
  getSessionAccess: vi.fn(async () => {
    const user = viewer.user;
    if (!user) return { status: "guest", user: null };
    return {
      status: "active",
      user: { id: user.member.id, name: user.member.name, email: user.email, role: user.access, access: user.access },
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // Post-response work (folder sync, auto-start) is out of scope here.
  after: vi.fn(),
}));

vi.mock("@/lib/email", () => ({ sendMail: vi.fn(async () => ({ sent: false })) }));

// Google Calendar sync: a connected token and a recorded event insert.
const calendarApi = vi.hoisted(() => ({
  inserted: [] as Array<{ summary: string; description?: string }>,
}));
vi.mock("@/lib/google/staff-token", () => ({
  getStaffAccessToken: vi.fn(async () => ({ status: "ok", accessToken: "test-token" })),
}));
vi.mock("@/lib/google/calendar-api", () => {
  class GoogleCalendarError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return {
    GoogleCalendarError,
    isGone: () => false,
    createCalendar: vi.fn(async () => `cal-${run}`),
    getCalendar: vi.fn(async () => undefined),
    insertEvent: vi.fn(async (_token: string, _calendarId: string, event: { summary: string; description?: string }) => {
      calendarApi.inserted.push(event);
      return `evt-${calendarApi.inserted.length}`;
    }),
    patchEvent: vi.fn(async () => undefined),
    deleteEvent: vi.fn(async () => undefined),
  };
});

// Dashboard trend: record what reaches the bucketing step.
const trend = vi.hoisted(() => ({
  calls: [] as Array<{ createdAt: Date[]; completions: Array<{ taskId: string; at: Date }> }>,
}));
vi.mock("@/lib/dashboard/task-trend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard/task-trend")>();
  return {
    ...actual,
    bucketTaskTrend: (input: Parameters<typeof actual.bucketTaskTrend>[0]) => {
      trend.calls.push({ createdAt: [...input.createdAt], completions: [...input.completions] });
      return actual.bucketTaskTrend(input);
    },
  };
});

function userFor(id: string, name: string, email: string, access: AuthenticatedUser["access"]): AuthenticatedUser {
  return {
    member: {
      id,
      name,
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: email,
      phone: "",
    },
    email,
    access,
  } as unknown as AuthenticatedUser;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe.skipIf(!url)("admin visibility across every reader (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { NextRequest } = await import("next/server");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const tasksActions = await import("@/lib/actions/tasks-actions");
  const projectsActions = await import("@/lib/actions/projects-actions");
  const contactsActions = await import("@/lib/actions/contacts-actions");
  const importActions = await import("@/lib/actions/import-actions");
  const portalActions = await import("@/lib/actions/portal-actions");
  const dashboardActions = await import("@/lib/actions/dashboard-actions");
  const feedRepository = await import("@/lib/repositories/calendar-feed-repository");
  const feedRoute = await import("@/app/api/calendario/feed/[file]/route");
  const attachmentRoute = await import("@/app/api/tareas/[taskId]/adjuntos/[attachmentId]/route");
  const { syncGoogleCalendar } = await import("@/lib/google/calendar-sync-service");

  const clientName = `Cliente Visibilidad ${run}`;
  const clientEmail = `cliente-${run}@example.com`;
  const clientPhone = `55 ${run.slice(0, 4)} 0000`;
  const origin = `Recomendación de Ana ${run}`;
  const visibleTitle = `Tarea visible ${run}`;
  const adminTitle = `Asignar cliente y origen ${run}`;
  const adminChildTitle = `Subtarea admin ${run}`;
  const adminComment = `Comentario admin ${run}`;

  const ids = {
    admin: "",
    nonAdmin: "",
    client: "",
    project: "",
    clientless: "",
    visibleTask: "",
    adminTask: "",
    adminChild: "",
    checklistItem: "",
    link: "",
    attachment: "",
    batch: "",
    customStatus: null as string | null,
  };
  let adminUser: AuthenticatedUser;
  let nonAdminUser: AuthenticatedUser;
  let adminCreatedAt: Date;

  const asAdmin = () => {
    viewer.user = adminUser;
  };
  const asNonAdmin = () => {
    viewer.user = nonAdminUser;
  };

  async function adminTaskRow() {
    const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, ids.adminTask));
    return row!;
  }

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Admin visibilidad ${run}`, email: `admin-${run}@example.com`, role: "Administrador" },
        { name: `Dirección visibilidad ${run}`, email: `direccion-${run}@example.com`, role: "Dirección" },
      ])
      .returning({ id: schema.staff.id });
    ids.admin = people[0]!.id;
    ids.nonAdmin = people[1]!.id;
    adminUser = userFor(ids.admin, `Admin visibilidad ${run}`, `admin-${run}@example.com`, "Administrador");
    nonAdminUser = userFor(ids.nonAdmin, `Dirección visibilidad ${run}`, `direccion-${run}@example.com`, "Dirección");

    const [client] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: clientName, email: clientEmail, phone: clientPhone })
      .returning({ id: schema.contacts.id });
    ids.client = client!.id;

    const created = await db
      .insert(schema.projects)
      .values([
        {
          name: `Casa visibilidad ${run}`,
          clientId: ids.client,
          origin,
          originStaffId: ids.admin,
          managerId: ids.nonAdmin,
        },
        { name: `Casa sin cliente ${run}` },
      ])
      .returning({ id: schema.projects.id });
    ids.project = created[0]!.id;
    ids.clientless = created[1]!.id;

    const [visible] = await db
      .insert(schema.tasks)
      .values({
        projectId: ids.project,
        kind: "usuario",
        title: visibleTitle,
        createdById: ids.admin,
        managerId: ids.nonAdmin,
        commitmentDate: today(),
      })
      .returning({ id: schema.tasks.id });
    ids.visibleTask = visible!.id;

    // The admin task is assigned to the admin, with the non-admin as support:
    // a crafted row (assignees are admins only) that must still never reach them.
    adminCreatedAt = new Date(Date.now() - 1_234);
    const [adminTask] = await db
      .insert(schema.tasks)
      .values({
        projectId: ids.project,
        kind: "admin",
        systemKey: "assign_client",
        title: adminTitle,
        createdById: ids.admin,
        managerId: ids.admin,
        commitmentDate: today(),
        createdAt: adminCreatedAt,
      })
      .returning({ id: schema.tasks.id });
    ids.adminTask = adminTask!.id;
    await db.insert(schema.taskSupport).values({ taskId: ids.adminTask, staffId: ids.nonAdmin });

    const [child] = await db
      .insert(schema.tasks)
      .values({
        projectId: ids.project,
        kind: "admin",
        title: adminChildTitle,
        createdById: ids.admin,
        managerId: ids.admin,
        parentTaskId: ids.adminTask,
      })
      .returning({ id: schema.tasks.id });
    ids.adminChild = child!.id;

    const [item] = await db
      .insert(schema.taskChecklistItems)
      .values({ taskId: ids.adminTask, title: `Punto admin ${run}` })
      .returning({ id: schema.taskChecklistItems.id });
    ids.checklistItem = item!.id;

    const [link] = await db
      .insert(schema.taskLinks)
      .values({ taskId: ids.adminTask, kind: "interno", title: `Liga admin ${run}`, url: "https://example.com/admin" })
      .returning({ id: schema.taskLinks.id });
    ids.link = link!.id;

    const bytes = Buffer.from(`adjunto ${run}`);
    const [attachment] = await db
      .insert(schema.taskAttachments)
      .values({
        taskId: ids.adminTask,
        fileName: `adjunto-${run}.txt`,
        mimeType: "text/plain",
        sizeBytes: bytes.length,
        data: bytes,
        uploadedById: ids.admin,
      })
      .returning({ id: schema.taskAttachments.id });
    ids.attachment = attachment!.id;

    // The visible task waits on the admin task (dependency pickers and lists).
    await db.insert(schema.taskDependencies).values({ taskId: ids.visibleTask, dependsOnTaskId: ids.adminTask });

    await db.insert(schema.historyEvents).values([
      { entity: "task", entityId: ids.adminTask, kind: "comentario", actorId: ids.admin, comment: adminComment },
      // A completion in the dashboard window.
      {
        entity: "task",
        entityId: ids.adminTask,
        kind: "cambio",
        actorId: ids.admin,
        field: "status",
        beforeValue: "pendiente",
        afterValue: "completado",
      },
      { entity: "project", entityId: ids.project, kind: "cambio", actorId: ids.admin, field: "clientId", beforeValue: null, afterValue: ids.client },
      { entity: "project", entityId: ids.project, kind: "cambio", actorId: ids.admin, field: "origin", beforeValue: null, afterValue: origin },
      { entity: "project", entityId: ids.project, kind: "cambio", actorId: ids.admin, field: "originStaffId", beforeValue: null, afterValue: ids.admin },
      { entity: "project", entityId: ids.project, kind: "cambio", actorId: ids.admin, field: "name", beforeValue: "Casa", afterValue: `Casa visibilidad ${run}` },
    ]);

    // monday import data: the project's client columns and the admin task.
    // Column ids equal their titles so either key works for the filter.
    const [batch] = await db
      .insert(schema.importBatches)
      .values({
        accountId: `acct-${run}`,
        exportedAt: new Date(),
        exportPath: `/tmp/visibilidad-${run}`,
        appliedById: ids.admin,
        status: "applied",
        mapping: {
          version: 1,
          boards: [
            {
              mondayBoardId: `board-${run}`,
              name: `Tablero ${run}`,
              strategy: "item_as_project",
              columns: {
                Cliente: "client",
                Correo: "contact_email",
                Teléfono: "contact_phone",
                Notas: "import_data",
              },
              statusMaps: {},
            },
          ],
          people: {},
          options: { includeUpdates: true, includeFiles: true },
        },
      })
      .returning({ id: schema.importBatches.id });
    ids.batch = batch!.id;
    const source = { boardId: `board-${run}`, boardName: `Tablero ${run}`, groupId: "g1", groupTitle: "Grupo" };
    await db.insert(schema.importRefs).values([
      {
        source: "monday",
        entity: "project",
        externalId: `item-${run}`,
        rowId: ids.project,
        batchId: ids.batch,
        data: {
          source,
          columns: { Cliente: clientName, Correo: clientEmail, Teléfono: clientPhone, Notas: `Medidas listas ${run}` },
        },
      },
      {
        source: "monday",
        entity: "task",
        externalId: `subitem-${run}`,
        rowId: ids.adminTask,
        batchId: ids.batch,
        data: { source, columns: { Notas: `Dato admin ${run}` } },
      },
    ]);

    const [status] = await db.select({ id: schema.taskStatuses.id }).from(schema.taskStatuses).limit(1);
    ids.customStatus = status?.id ?? null;
  });

  beforeEach(() => {
    viewer.user = null;
  });

  afterAll(async () => {
    const staffIds = [ids.admin, ids.nonAdmin].filter(Boolean);
    const projectIds = [ids.project, ids.clientless].filter(Boolean);
    if (ids.batch) {
      await db.delete(schema.importRefs).where(eq(schema.importRefs.batchId, ids.batch));
      await db.delete(schema.importBatches).where(eq(schema.importBatches.id, ids.batch));
    }
    if (projectIds.length > 0) {
      const taskRows = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(inArray(schema.tasks.projectId, projectIds));
      const entityIds = [...projectIds, ...taskRows.map((t) => t.id)];
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, entityIds));
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (ids.client) await db.delete(schema.contacts).where(eq(schema.contacts.id, ids.client));
    if (staffIds.length > 0) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, staffIds));
      // Feed tokens and Google Calendar sync rows cascade with the staff rows.
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  // ── Task lists, board, calendar, Mis tareas ───────────────────────────────

  describe("task readers", () => {
    it("non-admin: Actividades list has no admin task and no client name", async () => {
      asNonAdmin();
      const rows = await tasksActions.fetchTasksAction({ projectId: ids.project });
      const taskIds = rows.map((t) => t.id);
      expect(taskIds).toContain(ids.visibleTask);
      expect(taskIds).not.toContain(ids.adminTask);
      expect(taskIds).not.toContain(ids.adminChild);
      for (const row of rows) expect(row.project.clientName).toBeNull();
      expect(JSON.stringify(rows)).not.toContain(clientName);
    });

    it("non-admin: asking for kind admin still returns nothing", async () => {
      asNonAdmin();
      const rows = await tasksActions.fetchTasksAction({ projectId: ids.project, kind: "admin" });
      expect(rows.map((t) => t.id)).not.toContain(ids.adminTask);
      expect(rows.every((t) => t.kind !== "admin")).toBe(true);
    });

    it("non-admin: board has no admin task and no client name", async () => {
      asNonAdmin();
      const board = await tasksActions.fetchBoardAction({ projectId: ids.project });
      const rows = Object.values(board).flat();
      expect(rows.map((t) => t.id)).toContain(ids.visibleTask);
      expect(rows.map((t) => t.id)).not.toContain(ids.adminTask);
      for (const row of rows) expect(row.project.clientName).toBeNull();
    });

    it("non-admin: calendar has no admin task and no client name", async () => {
      asNonAdmin();
      const rows = await tasksActions.fetchCalendarAction(today(), today(), { projectId: ids.project });
      expect(rows.map((t) => t.id)).toContain(ids.visibleTask);
      expect(rows.map((t) => t.id)).not.toContain(ids.adminTask);
      for (const row of rows) expect(row.project.clientName).toBeNull();
    });

    it("non-admin: Mis tareas skips the admin task they support", async () => {
      asNonAdmin();
      const rows = await tasksActions.fetchMyTasksAction();
      const taskIds = rows.map((t) => t.id);
      expect(taskIds).toContain(ids.visibleTask);
      expect(taskIds).not.toContain(ids.adminTask);
      expect(JSON.stringify(rows)).not.toContain(clientName);
    });

    it("admin: lists show the client name and admin tasks when asked", async () => {
      asAdmin();
      const rows = await tasksActions.fetchTasksAction({ projectId: ids.project });
      const visible = rows.find((t) => t.id === ids.visibleTask);
      expect(visible?.project.clientName).toBe(clientName);

      const admin = await tasksActions.fetchTasksAction({ projectId: ids.project, kind: "admin" });
      expect(admin.map((t) => t.id)).toContain(ids.adminTask);

      const board = await tasksActions.fetchBoardAction({ projectId: ids.project });
      expect(Object.values(board).flat().find((t) => t.id === ids.visibleTask)?.project.clientName).toBe(clientName);

      const calendar = await tasksActions.fetchCalendarAction(today(), today(), { projectId: ids.project });
      expect(calendar.find((t) => t.id === ids.visibleTask)?.project.clientName).toBe(clientName);
    });

    it("admin: Mis tareas includes their own admin task", async () => {
      asAdmin();
      const rows = await tasksActions.fetchMyTasksAction();
      expect(rows.map((t) => t.id)).toContain(ids.adminTask);
    });
  });

  // ── ICS feed and Google Calendar sync ─────────────────────────────────────

  describe("calendar feeds", () => {
    async function feedFor(staffId: string): Promise<string> {
      const token = await feedRepository.createCalendarFeedToken(staffId);
      const response = await feedRoute.GET(new NextRequest(`http://localhost/api/calendario/feed/${token}.ics`), {
        params: Promise.resolve({ file: `${token}.ics` }),
      });
      expect(response.status).toBe(200);
      // Unfold long lines (RFC 5545 §3.1) so ids split across lines still match.
      return (await response.text()).replace(/\r\n[ \t]/g, "");
    }

    it("non-admin: the ICS feed has no admin task and no client name", async () => {
      const ics = await feedFor(ids.nonAdmin);
      expect(ics).toContain(visibleTitle);
      expect(ics).not.toContain(adminTitle);
      expect(ics).not.toContain(ids.adminTask);
      expect(ics).not.toContain(clientName);
    });

    it("admin: the ICS feed has their own admin task", async () => {
      const ics = await feedFor(ids.admin);
      expect(ics).toContain(adminTitle);
    });

    it("non-admin: Google Calendar sync pushes no admin task and no client name", async () => {
      calendarApi.inserted.length = 0;
      await syncGoogleCalendar(ids.nonAdmin, "http://localhost");
      const pushed = JSON.stringify(calendarApi.inserted);
      expect(pushed).toContain(visibleTitle);
      expect(pushed).not.toContain(adminTitle);
      expect(pushed).not.toContain(ids.adminTask);
      expect(pushed).not.toContain(clientName);
    });

    it("admin: Google Calendar sync pushes their own admin task", async () => {
      calendarApi.inserted.length = 0;
      await syncGoogleCalendar(ids.admin, "http://localhost");
      expect(JSON.stringify(calendarApi.inserted)).toContain(adminTitle);
    });
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────

  describe("dashboard", () => {
    it("non-admin: the task trend counts neither the admin task's creation nor its completion", async () => {
      asNonAdmin();
      trend.calls.length = 0;
      await dashboardActions.fetchDashboardTaskTrendAction("semana");
      expect(trend.calls).toHaveLength(1);
      const [call] = trend.calls;
      expect(call!.completions.map((c) => c.taskId)).not.toContain(ids.adminTask);
      expect(call!.createdAt.map((d) => d.getTime())).not.toContain(adminCreatedAt.getTime());
    });

    it("non-admin: the dashboard project list carries no client or origin", async () => {
      asNonAdmin();
      const rows = await projectsActions.fetchProjectsAction();
      const project = rows.find((p) => p.id === ids.project);
      expect(project).toBeDefined();
      expect(project!.client).toBeNull();
      expect(project!.clientId).toBeNull();
      expect(project!.origin).toBeNull();
      expect(project!.originStaffId).toBeNull();
    });
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  describe("project readers", () => {
    it("non-admin: project detail has no client, origin or monday boards", async () => {
      asNonAdmin();
      const project = await projectsActions.fetchProjectAction(ids.project);
      expect(project).not.toBeNull();
      expect(project!.client).toBeNull();
      expect(project!.clientId).toBeNull();
      expect(project!.origin).toBeNull();
      expect(project!.originStaffId).toBeNull();
      expect(project!.originStaff).toBeNull();
      expect(project!.mondayImport).toBeNull();
      expect(JSON.stringify(project)).not.toContain(clientName);
    });

    it("non-admin: the client filter is ignored", async () => {
      asNonAdmin();
      const rows = await projectsActions.fetchProjectsAction({ clientId: ids.client });
      expect(rows.map((p) => p.id)).toContain(ids.clientless);
    });

    it("admin: project list and detail carry client, origin and monday boards", async () => {
      asAdmin();
      const rows = await projectsActions.fetchProjectsAction();
      const listed = rows.find((p) => p.id === ids.project);
      expect(listed?.clientId).toBe(ids.client);
      expect(listed?.client?.name).toBe(clientName);
      expect(listed?.origin).toBe(origin);

      const project = await projectsActions.fetchProjectAction(ids.project);
      expect(project?.clientId).toBe(ids.client);
      expect(project?.client?.name).toBe(clientName);
      expect(project?.origin).toBe(origin);
      expect(project?.originStaffId).toBe(ids.admin);
      expect(project?.originStaff?.id).toBe(ids.admin);
      expect(project?.mondayImport?.boards.map((b) => b.id)).toContain(`board-${run}`);
    });

    it("non-admin: project history drops client and origin changes", async () => {
      asNonAdmin();
      const events = await projectsActions.fetchProjectHistoryAction(ids.project);
      const fields = events.map((e) => e.field);
      expect(fields).toContain("name");
      expect(fields).not.toContain("clientId");
      expect(fields).not.toContain("origin");
      expect(fields).not.toContain("originStaffId");
      expect(JSON.stringify(events)).not.toContain(origin);
    });

    it("admin: project history keeps client and origin changes", async () => {
      asAdmin();
      const fields = (await projectsActions.fetchProjectHistoryAction(ids.project)).map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(["clientId", "origin", "originStaffId", "name"]));
    });
  });

  // ── Directorio ────────────────────────────────────────────────────────────

  describe("contact readers", () => {
    it("non-admin: the client sheet lists no projects and keeps counts only", async () => {
      asNonAdmin();
      const contact = await contactsActions.fetchContactAction(ids.client);
      expect(contact).not.toBeNull();
      expect(contact!.projects).toEqual([]);
      expect(contact!.stats?.totalProjects).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(contact)).not.toContain(`Casa visibilidad ${run}`);
    });

    it("admin: the client sheet lists the project", async () => {
      asAdmin();
      const contact = await contactsActions.fetchContactAction(ids.client);
      expect(contact?.projects.map((p) => p.id)).toContain(ids.project);
    });
  });

  // ── monday import data ────────────────────────────────────────────────────

  describe("import data", () => {
    it("non-admin: null for an admin task", async () => {
      asNonAdmin();
      await expect(importActions.getImportDataAction("task", ids.adminTask)).resolves.toBeNull();
    });

    it("non-admin: a project's client columns are removed", async () => {
      asNonAdmin();
      const data = await importActions.getImportDataAction("project", ids.project);
      expect(data).not.toBeNull();
      const text = JSON.stringify(data);
      expect(text).toContain(`Medidas listas ${run}`);
      expect(text).not.toContain(clientName);
      expect(text).not.toContain(clientEmail);
      expect(text).not.toContain(clientPhone);
    });

    it("admin: the admin task and the project's client columns are returned", async () => {
      asAdmin();
      const task = await importActions.getImportDataAction("task", ids.adminTask);
      expect(JSON.stringify(task)).toContain(`Dato admin ${run}`);
      const project = await importActions.getImportDataAction("project", ids.project);
      expect(JSON.stringify(project)).toContain(clientName);
    });
  });

  // ── Task-scoped reads and writes on the admin task id ─────────────────────

  describe("crafted calls on the admin task", () => {
    it("non-admin: task-scoped reads return null or empty", async () => {
      asNonAdmin();
      await expect(tasksActions.fetchTaskAction(ids.adminTask)).resolves.toBeNull();
      await expect(tasksActions.fetchTaskAction(ids.adminChild)).resolves.toBeNull();
      await expect(tasksActions.fetchTaskHistoryAction(ids.adminTask)).resolves.toEqual([]);
      await expect(tasksActions.listSubtasksAction(ids.adminTask)).resolves.toEqual([]);
      await expect(tasksActions.listTaskDependenciesAction(ids.adminTask)).resolves.toEqual({
        dependsOn: [],
        blocks: [],
      });
    });

    it("non-admin: a visible task's dependencies hide the admin task", async () => {
      asNonAdmin();
      const deps = await tasksActions.listTaskDependenciesAction(ids.visibleTask);
      expect(deps.dependsOn.map((t) => t.id)).not.toContain(ids.adminTask);
      expect(JSON.stringify(deps)).not.toContain(adminTitle);
    });

    it("non-admin: a visible task's detail carries no client name", async () => {
      asNonAdmin();
      const task = await tasksActions.fetchTaskAction(ids.visibleTask);
      expect(task).not.toBeNull();
      expect(task!.project.clientName).toBeNull();
    });

    it("non-admin: the attachment file is not served", async () => {
      asNonAdmin();
      const response = await attachmentRoute.GET(
        new Request(`http://localhost/api/tareas/${ids.adminTask}/adjuntos/${ids.attachment}`),
        { params: Promise.resolve({ taskId: ids.adminTask, attachmentId: ids.attachment }) },
      );
      expect(response.status).not.toBe(200);
      expect(await response.text()).not.toContain(`adjunto ${run}`);
    });

    it("non-admin: every write returns FORBIDDEN and changes nothing", async () => {
      asNonAdmin();
      const before = await adminTaskRow();
      const file = new FormData();
      file.set("file", new File([`nota ${run}`], "nota.txt", { type: "text/plain" }));

      const writes: Array<[string, () => Promise<unknown>]> = [
        ["updateTaskAction", () => tasksActions.updateTaskAction(ids.adminTask, { title: "Cambiado" })],
        ["setTaskStatusAction", () => tasksActions.setTaskStatusAction(ids.adminTask, "completado")],
        ["assignTaskAction", () => tasksActions.assignTaskAction(ids.adminTask, ids.nonAdmin)],
        ["archiveTaskAction", () => tasksActions.archiveTaskAction(ids.adminTask, true)],
        ["deleteTaskAction", () => tasksActions.deleteTaskAction(ids.adminTask)],
        ["setTaskSupportAction", () => tasksActions.setTaskSupportAction(ids.adminTask, [ids.nonAdmin])],
        ["mergeTasksAction", () => tasksActions.mergeTasksAction(ids.adminTask, [ids.adminChild])],
        ["createSubtaskAction", () => tasksActions.createSubtaskAction(ids.adminTask, { title: "Hija" })],
        ["addChecklistItemAction", () => tasksActions.addChecklistItemAction(ids.adminTask, "Punto")],
        ["updateChecklistItemAction", () => tasksActions.updateChecklistItemAction(ids.checklistItem, { completed: true })],
        ["removeChecklistItemAction", () => tasksActions.removeChecklistItemAction(ids.checklistItem)],
        ["reorderChecklistAction", () => tasksActions.reorderChecklistAction(ids.adminTask, [ids.checklistItem])],
        ["addTaskCommentAction", () => tasksActions.addTaskCommentAction(ids.adminTask, "Hola")],
        ["addTaskAttachmentAction", () => tasksActions.addTaskAttachmentAction(ids.adminTask, file)],
        [
          "addTaskLinkAction",
          () => tasksActions.addTaskLinkAction(ids.adminTask, { kind: "interno", title: "Liga", url: "https://example.com" }),
        ],
        ["removeTaskLinkAction", () => tasksActions.removeTaskLinkAction(ids.link)],
        ["addTaskDependencyAction", () => tasksActions.addTaskDependencyAction(ids.adminTask, ids.visibleTask)],
        ["removeTaskDependencyAction", () => tasksActions.removeTaskDependencyAction(ids.visibleTask, ids.adminTask)],
      ];
      if (ids.customStatus) {
        writes.push([
          "setTaskCustomStatusAction",
          () => tasksActions.setTaskCustomStatusAction(ids.adminTask, ids.customStatus!),
        ]);
      }

      for (const [name, write] of writes) {
        await expect(write(), name).rejects.toThrow(/FORBIDDEN/);
      }

      const after = await adminTaskRow();
      expect(after.title).toBe(before.title);
      expect(after.status).toBe(before.status);
      expect(after.archived).toBe(false);
      expect(after.deletedAt).toBeNull();
      expect(after.managerId).toBe(ids.admin);
      const items = await db
        .select({ id: schema.taskChecklistItems.id, completed: schema.taskChecklistItems.completed })
        .from(schema.taskChecklistItems)
        .where(eq(schema.taskChecklistItems.taskId, ids.adminTask));
      expect(items).toEqual([{ id: ids.checklistItem, completed: false }]);
      const links = await db
        .select({ id: schema.taskLinks.id })
        .from(schema.taskLinks)
        .where(eq(schema.taskLinks.taskId, ids.adminTask));
      expect(links).toEqual([{ id: ids.link }]);
      const deps = await db
        .select({ dependsOn: schema.taskDependencies.dependsOnTaskId })
        .from(schema.taskDependencies)
        .where(eq(schema.taskDependencies.taskId, ids.visibleTask));
      expect(deps).toEqual([{ dependsOn: ids.adminTask }]);
    });

    it("admin: task-scoped reads return the admin task and its parts", async () => {
      asAdmin();
      const task = await tasksActions.fetchTaskAction(ids.adminTask);
      expect(task?.id).toBe(ids.adminTask);
      expect(task?.project.clientName).toBe(clientName);
      expect(task?.checklistItems.map((i) => i.id)).toContain(ids.checklistItem);
      expect(task?.links.map((l) => l.id)).toContain(ids.link);
      expect(task?.attachments.map((a) => a.id)).toContain(ids.attachment);

      const history = await tasksActions.fetchTaskHistoryAction(ids.adminTask);
      expect(history.map((e) => e.comment)).toContain(adminComment);
      const subtasks = await tasksActions.listSubtasksAction(ids.adminTask);
      expect(subtasks.map((t) => t.id)).toContain(ids.adminChild);
      const deps = await tasksActions.listTaskDependenciesAction(ids.visibleTask);
      expect(deps.dependsOn.map((t) => t.id)).toContain(ids.adminTask);

      const response = await attachmentRoute.GET(
        new Request(`http://localhost/api/tareas/${ids.adminTask}/adjuntos/${ids.attachment}`),
        { params: Promise.resolve({ taskId: ids.adminTask, attachmentId: ids.attachment }) },
      );
      expect(response.status).toBe(200);
    });

    it("admin: a write on the admin task goes through", async () => {
      asAdmin();
      const comment = await tasksActions.addTaskCommentAction(ids.adminTask, `Seguimiento ${run}`);
      expect(comment.comment).toBe(`Seguimiento ${run}`);
    });
  });

  // ── Portal ────────────────────────────────────────────────────────────────

  describe("portal", () => {
    it("refuses to invite on a project without a client (no_client)", async () => {
      asAdmin();
      const result = await portalActions.invitePortalClientAction({
        projectId: ids.clientless,
        contactId: ids.client,
        email: `portal-${run}@example.com`,
        name: "Ana Cliente",
      });
      expect(result).toEqual({ ok: false, error: "no_client" });
      const users = await db
        .select({ id: schema.portalUsers.id })
        .from(schema.portalUsers)
        .where(eq(schema.portalUsers.email, `portal-${run}@example.com`));
      expect(users).toEqual([]);
    });
  });
});
