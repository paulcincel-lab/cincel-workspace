// @vitest-environment node
/**
 * Tareas Calendario page data (#957) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 *
 * - `getTareasCalendarData` returns the slim rows (no `notes`) with a date in
 *   the range, and nothing outside it.
 * - A non-admin never receives admin tasks.
 * - A viewer without the Tareas capability, a guest and a session without
 *   system access get FORBIDDEN.
 * - A range over 62 days, a reversed range and a malformed date are INVALID.
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

describe.skipIf(!url)("Tareas calendar page data (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { getTareasCalendarData } = await import("@/lib/actions/page-data/tareas-actions");

  const ids = { projects: [] as string[], staff: [] as string[] };
  let projectId = "";
  let viewerId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  const filters = () => ({ tramo: null, proyecto: projectId, responsable: null, estado: null, q: null });
  const november = () => ({ filters: filters(), from: "2026-10-26", to: "2026-12-06" });
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title.replace(` ${run}`, "")).sort();

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Calendario ${run}`, email: `calendario-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Calendario ${run}`, status: "activo", managerId: viewerId })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      notes: `Notas ${run}`,
      createdById: viewerId,
      managerId: viewerId,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      task("Dentro", { commitmentDate: "2026-11-10" }),
      task("Entrega dentro", { deliveryDate: "2026-12-06" }),
      task("Antes", { commitmentDate: "2026-09-01" }),
      task("Después", { deliveryDate: "2027-02-01" }),
      task("Sin fechas"),
      task("Admin", { kind: "admin", commitmentDate: "2026-11-12" }),
    ]);
  });

  afterAll(async () => {
    // Tasks go with their project (cascade).
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noTareas = false;
  });

  it("returns only the tasks with a date in the range, as slim rows", async () => {
    const rows = await asViewer(colaborador(), () => getTareasCalendarData(november()));
    expect(titles(rows)).toEqual(["Dentro", "Entrega dentro"]);
    for (const row of rows) expect(row).not.toHaveProperty("notes");
  });

  it("never gives a non-admin the admin tasks", async () => {
    const rows = await asViewer(colaborador(), () => getTareasCalendarData(november()));
    expect(rows.some((r) => r.kind === "admin")).toBe(false);
    expect(titles(rows)).not.toContain("Admin");
  });

  it("an administrator gets the same range", async () => {
    const rows = await asViewer(admin(), () => getTareasCalendarData(november()));
    expect(titles(rows)).toEqual(["Dentro", "Entrega dentro"]);
  });

  it("a tramo key no tramo has loads nothing", async () => {
    const rows = await asViewer(admin(), () =>
      getTareasCalendarData({ ...november(), filters: { ...filters(), tramo: `no-${run}` } }),
    );
    expect(rows).toEqual([]);
  });

  it("a viewer without the Tareas capability gets FORBIDDEN", async () => {
    perms.noTareas = true;
    await expect(asViewer(colaborador(), () => getTareasCalendarData(november()))).rejects.toThrow("FORBIDDEN");
  });

  it("a guest and a session without system access get FORBIDDEN", async () => {
    await expect(asViewer(null, () => getTareasCalendarData(november()))).rejects.toThrow("FORBIDDEN");
    await expect(
      asViewer({ ...colaborador(), status: "no_system_access" }, () => getTareasCalendarData(november())),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects a range over 62 days, a reversed range and a malformed date", async () => {
    const call = (from: string, to: string) =>
      asViewer(admin(), () => getTareasCalendarData({ filters: filters(), from, to }));
    // 62 days is the limit.
    await expect(call("2026-10-01", "2026-12-02")).resolves.toBeInstanceOf(Array);
    await expect(call("2026-10-01", "2026-12-03")).rejects.toThrow("INVALID");
    await expect(call("2026-12-06", "2026-10-26")).rejects.toThrow("INVALID");
    await expect(call("2026-11-31", "2026-12-06")).rejects.toThrow("INVALID");
  });
});
