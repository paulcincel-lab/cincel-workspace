// @vitest-environment node
/**
 * Project ficha (5b, #960) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 *
 * - `loadProyectoFicha` runs ≤ 6 statements (`countQueries`).
 * - Its tasks equal today's `fetchTasksAction({ projectId })` +
 *   `fetchAdminTasksAction({ projectId, includeClosed: true })` merge, for an
 *   admin and a non-admin.
 * - Security: no `canViewProjects`, a deleted or unknown project → null; a
 *   non-admin gets no admin-kind task and no admin-only project field; the
 *   catalogs the editor reads are `{id,name,type}` / `{id,name}` only.
 * - The Bitácora is bounded: 50 events per page plus a cursor, and client
 *   and origin changes are left out for non-admins.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns `canViewProjects` off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noProjects: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveProjectsCapabilities: (user: Parameters<typeof actual.resolveProjectsCapabilities>[0]) => {
      const caps = actual.resolveProjectsCapabilities(user);
      return perms.noProjects ? { ...caps, canViewProjects: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("project ficha (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { getProyectoFichaData, getProyectoHistoryPage } = await import("@/lib/actions/page-data/proyectos-actions");
  const { loadProyectoFicha, PROYECTO_HISTORY_PAGE_SIZE } = await import("@/lib/loaders/proyectos");
  const { listTasks, listAdminTasks } = await import("@/lib/repositories/tasks-repository");
  const { viewerScopeOf } = await import("@/lib/auth/viewer-scope");
  const { fetchCatalogContacts, fetchCatalogStaff } = await import("@/lib/actions/page-data/catalog-actions");

  const ids = { projects: [] as string[], staff: [] as string[], contacts: [] as string[] };
  let projectId = "";
  let deletedProject = "";
  let viewerId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  /** Today's ficha task read: the viewer's project tasks plus, for admins, every admin task of the project. */
  async function todayTaskIds(isAdminViewer: boolean): Promise<string[]> {
    const user = await asViewer(isAdminViewer ? admin() : colaborador(), () => requireCapabilityUser());
    const rows = await listTasks({ projectId }, viewerScopeOf(user));
    const adminRows = isAdminViewer ? await listAdminTasks({ projectId, includeClosed: true }) : [];
    const seen = new Set(rows.map((t) => t.id));
    return [...rows, ...adminRows.filter((t) => !seen.has(t.id))].map((t) => t.id).sort();
  }

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Ficha ${run}`, email: `ficha-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const [client] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ficha ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(client.id);

    const [project] = await db
      .insert(schema.projects)
      .values({
        name: `Ficha ${run}`,
        status: "activo",
        managerId: viewerId,
        clientId: client.id,
        origin: "Recomendación",
        originStaffId: viewerId,
      })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    await db.insert(schema.projectSpaces).values([
      { projectId, name: `Depto 201 ${run}`, sortOrder: 0 },
    ]);

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: viewerId,
      managerId: viewerId,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      task("Uno"),
      task("Dos"),
      task("Archivada", { archived: true }),
      task("Borrada", { deletedAt: new Date() }),
      task("Asignar cliente y origen", { kind: "admin" }),
      task("Admin cerrada", { kind: "admin", status: "completado", closedAt: new Date() }),
    ]);

    // 55 comments (more than one Bitácora page) and admin-only changes.
    const base = Date.now() - 60 * 60_000;
    await db.insert(schema.historyEvents).values([
      ...Array.from({ length: 55 }, (_, i) => ({
        entity: "project" as const,
        entityId: projectId,
        kind: "comentario" as const,
        actorId: viewerId,
        comment: `Comentario ${i} ${run}`,
        eventAt: new Date(base + i * 1000),
      })),
      {
        entity: "project" as const,
        entityId: projectId,
        kind: "cambio" as const,
        actorId: viewerId,
        field: "clientId",
        beforeValue: null,
        afterValue: client.id,
        eventAt: new Date(base + 100_000),
      },
      {
        entity: "project" as const,
        entityId: projectId,
        kind: "cambio" as const,
        actorId: viewerId,
        field: "origin",
        beforeValue: null,
        afterValue: "Recomendación",
        eventAt: new Date(base + 100_001),
      },
    ]);

    const [deleted] = await db
      .insert(schema.projects)
      .values({ name: `Ficha ${run} borrado`, status: "activo", deletedAt: new Date() })
      .returning({ id: schema.projects.id });
    deletedProject = deleted.id;
    ids.projects.push(deleted.id);
  });

  afterAll(async () => {
    if (ids.projects.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
  });

  it("runs ≤ 6 statements for an admin and a non-admin", async () => {
    for (const viewer of [admin(), colaborador()]) {
      const user = await asViewer(viewer, () => requireCapabilityUser());
      const { result, count } = await countQueries(() => loadProyectoFicha(user, { id: projectId }));
      expect(result?.project.id).toBe(projectId);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it("an admin's tasks equal today's fetchTasksAction + fetchAdminTasksAction merge", async () => {
    const data = await asViewer(admin(), () => getProyectoFichaData({ id: projectId }));
    expect(data?.tasks.map((t) => t.id).sort()).toEqual(await todayTaskIds(true));
    expect(data?.tasks.some((t) => t.kind === "admin")).toBe(true);
    // The closed admin task too (`includeClosed: true`).
    expect(data?.tasks.some((t) => t.title === `Admin cerrada ${run}`)).toBe(true);
    // Admins see the admin-only project fields.
    expect(data?.project.client?.id).toBe(ids.contacts[0]);
    expect(data?.project.origin).toBe("Recomendación");
  });

  it("a non-admin's tasks equal today's fetchTasksAction, with no admin kind", async () => {
    const data = await asViewer(colaborador(), () => getProyectoFichaData({ id: projectId }));
    expect(data?.tasks.map((t) => t.id).sort()).toEqual(await todayTaskIds(false));
    expect(data?.tasks.some((t) => t.kind === "admin")).toBe(false);
    expect(data?.tasks.length).toBe(2);
  });

  it("strips the admin-only project fields for a non-admin in the loader", async () => {
    const data = await asViewer(colaborador(), () => getProyectoFichaData({ id: projectId }));
    expect(data?.project).toMatchObject({
      clientId: null,
      origin: null,
      originStaffId: null,
      client: null,
      originStaff: null,
      mondayImport: null,
    });
    expect(JSON.stringify(data)).not.toContain(ids.contacts[0]);
  });

  it("returns the espacios and the import data with the ficha", async () => {
    const data = await asViewer(admin(), () => getProyectoFichaData({ id: projectId }));
    expect(data?.spaces.map((s) => s.name)).toEqual([`Depto 201 ${run}`]);
    expect(data?.spaces[0].taskCount).toBe(0);
    expect(data?.importData).toBeNull();
  });

  it("is null without canViewProjects", async () => {
    perms.noProjects = true;
    expect(await asViewer(colaborador(), () => getProyectoFichaData({ id: projectId }))).toBeNull();
  });

  it("is null for a deleted project, even for an admin", async () => {
    expect(await asViewer(admin(), () => getProyectoFichaData({ id: deletedProject }))).toBeNull();
  });

  it("is null for an unknown project", async () => {
    expect(await asViewer(admin(), () => getProyectoFichaData({ id: randomUUID() }))).toBeNull();
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getProyectoFichaData({ id: projectId }))).rejects.toThrow("FORBIDDEN");
  });

  it("serves the editor catalogs as {id,name,type} and {id,name} only", async () => {
    const [contacts, staffRows] = await asViewer(admin(), () =>
      Promise.all([fetchCatalogContacts({}), fetchCatalogStaff({})]),
    );
    expect(contacts.length).toBeGreaterThan(0);
    for (const row of contacts) expect(Object.keys(row).sort()).toEqual(["id", "name", "type"]);
    expect(staffRows.length).toBeGreaterThan(0);
    for (const row of staffRows) expect(Object.keys(row).sort()).toEqual(["id", "name"]);
  });

  it("pages the Bitácora: 50 newest first, then the rest after the cursor", async () => {
    const first = await asViewer(admin(), () => getProyectoHistoryPage({ id: projectId }));
    expect(first.events).toHaveLength(PROYECTO_HISTORY_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const times = first.events.map((e) => e.eventAt);
    expect([...times].sort().reverse()).toEqual(times);

    const second = await asViewer(admin(), () => getProyectoHistoryPage({ id: projectId, cursor: first.nextCursor }));
    expect(second.nextCursor).toBeNull();
    const all = [...first.events, ...second.events];
    // 55 comments + 2 changes, no repeats.
    expect(new Set(all.map((e) => e.id)).size).toBe(57);
  });

  it("leaves client and origin changes out of a non-admin's Bitácora", async () => {
    const first = await asViewer(colaborador(), () => getProyectoHistoryPage({ id: projectId }));
    const second = first.nextCursor
      ? await asViewer(colaborador(), () => getProyectoHistoryPage({ id: projectId, cursor: first.nextCursor }))
      : { events: [], nextCursor: null };
    const all = [...first.events, ...second.events];
    expect(all).toHaveLength(55);
    expect(all.some((e) => e.field === "clientId" || e.field === "origin")).toBe(false);
  });

  it("a Bitácora out of scope is empty", async () => {
    perms.noProjects = true;
    expect(await asViewer(colaborador(), () => getProyectoHistoryPage({ id: projectId }))).toEqual({
      events: [],
      nextCursor: null,
    });
  });
});
