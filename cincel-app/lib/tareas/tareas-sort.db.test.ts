// @vitest-environment node
/**
 * Task table header sort (#1044) against a real Postgres: every column,
 * both directions, read through the page action (`getTareasListPage`) in
 * pages of 10 with the cursor, inside one Analítico etapa group. Each task
 * comes back once, in the column's order, empty values last both ways.
 * Runs only when TEST_DATABASE_URL points at a migrated database. Every row
 * it creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Tareas header sort: every column, both ways, across pages (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { getTareasListPage } = await import("@/lib/actions/page-data/tareas-actions");
  const { tareasListFiltersOf } = await import("@/lib/query/options/tareas");
  const { DEFAULT_TAREAS_QUERY } = await import("@/lib/tareas/query");
  const { tareasGroupFilters } = await import("@/lib/tareas/summary");
  const { TASK_SORT_COLUMNS } = await import("@/lib/tareas/sort");
  type TaskListRow = import("@/lib/types/core").TaskListRow;

  const base = tareasListFiltersOf(DEFAULT_TAREAS_QUERY);
  const etapaKey = `orden-${run}`;
  let adminId = "";
  const staffIds: string[] = [];
  let projectId = "";
  let workflowId = "";
  const N = 13;

  const admin = () => ({ id: adminId, access: "Administrador" as const });

  /** Every row of the etapa group in one sort, page by page (10 per page). */
  async function readAll(orderBy: (typeof TASK_SORT_COLUMNS)[number], orderDir: "asc" | "desc"): Promise<TaskListRow[]> {
    const filters = tareasGroupFilters(base, projectId, etapaKey, { orderBy, orderDir });
    const rows: TaskListRow[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await asViewer(admin(), () =>
        getTareasListPage({ filters, cursor, limit: 10, orderBy, orderDir }),
      );
      expect(page.total).toBe(N);
      rows.push(...page.rows);
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 5);
    return rows;
  }

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Admin orden ${run}`, email: `admin-orden-${run}@cincel.example`, role: "Administrador" },
        { name: `Beatriz ${run}`, email: `bea-orden-${run}@cincel.example`, role: "Colaborador" },
        { name: `Andrés ${run}`, email: `andres-orden-${run}@cincel.example`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    adminId = people[0]!.id;
    staffIds.push(...people.map((p) => p.id));
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Orden ${run}`, status: "activo", managerId: adminId })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    const [flow] = await db.insert(schema.workflows).values({ key: etapaKey, name: `Orden ${run}` }).returning({ id: schema.workflows.id });
    workflowId = flow!.id;
    const statuses = ["pendiente", "en_proceso", "completado", "bloqueado"] as const;
    const priorities = ["alta", "media", "baja"] as const;
    await db.insert(schema.tasks).values(
      Array.from({ length: N }, (_, i) => ({
        projectId,
        kind: "usuario" as const,
        title: `${String.fromCharCode(77 - i)} tarea ${run}`,
        createdById: adminId,
        workflowId,
        // Every third task has no responsable, every fourth no due date; some share a date.
        managerId: i % 3 === 0 ? null : staffIds[1 + (i % 2)]!,
        commitmentDate: i % 4 === 0 ? null : `2026-0${1 + (i % 5)}-1${i % 3}`,
        status: statuses[i % 4]!,
        priority: priorities[i % 3]!,
      })),
    );
  });

  afterAll(async () => {
    const all = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    const ids = all.map((r) => r.id);
    if (ids.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  for (const column of TASK_SORT_COLUMNS) {
    for (const dir of ["asc", "desc"] as const) {
      it(`${column} ${dir}: every task once across pages`, async () => {
        const rows = await readAll(column, dir);
        expect(rows).toHaveLength(N);
        expect(new Set(rows.map((r) => r.id)).size).toBe(N);
      });
    }
  }

  const due = (r: TaskListRow) => r.commitmentDate ?? r.deliveryDate ?? null;

  it("vence: by due date both ways, no due date last", async () => {
    for (const dir of ["asc", "desc"] as const) {
      const dates = (await readAll("vence", dir)).map(due);
      const set = dates.filter((d): d is string => d !== null);
      const firstNull = dates.indexOf(null);
      expect(firstNull).toBe(set.length);
      expect(dates.slice(firstNull).every((d) => d === null)).toBe(true);
      const sorted = [...set].sort();
      expect(set).toEqual(dir === "asc" ? sorted : sorted.reverse());
    }
  });

  it("responsable: by name both ways, no responsable last", async () => {
    for (const dir of ["asc", "desc"] as const) {
      const names = (await readAll("responsable", dir)).map((r) => r.manager?.name ?? null);
      const set = names.filter((n): n is string => n !== null);
      expect(names.slice(set.length).every((n) => n === null)).toBe(true);
      expect(set[0]).toBe(dir === "asc" ? `Andrés ${run}` : `Beatriz ${run}`);
    }
  });

  it("titulo and prioridad follow the column", async () => {
    const titles = (await readAll("titulo", "asc")).map((r) => r.title.toLowerCase());
    expect(titles).toEqual([...titles].sort());
    const rank = { alta: 0, media: 1, baja: 2 } as const;
    const ranks = (await readAll("prioridad", "desc")).map((r) => rank[r.priority]);
    expect(ranks).toEqual([...ranks].sort().reverse());
  });
});
