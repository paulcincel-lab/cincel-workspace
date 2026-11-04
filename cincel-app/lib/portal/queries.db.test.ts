// @vitest-environment node
/**
 * Portal queries against a real Postgres (BE §B.4.3, §B.8 #1, #8, #10). Runs
 * only when TEST_DATABASE_URL points at a migrated database. Every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("portal queries (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { getPortalProject, getPortalSchedule, listPortalProjects } = await import("./queries");

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], users: [] as string[] };
  let clientUserId = "";
  let otherUserId = "";
  const p: Record<"granted" | "revoked" | "other" | "cancelado" | "deleted", string> = {
    granted: "", revoked: "", other: "", cancelado: "", deleted: "",
  };

  beforeAll(async () => {
    const [mgr, coord] = await db
      .insert(schema.staff)
      .values([
        { name: `Gerente ${run}`, lastName: "Portal", email: `gerente-${run}@cincel.example` },
        { name: `Coordinador ${run}`, email: `coord-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    ids.staff.push(mgr.id, coord.id);

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente portal ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(contact.id);

    const mk = async (key: keyof typeof p, extra: Partial<typeof schema.projects.$inferInsert> = {}) => {
      const [row] = await db
        .insert(schema.projects)
        .values({ name: `Portal ${run} ${key}`, clientId: contact.id, managerId: mgr.id, coordinatorId: coord.id,
          addressStreet: "Madrid 22", addressState: "CDMX", progress: 25, ...extra })
        .returning({ id: schema.projects.id });
      p[key] = row.id;
      ids.projects.push(row.id);
    };
    await mk("granted");
    await mk("revoked");
    await mk("other");
    await mk("cancelado", { status: "cancelado" });
    await mk("deleted", { deletedAt: new Date() });

    const users = await db
      .insert(schema.portalUsers)
      .values([
        { email: `cliente-${run}@example.com`, name: "Cliente", contactId: contact.id, invitedByStaffId: mgr.id,
          status: "active" },
        { email: `otro-${run}@example.com`, name: "Otro", contactId: contact.id, invitedByStaffId: mgr.id,
          status: "active" },
      ])
      .returning({ id: schema.portalUsers.id });
    clientUserId = users[0].id;
    otherUserId = users[1].id;
    ids.users.push(clientUserId, otherUserId);

    const grant = (projectId: string, portalUserId: string, revoked = false) => ({
      projectId, portalUserId, grantedByStaffId: mgr.id,
      ...(revoked ? { revokedAt: new Date(), revokedByStaffId: mgr.id } : {}),
    });
    await db.insert(schema.projectPortalAccess).values([
      grant(p.granted, clientUserId),
      grant(p.revoked, clientUserId, true),
      grant(p.cancelado, clientUserId),
      grant(p.deleted, clientUserId),
      grant(p.other, otherUserId),
    ]);

    const [schedule] = await db
      .insert(schema.projectSchedules)
      .values({ projectId: p.granted })
      .returning({ id: schema.projectSchedules.id });
    const t = (n: number, seccion: string, status: "pending" | "progress" | "done") => ({
      scheduleId: schedule.id, stableKey: `${run}-${n}`, planta: "Planta baja", seccion, seccionOrder: n < 3 ? 1 : 2,
      responsable: `Responsable ${run}`, inicio: `2026-02-0${n}`, fin: `2026-02-1${n}`, tarea: `Tarea ${run} ${n}`,
      status, sortOrder: n,
    });
    await db.insert(schema.scheduleTasks).values([t(1, "Preliminares", "done"), t(2, "Preliminares", "pending"),
      t(3, "Acabados", "progress")]);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.users.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.users));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("lists only projects with active access, not revoked, cancelado or deleted ones", async () => {
    const list = await listPortalProjects(clientUserId);
    expect(list.map((x) => x.id)).toEqual([p.granted]);
    expect(list[0]).toMatchObject({ address: "Madrid 22, CDMX", progressPct: 25,
      manager: { name: `Gerente ${run} Portal`, email: `gerente-${run}@cincel.example` } });
  });

  it("does not show another user's project", async () => {
    expect((await listPortalProjects(otherUserId)).map((x) => x.id)).toEqual([p.other]);
    expect(await getPortalProject(clientUserId, p.other)).toBeNull();
  });

  it("returns null for revoked, cancelado and deleted projects", async () => {
    for (const id of [p.revoked, p.cancelado, p.deleted]) expect(await getPortalProject(clientUserId, id)).toBeNull();
    expect((await getPortalProject(clientUserId, p.granted))?.id).toBe(p.granted);
  });

  it("returns the schedule per seccion with no tarea, responsable or coordinator", async () => {
    const schedule = await getPortalSchedule(clientUserId, p.granted);
    expect(schedule?.sections.map((s) => [s.seccion, s.progressPct])).toEqual([["Preliminares", 50], ["Acabados", 0]]);
    const json = JSON.stringify([schedule, await listPortalProjects(clientUserId)]);
    expect(json).not.toContain(`Tarea ${run}`);
    expect(json).not.toContain(`Responsable ${run}`);
    expect(json).not.toContain(`Coordinador ${run}`);
    expect(json).not.toMatch(/"(tarea|responsable)"/);
  });

  it("returns null schedule without access or without a schedule", async () => {
    expect(await getPortalSchedule(otherUserId, p.granted)).toBeNull();
    expect(await getPortalSchedule(otherUserId, p.other)).toBeNull();
  });
});
