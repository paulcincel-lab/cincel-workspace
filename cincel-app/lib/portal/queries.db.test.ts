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
  const { getPortalProject, getPortalProjectTramos, getPortalSchedule, getPortalTeam, listPortalProjects } =
    await import("./queries");
  const { findPortalProjectAccess } = await import("./session-store");
  const { loadPortalProjectData } = await import("@/lib/loaders/portal");

  const asUser = (id: string) => ({ id, name: "Cliente", email: "x@example.com", contactId: "c", companyName: null });
  async function access(portalUserId: string, projectId: string) {
    const row = await findPortalProjectAccess(portalUserId, projectId);
    if (!row) throw new Error("expected access");
    return row;
  }

  const ids = {
    staff: [] as string[],
    contacts: [] as string[],
    projects: [] as string[],
    users: [] as string[],
    workflows: [] as string[],
  };
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
    await db.insert(schema.scheduleTasks).values([
      { ...t(1, "Preliminares", "done"), startedOn: "2026-02-01", finishedOn: "2026-02-12" },
      t(2, "Preliminares", "pending"),
      { ...t(3, "Acabados", "progress"), startedOn: "2026-02-04" },
    ]);

    // Tramo progress: one tramo under way on the granted project, with tasks on it and on another project.
    const [wf] = await db
      .insert(schema.workflows)
      .values({ key: `portal-${run}`, name: `Etapa ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    ids.workflows.push(wf.id);
    await db.update(schema.scheduleTasks).set({ workflowId: wf.id })
      .where(inArray(schema.scheduleTasks.stableKey, [`${run}-1`, `${run}-2`]));
    await db.insert(schema.projectStages).values({ projectId: p.granted, workflowId: wf.id,
      startedAt: new Date("2026-06-03T12:00:00Z") });
    const task = (projectId: string, n: number, extra: Partial<typeof schema.tasks.$inferInsert> = {}) => ({
      projectId, kind: "usuario" as const, workflowId: wf.id, title: `Tarea secreta ${run} ${n}`, createdById: mgr.id,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      task(p.granted, 1, { closedAt: new Date(), status: "completado" }),
      task(p.granted, 2, { closedAt: new Date(), status: "completado" }),
      task(p.granted, 3),
      task(p.granted, 4),
      // Not counted: deleted, archived, or another project's.
      task(p.granted, 5, { deletedAt: new Date() }),
      task(p.granted, 6, { archived: true, closedAt: new Date(), status: "completado" }),
      task(p.other, 7, { closedAt: new Date(), status: "completado" }),
      task(p.other, 8, { closedAt: new Date(), status: "completado" }),
    ]);

    // Team: the manager, one member and one soft-deleted member.
    const [member, gone] = await db
      .insert(schema.staff)
      .values([
        { name: `Ana ${run}`, lastName: "Ruiz", email: `ana-${run}@cincel.example` },
        { name: `Borrado ${run}`, email: `borrado-${run}@cincel.example`, deletedAt: new Date() },
      ])
      .returning({ id: schema.staff.id });
    ids.staff.push(member.id, gone.id);
    await db.insert(schema.projectMembers).values([
      { projectId: p.granted, staffId: member.id, role: "Diseñadora líder" },
      { projectId: p.granted, staffId: gone.id, role: "Residente" },
    ]);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.users.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.users));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.workflows.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("etapa progress counts closed tasks of the project only", async () => {
    const tramos = await getPortalProjectTramos(await access(clientUserId, p.granted));
    const mine = tramos.find((x) => x.key === `portal-${run}`);
    // 2 closed of 4 live tasks; deleted, archived and the other project's tasks are left out.
    expect(mine).toEqual({ key: `portal-${run}`, name: `Etapa ${run}`, state: "en_curso", progressPct: 50,
      startMonth: "2026-06" });
    expect(JSON.stringify(tramos)).not.toContain("Tarea secreta");
  });

  it("team excludes deleted staff", async () => {
    const team = await getPortalTeam(await access(clientUserId, p.granted));
    expect(team).toEqual([
      { name: `Gerente ${run} Portal`, role: "Responsable del proyecto", email: `gerente-${run}@cincel.example` },
      { name: `Ana ${run} Ruiz`, role: "Diseñadora líder", email: null },
    ]);
    expect(JSON.stringify(team)).not.toContain(`Borrado ${run}`);
    expect(JSON.stringify(team)).not.toContain(`Coordinador ${run}`);
  });

  it("lists only projects with active access, not revoked, cancelado or deleted ones", async () => {
    const list = await listPortalProjects(clientUserId);
    expect(list.map((x) => x.id)).toEqual([p.granted]);
    expect(list[0]).toMatchObject({ address: "Madrid 22, CDMX", progressPct: 25,
      manager: { name: `Gerente ${run} Portal`, email: `gerente-${run}@cincel.example` } });
  });

  it("does not show another user's project", async () => {
    expect((await listPortalProjects(otherUserId)).map((x) => x.id)).toEqual([p.other]);
    expect(await findPortalProjectAccess(clientUserId, p.other)).toBeNull();
    expect(await loadPortalProjectData(asUser(clientUserId), { id: p.other, tab: "resumen" })).toBeNull();
  });

  it("returns null for revoked, cancelado and deleted projects", async () => {
    for (const id of [p.revoked, p.cancelado, p.deleted]) {
      expect(await loadPortalProjectData(asUser(clientUserId), { id, tab: "cronograma" })).toBeNull();
    }
    expect((await getPortalProject(await access(clientUserId, p.granted)))?.id).toBe(p.granted);
  });

  it("returns the schedule per seccion with no tarea, responsable or coordinator", async () => {
    const schedule = await getPortalSchedule(await access(clientUserId, p.granted));
    expect(schedule?.sections.map((s) => [s.seccion, s.progressPct])).toEqual([["Preliminares", 50], ["Acabados", 0]]);
    const json = JSON.stringify([schedule, await listPortalProjects(clientUserId)]);
    expect(json).not.toContain(`Tarea ${run}`);
    expect(json).not.toContain(`Responsable ${run}`);
    expect(json).not.toContain(`Coordinador ${run}`);
    expect(json).not.toMatch(/"(tarea|responsable)"/);
  });

  it("returns no schedule without access, and a null schedule without one", async () => {
    expect(await loadPortalProjectData(asUser(otherUserId), { id: p.granted, tab: "cronograma" })).toBeNull();
    expect(await getPortalSchedule(await access(otherUserId, p.other))).toBeNull();
  });

  it("sections carry real dates once every task finished, and the linked etapa's key", async () => {
    const schedule = await getPortalSchedule(await access(clientUserId, p.granted));
    expect(schedule?.sections.map((s) => [s.seccion, s.actualStart, s.actualEnd, s.tramoKey])).toEqual([
      ["Preliminares", "2026-02-01", null, `portal-${run}`],
      ["Acabados", "2026-02-04", null, null],
    ]);
  });

  it("progressDeltaMonth compares with the month's first snapshot, and the producer writes today's", async () => {
    const { scheduleToday } = await import("@/lib/cronograma/today");
    const { snapshotProjectProgress } = await import("@/lib/cron/daily-producers/progress-snapshots");
    const { and, eq } = await import("drizzle-orm");
    const a = await access(clientUserId, p.granted);
    expect((await getPortalProject(a))?.progressDeltaMonth).toBeNull();

    const today = scheduleToday();
    await db.insert(schema.projectProgressSnapshots).values([
      { projectId: p.granted, takenOn: `${today.slice(0, 7)}-01`, progressPct: 20 },
      // Last month: ignored.
      { projectId: p.granted, takenOn: "2020-01-31", progressPct: 5 },
    ]);
    expect((await getPortalProject(a))?.progressDeltaMonth).toBe(5);
    expect((await listPortalProjects(clientUserId))[0].progressDeltaMonth).toBe(5);

    await db.update(schema.projects).set({ progress: 30 }).where(eq(schema.projects.id, p.granted));
    expect(await snapshotProjectProgress(db, new Date())).toBeGreaterThan(0);
    const [row] = await db
      .select({ pct: schema.projectProgressSnapshots.progressPct })
      .from(schema.projectProgressSnapshots)
      .where(and(eq(schema.projectProgressSnapshots.projectId, p.granted), eq(schema.projectProgressSnapshots.takenOn, today)));
    expect(row?.pct).toBe(30);
    // Running again the same day overwrites, never duplicates.
    await snapshotProjectProgress(db, new Date());
    const rows = await db
      .select({ pct: schema.projectProgressSnapshots.progressPct })
      .from(schema.projectProgressSnapshots)
      .where(and(eq(schema.projectProgressSnapshots.projectId, p.granted), eq(schema.projectProgressSnapshots.takenOn, today)));
    expect(rows).toHaveLength(1);
  });
});
