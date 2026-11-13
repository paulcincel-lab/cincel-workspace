// @vitest-environment node
/**
 * Tareas Esencial cards (`qk.tareas.byProject`, #987) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and is
 * deleted afterwards.
 *
 * - One group per project with its open, overdue and closed counts (a custom
 *   status that closes counts as closed) and its open rows.
 * - Projects most overdue first, then the nearest due date, then by name.
 * - `mostrar=en_retraso` keeps only the overdue rows and projects.
 * - Past 200 open rows the rows stop and `truncated` is true; the counts stay whole.
 * - `ViewerScope`: admin tasks only in an administrator's own list; "yo" is
 *   the viewer, a null responsable everyone.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Tareas by project (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { getTareasByProject } = await import("@/lib/actions/page-data/tareas-actions");
  const { todayInAppTimeZone } = await import("@/lib/project-flow/admin-tasks");
  type TareasListFilters = import("@/lib/query/keys").TareasListFilters;

  const ids = { projects: [] as string[], staff: [] as string[], taskStatuses: [] as string[] };
  let meId = "";
  let otherId = "";
  const project: Record<"a" | "b" | "c" | "d" | "masivo", string> = { a: "", b: "", c: "", d: "", masivo: "" };

  const marker = `ESN${run}`;
  const massMarker = `MAS${run}`;
  const colaborador = () => ({ id: meId, access: "Colaborador" as const });
  const admin = () => ({ id: meId, access: "Administrador" as const });
  const filters = (extra: Partial<TareasListFilters> = {}): TareasListFilters => ({
    etapa: null,
    proyecto: null,
    responsable: "yo",
    estado: null,
    q: marker,
    ...extra,
  });

  function shift(days: number): string {
    const d = new Date(`${todayInAppTimeZone()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    const [me, other] = await db
      .insert(schema.staff)
      .values([
        { name: `Esencial ${run}`, email: `esencial-${run}@cincel.example` },
        { name: `Otra ${run}`, email: `otra-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    meId = me.id;
    otherId = other.id;
    ids.staff.push(me.id, other.id);

    const [closing] = await db
      .insert(schema.taskStatuses)
      .values({ name: `Cancelada ${run}`, closes: true })
      .returning({ id: schema.taskStatuses.id });
    ids.taskStatuses.push(closing.id);

    const rows = await db
      .insert(schema.projects)
      .values([
        { name: `Alfa ${run}`, status: "activo" as const },
        { name: `Beta ${run}`, status: "activo" as const },
        { name: `Gama ${run}`, status: "activo" as const },
        { name: `Delta ${run}`, status: "activo" as const },
        { name: `Masivo ${run}`, status: "activo" as const },
      ])
      .returning({ id: schema.projects.id });
    [project.a, project.b, project.c, project.d, project.masivo] = rows.map((r) => r.id);
    ids.projects.push(...rows.map((r) => r.id));

    const task = (projectId: string, title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${marker} ${title}`,
      createdById: meId,
      managerId: meId,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      // Alfa: 3 open (2 overdue: one by commitment, one by delivery), 2 closed.
      task(project.a, "A vencida 1", { commitmentDate: shift(-5) }),
      task(project.a, "A vencida entrega", { deliveryDate: shift(-1) }),
      task(project.a, "A futura", { commitmentDate: shift(3), status: "en_proceso" }),
      task(project.a, "A completada", { status: "completado", commitmentDate: shift(-9) }),
      task(project.a, "A cancelada", { status: "en_proceso", customStatusId: closing.id, commitmentDate: shift(-9) }),
      task(project.a, "A admin", { kind: "admin", commitmentDate: shift(-2) }),
      // Beta: 2 open, 1 overdue.
      task(project.b, "B vencida", { commitmentDate: shift(-3) }),
      task(project.b, "B mañana", { commitmentDate: shift(1) }),
      // Gama: 1 open, due soon; plus someone else's task.
      task(project.c, "C pronto", { commitmentDate: shift(2) }),
      task(project.c, "C de otra", { managerId: otherId, commitmentDate: shift(-4) }),
      // Delta: 1 open, due later.
      task(project.d, "D luego", { commitmentDate: shift(10) }),
    ]);

    const mass = Array.from({ length: 205 }, (_, i) => ({
      projectId: project.masivo,
      kind: "usuario" as const,
      title: `${massMarker} tarea ${i + 1}`,
      createdById: meId,
      managerId: meId,
      commitmentDate: shift(20),
    }));
    await db.insert(schema.tasks).values(mass);
  });

  afterAll(async () => {
    // Tasks go with their project (cascade).
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.taskStatuses.length) {
      await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, ids.taskStatuses));
    }
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("groups open rows by project with open, overdue and completed counts", async () => {
    const data = await asViewer(colaborador(), () => getTareasByProject({ filters: filters() }));
    const alfa = data.groups.find((g) => g.project.id === project.a)!;
    expect(alfa).toMatchObject({ open: 3, overdue: 2, completed: 2 });
    expect(alfa.rows.map((r) => r.title.replace(`${marker} `, "")).sort()).toEqual(
      ["A futura", "A vencida 1", "A vencida entrega"].sort(),
    );
    for (const row of alfa.rows) {
      expect(row).not.toHaveProperty("notes");
      expect(row.status).not.toBe("completado");
    }
    // `sortListaTasks`: estatus groups first (Pendiente before En proceso), most days late first.
    expect(alfa.rows.map((r) => r.title.replace(`${marker} `, ""))).toEqual([
      "A vencida 1",
      "A vencida entrega",
      "A futura",
    ]);
    expect(data.groups.find((g) => g.project.id === project.b)).toMatchObject({ open: 2, overdue: 1, completed: 0 });
    expect(data.truncated).toBe(false);
  });

  it("orders projects by overdue then nearest due", async () => {
    const data = await asViewer(colaborador(), () => getTareasByProject({ filters: filters() }));
    expect(data.groups.map((g) => g.project.id)).toEqual([project.a, project.b, project.c, project.d]);
  });

  it("mostrar en_retraso keeps only overdue rows", async () => {
    const data = await asViewer(colaborador(), () =>
      getTareasByProject({ filters: filters({ mostrar: "en_retraso" }) }),
    );
    expect(data.groups.map((g) => g.project.id)).toEqual([project.a, project.b]);
    const [alfa, beta] = data.groups;
    // The card counts what it shows: the overdue tasks, with no completed disclosure.
    expect(alfa).toMatchObject({ open: 2, overdue: 2, completed: 0 });
    expect(alfa.rows).toHaveLength(2);
    expect(beta.rows.map((r) => r.title)).toEqual([`${marker} B vencida`]);
  });

  it("truncates at 200", async () => {
    const data = await asViewer(colaborador(), () => getTareasByProject({ filters: filters({ q: massMarker }) }));
    expect(data.truncated).toBe(true);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].open).toBe(205);
    expect(data.groups[0].rows).toHaveLength(200);
  });

  it("respects ViewerScope", async () => {
    // A collaborator never gets admin tasks; an administrator's "yo" includes their own.
    const mine = await asViewer(colaborador(), () => getTareasByProject({ filters: filters() }));
    const allRows = mine.groups.flatMap((g) => g.rows);
    expect(allRows.some((r) => r.kind === "admin")).toBe(false);
    const asAdmin = await asViewer(admin(), () => getTareasByProject({ filters: filters() }));
    const adminAlfa = asAdmin.groups.find((g) => g.project.id === project.a)!;
    expect(adminAlfa.rows.some((r) => r.kind === "admin")).toBe(true);
    expect(adminAlfa.open).toBe(4);

    // "yo" is the viewer; a null responsable (Solo mías off) is everyone.
    expect(allRows.some((r) => r.managerId === otherId)).toBe(false);
    const everyone = await asViewer(colaborador(), () => getTareasByProject({ filters: filters({ responsable: null }) }));
    const gama = everyone.groups.find((g) => g.project.id === project.c)!;
    expect(gama).toMatchObject({ open: 2, overdue: 1 });

    // Without a session: FORBIDDEN.
    await expect(asViewer(null, () => getTareasByProject({ filters: filters() }))).rejects.toThrow("FORBIDDEN");
  });
});
