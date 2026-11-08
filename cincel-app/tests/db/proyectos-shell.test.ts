// @vitest-environment node
/**
 * Project tab shell (#954) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 *
 * - `getProyectoShell`'s loader runs ≤ 4 statements (`countQueries`) and
 *   makes no Drive call.
 * - Its counts equal today's `loadProjectTabShell` counts (archivos
 *   excepted): live top-level tasks and every portal access row.
 * - Out of scope (no `canViewProjects`, a deleted or unknown project) → null;
 *   a guest → FORBIDDEN.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Any Drive read fails the test: the shell must not list files. */
const drive = vi.hoisted(() => ({
  getStaffFilesProject: vi.fn(async () => {
    throw new Error("Drive called");
  }),
  listStaffProjectFiles: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));
vi.mock("@/lib/google/staff-files-app", () => drive);

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

describe.skipIf(!url)("project tab shell (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { getProyectoShell } = await import("@/lib/actions/page-data/proyectos-shell-actions");
  const { loadProyectoShell } = await import("@/lib/loaders/proyectos-shell");
  const { listTasks } = await import("@/lib/repositories/tasks-repository");
  const { listProjectAccess } = await import("@/lib/repositories/portal-access-repository");
  const { viewerScopeOf } = await import("@/lib/auth/viewer-scope");

  const ids = { projects: [] as string[], staff: [] as string[], contacts: [] as string[], portalUsers: [] as string[] };
  let projectId = "";
  let deletedProject = "";
  let viewerId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Shell ${run}`, email: `shell-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const [client] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente shell ${run}` })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(client.id);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Shell ${run}`, status: "activo", managerId: viewerId })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: viewerId,
      managerId: viewerId,
      ...extra,
    });
    const [parent] = await db
      .insert(schema.tasks)
      .values([task("Uno"), task("Dos"), task("Archivada", { archived: true }), task("Borrada", { deletedAt: new Date() })])
      .returning({ id: schema.tasks.id });
    await db.insert(schema.tasks).values(task("Subtarea", { parentTaskId: parent.id }));

    const portalUsers = await db
      .insert(schema.portalUsers)
      .values([
        { email: `a-${run}@cliente.example`, name: "Cliente A", contactId: client.id, invitedByStaffId: viewerId },
        { email: `b-${run}@cliente.example`, name: "Cliente B", contactId: client.id, invitedByStaffId: viewerId },
      ])
      .returning({ id: schema.portalUsers.id });
    ids.portalUsers.push(...portalUsers.map((u) => u.id));
    await db.insert(schema.projectPortalAccess).values([
      { projectId, portalUserId: portalUsers[0].id, grantedByStaffId: viewerId },
      // Revoked rows still count (the Clientes tab lists them).
      { projectId, portalUserId: portalUsers[1].id, grantedByStaffId: viewerId, revokedAt: new Date() },
    ]);

    const [deleted] = await db
      .insert(schema.projects)
      .values({ name: `Shell ${run} borrado`, status: "activo", deletedAt: new Date() })
      .returning({ id: schema.projects.id });
    deletedProject = deleted.id;
    ids.projects.push(deleted.id);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.portalUsers.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.portalUsers));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
    drive.getStaffFilesProject.mockClear();
    drive.listStaffProjectFiles.mockClear();
  });

  it("runs ≤ 4 statements, makes no Drive call, and matches today's counts (archivos excepted)", async () => {
    const user = await asViewer(admin(), () => requireCapabilityUser());
    const { result: shell, count } = await countQueries(() => loadProyectoShell(user, { id: projectId }));
    expect(count).toBeLessThanOrEqual(4);
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
    expect(drive.listStaffProjectFiles).not.toHaveBeenCalled();

    // Today's `loadProjectTabShell` counts: the filtered `listTasks` rows and the access rows.
    const rows = await listTasks({ projectId }, viewerScopeOf(user));
    const todayTareas = rows.filter((t) => !t.parentTaskId && !t.archived).length;
    const todayClientes = (await listProjectAccess(projectId)).length;

    expect(shell?.counts.tareas).toBe(todayTareas);
    expect(shell?.counts.tareas).toBe(2);
    expect(shell?.counts.clientes).toBe(todayClientes);
    expect(shell?.counts.clientes).toBe(2);
    expect(shell?.counts.archivos).toBe(0);
    expect(shell?.canManagePortal).toBe(true);
    expect(shell?.project).toMatchObject({ id: projectId, name: `Shell ${run}` });
    expect(shell?.detail.id).toBe(projectId);
  });

  it("getProyectoShell returns the shell for a visible project", async () => {
    const shell = await asViewer(admin(), () => getProyectoShell({ id: projectId }));
    expect(shell?.project.id).toBe(projectId);
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
  });

  it("is null for a viewer without canViewProjects", async () => {
    perms.noProjects = true;
    expect(await asViewer(colaborador(), () => getProyectoShell({ id: projectId }))).toBeNull();
  });

  it("is null for a deleted project, even for an admin", async () => {
    expect(await asViewer(admin(), () => getProyectoShell({ id: deletedProject }))).toBeNull();
  });

  it("is null for an unknown project", async () => {
    expect(await asViewer(admin(), () => getProyectoShell({ id: randomUUID() }))).toBeNull();
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getProyectoShell({ id: projectId }))).rejects.toThrow("FORBIDDEN");
  });

  it("a session without system access gets FORBIDDEN", async () => {
    await expect(
      asViewer({ ...colaborador(), status: "no_system_access" }, () => getProyectoShell({ id: projectId })),
    ).rejects.toThrow("FORBIDDEN");
  });
});
