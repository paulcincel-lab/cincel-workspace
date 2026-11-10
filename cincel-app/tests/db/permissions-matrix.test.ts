// @vitest-environment node
/**
 * Ajustes › Permisos server matrix (#971) against a real Postgres, through
 * real sessions (`core.sessions` + the session cookie), so every check reads
 * the saved matrix the way production does. Runs only when TEST_DATABASE_URL
 * points at a migrated database. Rows it creates carry a per-run marker and
 * are deleted afterwards; the saved matrix is put back as it was.
 *
 * - Non-admins (and guests) cannot read or write the matrix: FORBIDDEN.
 * - A capability turned off for a role makes an action return FORBIDDEN and
 *   a page 404 for that role (positions, taskStatuses, team, projects); one
 *   turned on lets another role act.
 * - Administrador cannot be restricted.
 * - Every changed cell is audited in `auth_events`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.token ? { value: jar.token } : undefined),
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("permissions matrix (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const authRepository = await import("@/lib/repositories/auth-repository");
  const permissionsActions = await import("@/lib/actions/permissions-actions");
  const pageData = await import("@/lib/actions/page-data/ajustes-actions");
  const positionsActions = await import("@/lib/actions/positions-actions");
  const taskStatusesActions = await import("@/lib/actions/task-statuses-actions");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const permissions = await import("@/lib/auth/permissions");
  const { buildDefaultPermissionsState } = await import("@/lib/auth/permissionsState");

  const staffIds: string[] = [];
  const tokens: Record<"admin" | "direccion" | "colaborador", string> = { admin: "", direccion: "", colaborador: "" };
  let adminId = "";
  let savedBefore: Array<typeof schema.rolePermissions.$inferSelect> = [];
  const positionIds: string[] = [];

  async function as<T>(who: keyof typeof tokens | null, fn: () => Promise<T>): Promise<T> {
    jar.token = who ? tokens[who] : null;
    try {
      return await fn();
    } finally {
      jar.token = null;
    }
  }

  beforeAll(async () => {
    savedBefore = await db.select().from(schema.rolePermissions);
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Permisos ${run} Admin`, email: `permisos-admin-${run}@cincel.example`, role: "Administrador" },
        { name: `Permisos ${run} Dirección`, email: `permisos-dir-${run}@cincel.example`, role: "Dirección" },
        { name: `Permisos ${run} Colab`, email: `permisos-colab-${run}@cincel.example`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    staffIds.push(...rows.map((row) => row.id));
    adminId = staffIds[0]!;
    tokens.admin = (await authRepository.createSessionRecord(staffIds[0]!)).token;
    tokens.direccion = (await authRepository.createSessionRecord(staffIds[1]!)).token;
    tokens.colaborador = (await authRepository.createSessionRecord(staffIds[2]!)).token;
  });

  afterAll(async () => {
    await db.delete(schema.rolePermissions);
    if (savedBefore.length > 0) await db.insert(schema.rolePermissions).values(savedBefore);
    if (positionIds.length > 0) await db.delete(schema.positions).where(inArray(schema.positions.id, positionIds));
    if (staffIds.length > 0) {
      await db.delete(schema.authEvents).where(inArray(schema.authEvents.staffId, staffIds));
      await db.delete(schema.sessions).where(inArray(schema.sessions.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  function edited() {
    const matrix = structuredClone(buildDefaultPermissionsState());
    matrix["Dirección"].positions!.canManagePositions = false;
    matrix["Dirección"].taskStatuses!.canManageTaskStatuses = false;
    matrix["Dirección"].team!.canViewTeam = false;
    matrix["Dirección"].projects!.canViewProjects = false;
    matrix.Colaborador.positions!.canManagePositions = true;
    // Protected: ignored.
    matrix.Administrador.projects!.canViewProjects = false;
    return matrix;
  }

  it("non-admins and guests cannot read or write the matrix", async () => {
    for (const who of ["direccion", "colaborador", null] as const) {
      const save = await as(who, () => permissionsActions.savePermissionsMatrixAction({ permissions: edited() }));
      expect(save.ok, String(who)).toBe(false);
      if (!save.ok) expect(save.error).toMatch(/^FORBIDDEN/);
      const restore = await as(who, () => permissionsActions.restoreDefaultPermissionsAction());
      expect(restore.ok).toBe(false);
      if (!restore.ok) expect(restore.error).toMatch(/^FORBIDDEN/);
      await expect(as(who, () => pageData.getAjustesPermisosPageData({}))).rejects.toThrow(/FORBIDDEN/);
    }
  });

  it("an admin's save is enforced for every user of the role on their next request", async () => {
    const saved = await as("admin", () => permissionsActions.savePermissionsMatrixAction({ permissions: edited() }));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data.changed).toBe(5);
    expect(saved.data.hasCustom).toBe(true);

    // Actions: the capability turned off → FORBIDDEN.
    const position = await as("direccion", () => positionsActions.createPositionAction({ name: `Puesto ${run} D` }));
    expect(position).toMatchObject({ ok: false });
    if (!position.ok) expect(position.error).toMatch(/FORBIDDEN/);
    const status = await as("direccion", () => taskStatusesActions.createTaskStatusAction({ name: `Estatus ${run}` }));
    expect(status).toMatchObject({ ok: false });
    if (!status.ok) expect(status.error).toMatch(/FORBIDDEN/);

    // Pages: the capability turned off → 404.
    const { default: PersonasPage } = await import("@/app/(staff)/personas/page");
    await expect(as("direccion", () => PersonasPage())).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    const { default: ProyectosPage } = await import("@/app/(staff)/proyectos/page");
    await expect(as("direccion", () => ProyectosPage())).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });

    // Turned on for Colaborador → allowed.
    const created = await as("colaborador", () => positionsActions.createPositionAction({ name: `Puesto ${run} C` }));
    expect(created.ok).toBe(true);
    if (created.ok) positionIds.push(created.data.id);

    // Administrador stays unrestricted.
    const admin = await as("admin", () => requireCapabilityUser());
    expect(permissions.resolveProjectsCapabilities(admin).canViewProjects).toBe(true);

    // The page data shows the saved matrix.
    const page = await as("admin", () => pageData.getAjustesPermisosPageData({}));
    expect(page.hasCustom).toBe(true);
    expect(page.permissions["Dirección"].team!.canViewTeam).toBe(false);
    expect(page.permissions.Administrador.projects!.canViewProjects).toBe(true);

    // Audited: one row per changed cell, by the admin.
    const events = await db
      .select({ reason: schema.authEvents.reason })
      .from(schema.authEvents)
      .where(and(eq(schema.authEvents.staffId, adminId), eq(schema.authEvents.kind, "permissions_changed")));
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.reason)).toContain("Dirección · Equipo › Ver colaboradores: Sí → No");
  });

  it("restoring the defaults gives the capabilities back", async () => {
    const restored = await as("admin", () => permissionsActions.restoreDefaultPermissionsAction());
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.data.hasCustom).toBe(false);
    expect(await db.select().from(schema.rolePermissions)).toEqual([]);

    const direccion = await as("direccion", () => requireCapabilityUser());
    expect(direccion.permissionOverrides).toBeUndefined();
    expect(permissions.resolvePositionsCapabilities(direccion).canManagePositions).toBe(true);
    const colaborador = await as("colaborador", () => requireCapabilityUser());
    expect(permissions.resolvePositionsCapabilities(colaborador).canManagePositions).toBe(false);

    const events = await db
      .select({ id: schema.authEvents.id })
      .from(schema.authEvents)
      .where(and(eq(schema.authEvents.staffId, adminId), eq(schema.authEvents.kind, "permissions_restored")));
    expect(events).toHaveLength(5);
  });
});
