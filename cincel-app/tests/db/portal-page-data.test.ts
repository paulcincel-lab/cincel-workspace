// @vitest-environment node
/**
 * Portal page data (Query Migration Phase 11, #945) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`). Every row it creates carries a
 * per-run marker and is deleted afterwards.
 *
 * - `getPortalProjectData` for a project the portal user can't see → null (unknown, another client's,
 *   revoked, cancelled, deleted).
 * - Visibility is checked once per request: one `findPortalProjectAccess` call, and no later statement joins
 *   `project_portal_access` again.
 * - The project page reads ≤ 7 statements (`countQueries`), session lookup included, and writes nothing:
 *   the page-data action's session lookup does not slide the session (query functions are side-effect free).
 * - The page data carries DTOs only: no tarea, responsable or staff besides the manager.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { countQueries } from "../helpers/count-queries";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

/** The portal cookie the page-data action reads. */
const jar = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cincel_portal_session" && jar.token ? { name, value: jar.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

/** The visibility query, spied on (it still runs against the DB). */
vi.mock("@/lib/portal/session-store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/portal/session-store")>();
  return { ...real, findPortalProjectAccess: vi.fn(real.findPortalProjectAccess) };
});

/** No Drive in this test: the projects' folders are not ready, so nothing may list them. */
vi.mock("@/lib/portal/files", () => ({
  listPortalFolder: vi.fn(async () => {
    throw new Error("Drive called");
  }),
  listPortalFolderGroups: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("portal page data (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const store = await import("@/lib/portal/session-store");
  const { getPortalHomeData, getPortalProjectData } = await import("@/lib/portal/page-data");

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], users: [] as string[] };
  const p = { granted: "", other: "", revoked: "", cancelado: "", deleted: "" };
  let clientUserId = "";

  beforeAll(async () => {
    const [mgr] = await db
      .insert(schema.staff)
      .values({ name: `Gerente ${run}`, lastName: "Portal", email: `gerente-pd-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    ids.staff.push(mgr.id);

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente page data ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(contact.id);

    const mk = async (key: keyof typeof p, extra: Partial<typeof schema.projects.$inferInsert> = {}) => {
      const [row] = await db
        .insert(schema.projects)
        .values({ name: `Portal pd ${run} ${key}`, clientId: contact.id, managerId: mgr.id, progress: 30, ...extra })
        .returning({ id: schema.projects.id });
      p[key] = row.id;
      ids.projects.push(row.id);
    };
    await mk("granted");
    await mk("other");
    await mk("revoked");
    await mk("cancelado", { status: "cancelado" });
    await mk("deleted", { deletedAt: new Date() });

    const users = await db
      .insert(schema.portalUsers)
      .values([
        { email: `cliente-pd-${run}@example.com`, name: "Cliente", contactId: contact.id, invitedByStaffId: mgr.id,
          status: "active" },
        { email: `otro-pd-${run}@example.com`, name: "Otro", contactId: contact.id, invitedByStaffId: mgr.id,
          status: "active" },
      ])
      .returning({ id: schema.portalUsers.id });
    clientUserId = users[0].id;
    ids.users.push(users[0].id, users[1].id);

    const grant = (projectId: string, portalUserId: string, revoked = false) => ({
      projectId, portalUserId, grantedByStaffId: mgr.id,
      ...(revoked ? { revokedAt: new Date(), revokedByStaffId: mgr.id } : {}),
    });
    await db.insert(schema.projectPortalAccess).values([
      grant(p.granted, clientUserId),
      grant(p.revoked, clientUserId, true),
      grant(p.cancelado, clientUserId),
      grant(p.deleted, clientUserId),
      grant(p.other, users[1].id),
    ]);

    const [schedule] = await db
      .insert(schema.projectSchedules)
      .values({ projectId: p.granted })
      .returning({ id: schema.projectSchedules.id });
    await db.insert(schema.scheduleTasks).values([1, 2].map((n) => ({
      scheduleId: schedule.id, stableKey: `${run}-pd-${n}`, planta: "Planta baja", seccion: "Preliminares",
      seccionOrder: 1, responsable: `Responsable ${run}`, inicio: `2026-02-0${n}`, fin: `2026-02-1${n}`,
      tarea: `Tarea ${run} ${n}`, status: n === 1 ? ("done" as const) : ("pending" as const), sortOrder: n,
    })));

    // A fresh session (refreshed now): a sliding write would be an UPDATE, which the count would show.
    const token = store.newPortalToken();
    await store.insertPortalSession({
      tokenHash: store.hashPortalToken(token),
      portalUserId: clientUserId,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
      userAgent: null,
      ip: null,
    });
    jar.token = token;
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.users.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.users));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    vi.mocked(store.findPortalProjectAccess).mockClear();
  });

  it("is null for a project the portal user can't see", async () => {
    for (const id of [p.other, p.revoked, p.cancelado, p.deleted, randomUUID()]) {
      expect(await getPortalProjectData({ id, tab: "resumen" })).toBeNull();
    }
  });

  it("checks visibility once per request; later reads don't re-check it", async () => {
    const { result, statements } = await countQueries(() => getPortalProjectData({ id: p.granted, tab: "resumen" }));

    expect(result?.project.id).toBe(p.granted);
    expect(store.findPortalProjectAccess).toHaveBeenCalledTimes(1);
    const visibilityJoins = statements.filter((s) => /project_portal_access/.test(s.sql));
    expect(visibilityJoins).toHaveLength(1);
  });

  it("reads the project page in ≤ 7 statements, session lookup included, and writes nothing", async () => {
    const { result, count, statements } = await countQueries(() =>
      getPortalProjectData({ id: p.granted, tab: "resumen" }),
    );

    expect(result).not.toBeNull();
    // 6 before Resumen's "Subido por" (the client's own upload events, one read).
    expect(count).toBeLessThanOrEqual(7);
    for (const s of statements) expect(s.sql.trimStart().toLowerCase()).toMatch(/^(select|with)\b/);
  });

  it("returns DTOs only: the schedule per seccion, no tarea, responsable or payments", async () => {
    const data = await getPortalProjectData({ id: p.granted, tab: "resumen" });

    expect(data?.schedule?.sections.map((s) => [s.seccion, s.progressPct])).toEqual([["Preliminares", 50]]);
    expect(data?.documents).toBeNull();
    const json = JSON.stringify(data);
    expect(json).not.toContain(`Tarea ${run}`);
    expect(json).not.toContain(`Responsable ${run}`);
    expect(json).not.toMatch(/"(tarea|responsable|payments?|contractAmountMxn|notes)"/);
  });

  it("reads only what the tab shows", async () => {
    const archivos = await getPortalProjectData({ id: p.granted, tab: "archivos" });
    expect(archivos).toMatchObject({ schedule: null, etapas: [], documents: null });

    const cronograma = await getPortalProjectData({ id: p.granted, tab: "cronograma" });
    expect(cronograma?.schedule?.sections).toHaveLength(1);
    expect(cronograma?.etapas).toEqual([]);
  });

  it("the home data lists only the visible projects", async () => {
    const { projects } = await getPortalHomeData({});
    expect(projects.map((x) => x.id)).toEqual([p.granted]);
  });
});
