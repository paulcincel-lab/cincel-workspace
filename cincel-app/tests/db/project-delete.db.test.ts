// @vitest-environment node
/**
 * Project delete and restore (#1050) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row it creates
 * carries a per-run marker and is deleted afterwards.
 *
 * - No delete without `canDeleteProject`.
 * - The delete soft-deletes the project and its live tasks and subtasks with
 *   one `deleted_at`, revokes the portal access (audit row), writes the
 *   history rows and leaves the Drive folder as it was. Tasks deleted before
 *   keep their own `deleted_at`.
 * - The preview counts the live and the open tasks.
 * - Restore: admins or the deleter, within 30 days; exactly the tasks deleted
 *   with the project come back; portal access stays revoked.
 * - "Proyectos eliminados" lists it for admins only.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/cache/screens/inicio", () => ({ revalidateInicioScreen: vi.fn() }));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("project delete and restore (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { deleteProjectAction, restoreProjectAction } = await import("@/lib/actions/projects-actions");
  const { getDeletedProjects, getProjectDeletePreview } = await import("@/lib/actions/page-data/proyectos-actions");
  const { restoreProject } = await import("@/lib/repositories/projects-repository");

  const ids = { projects: [] as string[], staff: [] as string[], contacts: [] as string[], portalUsers: [] as string[] };
  let adminId = "";
  let direccionId = "";
  let otherDirId = "";
  let colabId = "";
  let projectId = "";
  let accessId = "";
  const t = { open: "", done: "", sub: "", before: "" };

  const admin = () => ({ id: adminId, access: "Administrador" as const });
  const direccion = () => ({ id: direccionId, access: "Dirección" as const });
  const otherDir = () => ({ id: otherDirId, access: "Dirección" as const });
  const colaborador = () => ({ id: colabId, access: "Colaborador" as const });

  async function project() {
    const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    return row;
  }
  async function taskRows() {
    return db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
  }

  beforeAll(async () => {
    const staffRows = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, email: `pd-admin-${run}@cincel.example` },
        { name: `Dir ${run}`, email: `pd-dir-${run}@cincel.example` },
        { name: `Dir2 ${run}`, email: `pd-dir2-${run}@cincel.example` },
        { name: `Colab ${run}`, email: `pd-colab-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    [adminId, direccionId, otherDirId, colabId] = staffRows.map((r) => r.id);
    ids.staff.push(...staffRows.map((r) => r.id));

    const [client] = await db
      .insert(schema.contacts)
      .values({ type: "cliente" as const, name: `Cliente PD ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(client.id);

    const [p] = await db
      .insert(schema.projects)
      .values({
        name: `Borrable ${run}`,
        status: "activo" as const,
        clientId: client.id,
        driveFolderId: `drive-${run}`,
        driveFolderStatus: "ready" as const,
      })
      .returning({ id: schema.projects.id });
    projectId = p.id;
    ids.projects.push(p.id);

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `PD${run} ${title}`,
      createdById: adminId,
      ...extra,
    });
    const rows = await db
      .insert(schema.tasks)
      .values([
        task("Abierta"),
        task("Hecha", { status: "completado" as const, closedAt: new Date() }),
        task("Borrada antes", { deletedAt: new Date(Date.now() - 60_000) }),
      ])
      .returning({ id: schema.tasks.id });
    [t.open, t.done, t.before] = rows.map((r) => r.id);
    const [sub] = await db
      .insert(schema.tasks)
      .values(task("Sub", { parentTaskId: t.open }))
      .returning({ id: schema.tasks.id });
    t.sub = sub.id;

    const [portalUser] = await db
      .insert(schema.portalUsers)
      .values({ email: `pd-portal-${run}@cliente.example`, name: `Portal ${run}`, contactId: client.id, invitedByStaffId: adminId })
      .returning({ id: schema.portalUsers.id });
    ids.portalUsers.push(portalUser.id);
    const [access] = await db
      .insert(schema.projectPortalAccess)
      .values({ projectId, portalUserId: portalUser.id, grantedByStaffId: adminId })
      .returning({ id: schema.projectPortalAccess.id });
    accessId = access.id;
  });

  afterAll(async () => {
    if (ids.portalUsers.length) {
      await db.delete(schema.portalAuditEvents).where(inArray(schema.portalAuditEvents.portalUserId, ids.portalUsers));
    }
    // Tasks and portal access go with their project (cascade).
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.portalUsers.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.portalUsers));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  it("counts the live and the open tasks for the dialog, and refuses the preview without canDeleteProject", async () => {
    const preview = await asViewer(direccion(), () => getProjectDeletePreview(projectId));
    // Abierta, Hecha and Sub; "Borrada antes" is already gone.
    expect(preview).toEqual({ id: projectId, name: `Borrable ${run}`, taskCount: 3, openTaskCount: 2 });
    await expect(asViewer(colaborador(), () => getProjectDeletePreview(projectId))).rejects.toThrow(/FORBIDDEN/);
  });

  it("does not delete without canDeleteProject", async () => {
    const result = await asViewer(colaborador(), () => deleteProjectAction(projectId));
    expect(result.ok).toBe(false);
    expect((await project()).deletedAt).toBeNull();
    expect((await taskRows()).filter((r) => r.deletedAt === null)).toHaveLength(3);
  });

  it("deletes the project and its live tasks with one deleted_at, revokes the portal access and keeps the Drive folder", async () => {
    const result = await asViewer(direccion(), () => deleteProjectAction(projectId));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.deletedTaskCount).toBe(3);

    const row = await project();
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedAt!.toISOString()).toBe(result.data.deletedAt);
    expect(row.driveFolderId).toBe(`drive-${run}`);

    const tasks = await taskRows();
    const byId = new Map(tasks.map((r) => [r.id, r]));
    for (const id of [t.open, t.done, t.sub]) expect(byId.get(id)!.deletedAt?.getTime()).toBe(row.deletedAt!.getTime());
    expect(byId.get(t.before)!.deletedAt!.getTime()).toBeLessThan(row.deletedAt!.getTime());

    const [access] = await db.select().from(schema.projectPortalAccess).where(eq(schema.projectPortalAccess.id, accessId));
    expect(access.revokedAt).not.toBeNull();
    expect(access.revokedByStaffId).toBe(direccionId);
    const audit = await db
      .select()
      .from(schema.portalAuditEvents)
      .where(and(eq(schema.portalAuditEvents.projectId, projectId), eq(schema.portalAuditEvents.kind, "revoke")));
    expect(audit).toHaveLength(1);

    const history = await db
      .select()
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.field, "deleted"), eq(schema.historyEvents.actorId, direccionId)));
    expect(history.map((h) => h.entityId).sort()).toEqual([projectId, t.open, t.done, t.sub].sort());

    // A second delete finds nothing live.
    const again = await asViewer(direccion(), () => deleteProjectAction(projectId));
    expect(again.ok).toBe(false);
  });

  it("lists the deleted project for admins only", async () => {
    const rows = await asViewer(admin(), () => getDeletedProjects());
    const row = rows.find((r) => r.id === projectId);
    expect(row).toMatchObject({
      name: `Borrable ${run}`,
      clientName: `Cliente PD ${run}`,
      deletedBy: { id: direccionId, name: `Dir ${run}` },
      taskCount: 3,
    });
    expect(Date.parse(row!.restorableUntil) - Date.parse(row!.deletedAt)).toBe(30 * 24 * 60 * 60 * 1000);
    await expect(asViewer(direccion(), () => getDeletedProjects())).rejects.toThrow(/FORBIDDEN/);
  });

  it("lets only an admin or the deleter restore, and only within 30 days", async () => {
    const forbidden = await asViewer(otherDir(), () => restoreProjectAction(projectId));
    expect(forbidden).toMatchObject({ ok: false });
    if (!forbidden.ok) expect(forbidden.error).toMatch(/FORBIDDEN/);

    const late = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    await expect(restoreProject(projectId, { staffId: adminId, isAdmin: true }, late)).rejects.toThrow(/INVALID/);
  });

  it("restores the project and exactly the tasks deleted with it; portal access stays revoked", async () => {
    const result = await asViewer(direccion(), () => restoreProjectAction(projectId));
    expect(result).toEqual({ ok: true, data: { id: projectId, restoredTaskCount: 3 } });
    expect((await project()).deletedAt).toBeNull();
    const byId = new Map((await taskRows()).map((r) => [r.id, r]));
    for (const id of [t.open, t.done, t.sub]) expect(byId.get(id)!.deletedAt).toBeNull();
    expect(byId.get(t.before)!.deletedAt).not.toBeNull();
    const [access] = await db.select().from(schema.projectPortalAccess).where(eq(schema.projectPortalAccess.id, accessId));
    expect(access.revokedAt).not.toBeNull();

    const notDeleted = await asViewer(admin(), () => restoreProjectAction(projectId));
    expect(notDeleted.ok).toBe(false);
  });

  it("an admin restores a project someone else deleted", async () => {
    expect((await asViewer(direccion(), () => deleteProjectAction(projectId))).ok).toBe(true);
    const result = await asViewer(admin(), () => restoreProjectAction(projectId));
    expect(result.ok).toBe(true);
  });
});
