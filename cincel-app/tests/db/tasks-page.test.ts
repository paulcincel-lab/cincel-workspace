// @vitest-environment node
/**
 * Tareas list and board (#955) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Seeds about 2,900 tasks (`fixtures/tasks-volume.ts`) tagged per run and
 * deletes them afterwards.
 *
 * - `listTasksPage`: stable keyset order, no duplicates or gaps across pages.
 * - `listBoardColumns`: every column with its total, 0 when empty (#919);
 *   a column's later pages continue without overlap.
 * - `taskFacets` equals the chip counts and Proyecto options the client
 *   computed from every task.
 * - `loadTareasPage` stays under 200 KB (tablero and lista) and
 *   `getTareasPageData` runs ≤ 6 statements.
 * - Without the Tareas capability every read is FORBIDDEN; a non-admin never
 *   gets admin tasks; staff options are `{id,name}`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns `canViewActivities` off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noTareas: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveActivitiesCapabilities: (user: Parameters<typeof actual.resolveActivitiesCapabilities>[0]) => {
      const caps = actual.resolveActivitiesCapabilities(user);
      return perms.noTareas ? { ...caps, canViewActivities: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Tareas list and board (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { seedTasksVolume, cleanupTasksVolume, VOLUME_TASKS } = await import("./fixtures/tasks-volume");
  const actions = await import("@/lib/actions/page-data/tareas-actions");
  const { loadTareasPage } = await import("@/lib/loaders/tareas");
  const repo = await import("@/lib/repositories/tasks-repository");
  const { statusSelectValue } = await import("@/lib/tasks/status-options");
  const { BASE_STATUSES } = await import("@/lib/tasks/status-options");
  type Volume = Awaited<ReturnType<typeof seedTasksVolume>>;
  type TaskFilters = import("@/lib/types/core").TaskFilters;
  type TaskListRow = import("@/lib/types/core").TaskListRow;
  type TaskListItem = import("@/lib/types/core").TaskListItem;
  type ViewerScope = import("@/lib/types/core").ViewerScope;

  let volume: Volume | null = null;
  const v = () => volume!;

  const ADMIN: ViewerScope = { staffId: "", isAdmin: true };
  const MEMBER: ViewerScope = { staffId: "", isAdmin: false };
  const NO_FILTERS = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };

  const admin = () => ({ id: v().managerId, access: "Administrador" as const });
  const colaborador = () => ({ id: v().helperId, access: "Colaborador" as const });

  /** Only this run's tasks. */
  const mine = (extra: TaskFilters = {}): TaskFilters => ({ search: v().marker, ...extra });

  /** The paged order, in JS: tramo, fase, manual order, date (nulls last), id. */
  function sortKey(r: TaskListRow): [number, number, number, string, string] {
    const MAX = 2147483647;
    return [
      r.workflow?.sortOrder ?? MAX,
      r.phase?.sortOrder ?? MAX,
      r.sortOrder ?? MAX,
      r.commitmentDate ?? "9999-12-31",
      r.id,
    ];
  }
  function compareKeys(a: TaskListRow, b: TaskListRow): number {
    const ka = sortKey(a);
    const kb = sortKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  }

  async function allPages(filters: TaskFilters, viewer: ViewerScope, limit: number, columnKey?: string) {
    const rows: TaskListRow[] = [];
    let cursor: string | null = null;
    let total = -1;
    for (let guard = 0; guard < 500; guard++) {
      const page = await repo.listTasksPage(filters, viewer, { cursor, limit, columnKey });
      if (total === -1) total = page.total;
      expect(page.total).toBe(total);
      rows.push(...page.rows);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    return { rows, total };
  }

  beforeAll(async () => {
    volume = await seedTasksVolume(db, run);
  }, 120_000);

  afterAll(async () => {
    await cleanupTasksVolume(db, volume);
  });

  beforeEach(() => {
    perms.noTareas = false;
  });

  describe("listTasksPage", () => {
    it("pages every matching task once, in a stable keyset order", async () => {
      const expected = await repo.listTaskRows(mine(), ADMIN);
      const { rows, total } = await allPages(mine(), ADMIN, 200);

      expect(total).toBe(expected.length);
      expect(rows).toHaveLength(expected.length);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      expect(new Set(rows.map((r) => r.id))).toEqual(new Set(expected.map((r) => r.id)));
      for (let i = 1; i < rows.length; i++) expect(compareKeys(rows[i - 1], rows[i])).toBeLessThan(0);
      // The live, not archived tasks of this run; admin ones only when asked for (the default kinds).
      expect(expected.length).toBeGreaterThan(VOLUME_TASKS * 0.9);
    });

    it("gives the same order whatever the page size", async () => {
      const small = await allPages(mine({ workflowId: v().workflows[0].id }), ADMIN, 37);
      const large = await allPages(mine({ workflowId: v().workflows[0].id }), ADMIN, 200);
      expect(small.rows.map((r) => r.id)).toEqual(large.rows.map((r) => r.id));
    });

    it("leaves out notes and admin tasks for a non-admin", async () => {
      const { rows } = await allPages(mine(), MEMBER, 200);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.kind !== "admin")).toBe(true);
      expect(rows.every((r) => !("notes" in r))).toBe(true);
      expect(rows.every((r) => r.project.clientName === null)).toBe(true);
    });

    it("rejects a forged cursor", async () => {
      await expect(repo.listTasksPage(mine(), ADMIN, { cursor: "bm9wZQ", limit: 10 })).rejects.toThrow("INVALID");
    });
  });

  describe("listBoardColumns", () => {
    it("returns every column with its total and the first rows; later pages continue it", async () => {
      const filters = mine();
      const all = await repo.listTaskRows(filters, ADMIN);
      const board = await repo.listBoardColumns(filters, ADMIN, 20, [
        ...BASE_STATUSES,
        `custom:${v().customStatusId}`,
      ]);

      for (const status of BASE_STATUSES) expect(board[status]).toBeDefined();
      for (const [key, column] of Object.entries(board)) {
        const inColumn = all.filter((r) => statusSelectValue(r) === key).sort(compareKeys);
        expect(column.total).toBe(inColumn.length);
        expect(column.rows.map((r) => r.id)).toEqual(inColumn.slice(0, 20).map((r) => r.id));
        expect(column.nextCursor === null).toBe(inColumn.length <= 20);

        if (column.nextCursor) {
          const rest: TaskListRow[] = [];
          let cursor: string | null = column.nextCursor;
          while (cursor) {
            const page = await repo.listTasksPage({ ...filters, archived: false }, ADMIN, { cursor, limit: 50, columnKey: key });
            expect(page.total).toBe(inColumn.length);
            rest.push(...page.rows);
            cursor = page.nextCursor;
          }
          expect([...column.rows, ...rest].map((r) => r.id)).toEqual(inColumn.map((r) => r.id));
        }
      }
      expect(board[`custom:${v().customStatusId}`].total).toBeGreaterThan(0);
    });

    it("keeps every column with total 0 when nothing matches (#919)", async () => {
      const board = await repo.listBoardColumns({ search: `nada-${run}-nada` }, ADMIN, 20, [
        ...BASE_STATUSES,
        `custom:${v().customStatusId}`,
      ]);
      expect(Object.keys(board).sort()).toEqual([...BASE_STATUSES, `custom:${v().customStatusId}`].sort());
      for (const column of Object.values(board)) expect(column).toEqual({ rows: [], total: 0, nextCursor: null });
    });
  });

  describe("taskFacets", () => {
    /** The chip counts and Proyecto options `TareasClient` computed from every task (before 4a). */
    function clientFacets(tasks: TaskListItem[], tramo: string | null, proyecto: string | null) {
      const inTramo = (t: TaskListItem) => tramo === null || t.workflow?.key === tramo;
      const inProject = (t: TaskListItem) => proyecto === null || t.project.id === proyecto;
      const inScope = tasks.filter(inProject);
      const byTramo: Record<string, number> = {};
      for (const t of inScope) if (t.workflow) byTramo[t.workflow.key] = (byTramo[t.workflow.key] ?? 0) + 1;
      const projects = new Map<string, string>();
      for (const t of tasks) if (inTramo(t)) projects.set(t.project.id, t.project.name);
      if (proyecto && !projects.has(proyecto)) {
        const name = tasks.find((t) => t.project.id === proyecto)?.project.name;
        if (name) projects.set(proyecto, name);
      }
      return {
        total: inScope.length,
        byTramo,
        projectIds: [...projects.entries()].sort((a, b) => a[1].localeCompare(b[1], "es")).map(([id]) => id),
      };
    }

    it.each([
      ["no tramo, no project", null, null],
      ["a tramo", 0, null],
      ["a project", null, 0],
      ["a tramo and a project", 1, 3],
    ] as const)("matches the client counts with %s", async (_label, tramoIndex, projectIndex) => {
      const tramo = tramoIndex === null ? null : v().workflows[tramoIndex].key;
      const proyecto = projectIndex === null ? null : v().projects[projectIndex].id;
      const base = mine({ status: "pendiente" });
      const tasks = await repo.listTasks(base, MEMBER);
      const expected = clientFacets(tasks, tramo, proyecto);

      const facets = await repo.taskFacets(base, MEMBER, { workflowKey: tramo, projectId: proyecto });
      expect(facets.total).toBe(expected.total);
      expect(facets.byTramo).toEqual(expected.byTramo);
      expect(facets.projects.map((p) => p.id)).toEqual(expected.projectIds);
    });

    it("ignores the tramo and proyecto of the filters themselves", async () => {
      const facets = await repo.taskFacets(
        mine({ workflowId: v().workflows[0].id, projectId: v().projects[0].id }),
        ADMIN,
      );
      const all = await repo.taskFacets(mine(), ADMIN);
      expect(facets).toEqual(all);
    });
  });

  describe("loadTareasPage / getTareasPageData", () => {
    it.each(["tablero", "lista"] as const)("stays under 200 KB for %s with the default filters", async (vista) => {
      const user = await asViewer(admin(), () => requireCapabilityUser());
      const data = await loadTareasPage(user, { vista, ...NO_FILTERS });
      expect(JSON.stringify(data).length).toBeLessThan(200_000);
      if (vista === "tablero") {
        expect(data.board).toBeDefined();
        for (const status of BASE_STATUSES) expect(data.board!.columns[status]).toBeDefined();
        expect(data.list).toBeUndefined();
      } else {
        expect(data.list?.rows.length).toBeGreaterThan(0);
        expect(data.board).toBeUndefined();
      }
    });

    it.each([
      ["tablero", NO_FILTERS],
      ["lista", NO_FILTERS],
      ["tablero", { ...NO_FILTERS, responsable: "yo" as const, estado: "pendiente" as const }],
    ] as const)("runs ≤ 6 statements (%s)", async (vista, filters) => {
      const tramo = v().workflows[0].key;
      const { count } = await countQueries(() =>
        asViewer(admin(), () => actions.getTareasPageData({ vista, ...filters, tramo })),
      );
      expect(count).toBeLessThanOrEqual(6);
    });

    it("hands out staff as {id,name} only", async () => {
      const data = await asViewer(admin(), () => actions.getTareasPageData({ vista: "lista", ...NO_FILTERS }));
      expect(data.staff.length).toBeGreaterThan(0);
      for (const s of data.staff) expect(Object.keys(s).sort()).toEqual(["id", "name"]);
      expect(data.staff.find((s) => s.id === v().managerId)?.name).toBe(`Volumen ${run} Gestor`);
    });

    it("counts the facets of the page like taskFacets", async () => {
      const data = await asViewer(colaborador(), () =>
        actions.getTareasPageData({ vista: "tablero", ...NO_FILTERS, q: v().marker }),
      );
      const facets = await repo.taskFacets(mine(), { staffId: v().helperId, isAdmin: false });
      expect(data.facets).toEqual(facets);
    });

    it("never gives a non-admin an admin task; an admin's own ones come with Responsable: Yo", async () => {
      const q = v().marker;
      const member = await asViewer(colaborador(), () =>
        actions.getTareasPageData({ vista: "tablero", ...NO_FILTERS, q }),
      );
      const memberRows = Object.values(member.board!.columns).flatMap((c) => c.rows);
      expect(memberRows.every((r) => r.kind !== "admin")).toBe(true);
      const list = await asViewer(colaborador(), () =>
        actions.getTareasListPage({ filters: { ...NO_FILTERS, q }, cursor: null, limit: 200 }),
      );
      expect(list.rows.every((r) => r.kind !== "admin")).toBe(true);

      const mineAsAdmin = await asViewer(admin(), () =>
        actions.getTareasListPage({ filters: { ...NO_FILTERS, q, responsable: "yo" }, cursor: null, limit: 200 }),
      );
      const all = [...mineAsAdmin.rows];
      let cursor = mineAsAdmin.nextCursor;
      while (cursor) {
        const page = await asViewer(admin(), () =>
          actions.getTareasListPage({ filters: { ...NO_FILTERS, q, responsable: "yo" }, cursor, limit: 200 }),
        );
        all.push(...page.rows);
        cursor = page.nextCursor;
      }
      expect(all.some((r) => r.kind === "admin")).toBe(true);
    });

    it("an unknown tramo loads no rows but keeps the board's columns", async () => {
      const data = await asViewer(admin(), () =>
        actions.getTareasPageData({ vista: "tablero", ...NO_FILTERS, tramo: `no-${run}` }),
      );
      for (const status of BASE_STATUSES) expect(data.board!.columns[status].total).toBe(0);
      const column = await asViewer(admin(), () =>
        actions.getTareasBoardColumn({ filters: { ...NO_FILTERS, tramo: `no-${run}` }, columnId: "pendiente", cursor: null }),
      );
      expect(column).toEqual({ rows: [], total: 0, nextCursor: null });
    });
  });

  describe("FORBIDDEN", () => {
    it("without the Tareas capability every read is FORBIDDEN", async () => {
      perms.noTareas = true;
      const viewer = colaborador();
      await expect(asViewer(viewer, () => actions.getTareasPageData({ vista: "tablero", ...NO_FILTERS }))).rejects.toThrow(
        "FORBIDDEN",
      );
      await expect(
        asViewer(viewer, () => actions.getTareasListPage({ filters: NO_FILTERS, cursor: null })),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        asViewer(viewer, () => actions.getTareasBoardColumn({ filters: NO_FILTERS, columnId: "pendiente", cursor: null })),
      ).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(viewer, () => actions.getTareasBoard({ filters: NO_FILTERS }))).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(viewer, () => actions.getTareasFacets({ filters: NO_FILTERS }))).rejects.toThrow("FORBIDDEN");
    });

    it("a guest gets FORBIDDEN", async () => {
      await expect(asViewer(null, () => actions.getTareasPageData({ vista: "lista", ...NO_FILTERS }))).rejects.toThrow(
        "FORBIDDEN",
      );
    });

    it("a malformed input is INVALID", async () => {
      await expect(
        asViewer(admin(), () =>
          actions.getTareasBoardColumn({ filters: NO_FILTERS, columnId: "custom:no-es-uuid", cursor: null }),
        ),
      ).rejects.toThrow("INVALID");
    });
  });
});
