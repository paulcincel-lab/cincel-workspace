// @vitest-environment node
/**
 * The Resumen task numbers (`loadProyectoResumenSummary`, #1051) against a
 * real Postgres. Runs only when TEST_DATABASE_URL points at a migrated
 * database. Every row it creates carries a per-run marker and is deleted
 * afterwards.
 *
 * On a seeded project (three tramos with fases, a fase off the catalog,
 * subtasks, a custom status that closes, admin tasks, overdue and closed
 * tasks), every number the three Resumen layouts show, computed from the
 * SQL aggregates, equals the number the layouts derived before from the
 * project's full task list (`listTaskRows`, the old `qk.proyectos.tab(id,
 * "tareas")` read).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** No Drive folder in the test DB. */
vi.mock("@/lib/google/staff-files-app", () => ({
  getStaffFilesProject: vi.fn(async () => null),
  listStaffProjectFiles: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Proyecto · Resumen task numbers (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { viewerScopeOf } = await import("@/lib/auth/viewer-scope");
  const { loadProjectResumen } = await import("@/lib/proyectos/project-resumen");
  const { loadProyectoResumenSummary } = await import("@/lib/loaders/proyectos");
  const { listTaskRows } = await import("@/lib/repositories/tasks-repository");
  const old = await import("@/lib/proyectos/project-summary");
  const next = await import("@/lib/proyectos/resumen-summary");
  const { dominantTramo } = await import("@/lib/people/aggregates");
  const { isTaskClosed } = await import("@/lib/tasks/status-options");
  const { resumenSummaryOfRows } = await import("@/tests/unit/fixtures/resumen-summary");

  const ids = { projects: [] as string[], staff: [] as string[], workflows: [] as string[], statuses: [] as string[] };
  let viewerId = "";
  let managerId = "";
  let otherId = "";
  let projectId = "";

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Visor ${run}`, email: `visor-rs-${run}@cincel.example`, capacity: 10 },
        { name: `Responsable ${run}`, email: `resp-rs-${run}@cincel.example`, capacity: 5, role: "Residente" },
        { name: `Otra ${run}`, email: `otra-rs-${run}@cincel.example`, capacity: 4 },
      ])
      .returning({ id: schema.staff.id });
    [viewerId, managerId, otherId] = people.map((p) => p.id);
    ids.staff.push(...people.map((p) => p.id));

    const flows = await db
      .insert(schema.workflows)
      .values([
        { key: `rs-a-${run}`, name: `Diseño ${run}`, sortOrder: 9001 },
        { key: `rs-b-${run}`, name: `Obra ${run}`, sortOrder: 9002 },
        { key: `rs-c-${run}`, name: `Decoración ${run}`, sortOrder: 9003 },
      ])
      .returning({ id: schema.workflows.id });
    const [wa, wb, wc] = flows.map((f) => f.id) as [string, string, string];
    ids.workflows.push(wa, wb, wc);
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId: wa, name: `Anteproyecto ${run}`, sortOrder: 1 },
        { workflowId: wb, name: `Preliminares ${run}`, sortOrder: 1 },
        { workflowId: wb, name: `Obra negra ${run}`, sortOrder: 2 },
        // Off the catalog (inactive): it only shows because a task has it.
        { workflowId: wb, name: `Retirada ${run}`, sortOrder: 9, active: false },
      ])
      .returning({ id: schema.workflowPhases.id });
    const [pa1, pb1, pb2, pbOld] = phases.map((p) => p.id) as [string, string, string, string];

    const [status] = await db
      .insert(schema.taskStatuses)
      .values({ name: `Cancelada ${run}`, closes: true })
      .returning({ id: schema.taskStatuses.id });
    ids.statuses.push(status!.id);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Números ${run}`, status: "activo", managerId, coordinatorId: otherId, currentWorkflowId: wb })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    ids.projects.push(projectId);
    await db.insert(schema.projectMembers).values([
      { projectId, staffId: viewerId },
      { projectId, staffId: managerId },
    ]);
    await db.insert(schema.projectStages).values([
      { projectId, workflowId: wa, startedAt: new Date("2026-03-01T12:00:00Z"), closedAt: new Date("2026-05-01T12:00:00Z") },
      { projectId, workflowId: wb, startedAt: new Date("2026-05-02T12:00:00Z") },
    ]);

    const day = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: viewerId,
      managerId,
      ...extra,
    });
    const created = await db
      .insert(schema.tasks)
      .values([
        task("Planos", { workflowId: wa, phaseId: pa1, status: "completado", commitmentDate: day(-60), closedAt: new Date(Date.now() - 50 * 864e5), createdAt: new Date("2026-03-03T03:00:00Z") }),
        task("Cancelería", { workflowId: wa, phaseId: pa1, status: "pendiente", commitmentDate: day(-20), managerId: otherId }),
        task("Trazo", { workflowId: wb, phaseId: pb1, status: "completado", commitmentDate: day(-10), closedAt: new Date(Date.now() - 2 * 864e5) }),
        task("Cimbra", { workflowId: wb, phaseId: pb2, status: "en_proceso", commitmentDate: day(-3) }),
        task("Permiso", { workflowId: wb, phaseId: pb2, status: "bloqueado", managerId: otherId }),
        task("Colado", { workflowId: wb, phaseId: pb2, status: "pendiente", commitmentDate: day(5) }),
        task("Impermeabilizar", { workflowId: wb, phaseId: pb2, status: "pendiente", commitmentDate: day(-7), customStatusId: status!.id }),
        task("Muro viejo", { workflowId: wb, phaseId: pbOld, status: "bloqueado", commitmentDate: day(-1) }),
        task("Limpieza", { workflowId: wb, status: "pendiente" }),
        task("Mobiliario", { workflowId: wc, status: "pendiente", commitmentDate: day(40), managerId: otherId }),
        task("Archivada", { workflowId: wb, phaseId: pb2, status: "pendiente", archived: true }),
        task("Licencia", { kind: "admin", status: "pendiente", commitmentDate: day(-4) }),
        task("Alta SAT", { kind: "admin", status: "completado", managerId: null, closedAt: new Date() }),
      ])
      .returning({ id: schema.tasks.id, title: schema.tasks.title });
    const cimbra = created.find((t) => t.title.startsWith("Cimbra"))!.id;
    await db.insert(schema.tasks).values([
      task("Cimbra · tablero", { workflowId: wb, phaseId: pb2, parentTaskId: cimbra, status: "completado", closedAt: new Date(), managerId: otherId }),
      task("Cimbra · fondo", { workflowId: wb, phaseId: pb2, parentTaskId: cimbra, status: "pendiente", managerId: otherId }),
    ]);
  });

  afterAll(async () => {
    if (ids.projects.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, ids.projects));
      await db.delete(schema.projectStages).where(inArray(schema.projectStages.projectId, ids.projects));
      await db.delete(schema.projectMembers).where(inArray(schema.projectMembers.projectId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.workflows.length) {
      await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, ids.workflows));
      await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    }
    for (const id of ids.statuses) await db.delete(schema.taskStatuses).where(eq(schema.taskStatuses.id, id));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  const byKey = <T extends { workflow: { id: string } | null; phase?: { id: string } | null; staffId?: string }>(rows: T[]) =>
    [...rows].sort((a, b) =>
      `${a.staffId ?? ""}:${a.workflow?.id ?? ""}:${a.phase?.id ?? ""}`.localeCompare(`${b.staffId ?? ""}:${b.workflow?.id ?? ""}:${b.phase?.id ?? ""}`),
    );

  for (const access of ["Administrador", "Colaborador"] as const) {
    it(`${access}: every Resumen number from SQL equals the one derived from the task rows`, async () => {
      const user = await asViewer({ id: viewerId, access }, () => requireCapabilityUser());
      const data = await loadProjectResumen(projectId, user);
      const summary = await loadProyectoResumenSummary(user, { id: projectId });
      expect(data).not.toBeNull();
      expect(summary).not.toBeNull();
      const includeAdmin = access === "Administrador";
      expect(summary!.includeAdmin).toBe(includeAdmin);
      expect(summary!.today).toBe(data!.today);
      const today = data!.today;
      // What the Resumen read before: the project Tareas tab rows.
      const rows = await listTaskRows(
        { projectId, ...(includeAdmin ? { kind: ["workflow", "usuario", "admin"] as const } : {}) } as Parameters<typeof listTaskRows>[0],
        viewerScopeOf(user),
      );

      // The aggregates themselves.
      const fromRows = resumenSummaryOfRows(rows, today, { includeAdmin });
      expect(byKey(summary!.buckets)).toEqual(byKey(fromRows.buckets));
      expect(byKey(summary!.managers)).toEqual(byKey(fromRows.managers));
      expect(summary!.next).toEqual(old.nextTasks(rows, today, next.RESUMEN_NEXT_LIMIT));

      // Visual.
      const input = data!;
      expect(next.resumenTramoProgress(summary!, input.tramoCatalog, input.project)).toEqual(
        old.tramoProgress(rows, input.tramoCatalog, input.project, today),
      );
      expect(next.resumenStatusCounts(summary!)).toEqual(old.statusCounts(rows));
      const open = old.nextTasks(rows, today, Number.POSITIVE_INFINITY);
      expect(next.resumenHeroCounts(summary!)).toEqual({
        open: open.length,
        overdue: open.filter((t) => t.daysLate > 0).length,
        blocked: old.statusCounts(rows).find((c) => c.status === "bloqueado")!.count,
      });
      expect(next.resumenNextCards(summary!, [], 4)).toEqual(old.nextTasks(rows, today, 4));
      expect(next.resumenTeamLoadCards(input, summary!)).toEqual(old.teamLoadCards(input, rows));

      // Esencial.
      expect(old.esencialTramoLine(input, next.resumenTramoProgress(summary!, input.tramoCatalog, input.project))).toEqual(
        old.esencialTramoLine(input, old.tramoProgress(rows, input.tramoCatalog, input.project, today)),
      );
      for (const id of [managerId, otherId, viewerId]) {
        expect(next.resumenAvatarTramo(summary!, id)).toBe(
          dominantTramo(rows.filter((t) => t.manager?.id === id).map((t) => t.workflow?.key ?? null)),
        );
      }

      // Analítico.
      expect(next.resumenKpisOf(input, summary!)).toEqual(old.resumenKpis(input, rows));
      expect(next.resumenPhaseGroups(summary!, input.tramoCatalog, input.phasesByTramo, input.project, today)).toEqual(
        old.tramoPhaseGroups(rows, input.tramoCatalog, input.phasesByTramo, input.project, today),
      );
      expect(next.resumenTeamLoadRows(input, summary!)).toEqual(old.teamLoadRows(input, rows));
      for (const hide of [false, true]) {
        const shown = hide ? rows.filter((t) => !isTaskClosed(t)) : rows;
        const before = old.taskGroupsByTramo(shown, input.tramoCatalog, input.project, today);
        const after = next.resumenTaskGroups(summary!, input.tramoCatalog, input.project, hide);
        expect(after.groups.map(({ id, label, caption, metrics }) => ({ id, label, caption, metrics }))).toEqual(
          before.groups.map(({ id, label, caption, metrics }) => ({ id, label, caption, metrics })),
        );
        expect(after.groups.map((g) => g.count)).toEqual(before.groups.map((g) => g.rows!.length));
        expect(after.totals).toEqual(before.totals);
      }
      // The seed exercises what it should: an admin group only for administrators, overdue and blocked tasks.
      expect(next.resumenTaskGroups(summary!, input.tramoCatalog, input.project, false).groups.some((g) => g.id === "admin")).toBe(includeAdmin);
      expect(next.resumenHeroCounts(summary!).overdue).toBeGreaterThan(2);
    });
  }

  it("each «Tareas por tramo» group's rows page through `qk.tareas.list` and add up to the summary", async () => {
    const { loadTareasListPage } = await import("@/lib/loaders/tareas");
    const user = await asViewer({ id: viewerId, access: "Administrador" }, () => requireCapabilityUser());
    const data = (await loadProjectResumen(projectId, user))!;
    const summary = (await loadProyectoResumenSummary(user, { id: projectId }))!;
    for (const hide of [false, true]) {
      const lists = next.resumenGroupLists(data, summary, hide);
      expect(lists.length).toBeGreaterThan(2);
      for (const list of lists) {
        const page = await loadTareasListPage(user, { filters: list.filters, cursor: null, orderBy: "retraso" });
        expect(page.total).toBe(list.count);
      }
    }
  });
});
