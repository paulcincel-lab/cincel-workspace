// @vitest-environment node
/**
 * Archivos and Clientes page data (Query Migration 5d, #962) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and
 * is deleted afterwards.
 *
 * - `listInvitableContacts` is one statement and returns what the old
 *   four-statement version returned.
 * - `getProyectoClientesData` / `getProyectoClientesActivity`: FORBIDDEN
 *   without `portal.manageAccess`; null for a project out of scope or
 *   soft-deleted; the invitable contacts carry only the sheet's fields.
 * - `getProyectoArchivosData` for a project out of scope or deleted →
 *   `{ kind: 'not_found' }` with no Drive call; a read never creates folders.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Drive stand-in: records calls; the listing is an empty root. */
const drive = vi.hoisted(() => ({
  getStaffFilesProject: vi.fn(async () => ({ driveFolderId: "root", driveFolderStatus: "ready", driveFolderError: null })),
  listStaffProjectFiles: vi.fn(async () => ({ status: "ok", folderId: "root", breadcrumbs: [], items: [] })),
}));
vi.mock("@/lib/google/staff-files-app", () => drive);
/** Folder creation must never run during a read. */
const folders = vi.hoisted(() => ({ retryProjectFolders: vi.fn(), syncProjectFolders: vi.fn(), syncProjectFolderName: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => folders);

/** Role overrides: `canViewProjects` and `portal.manageAccess` off. */
const perms = vi.hoisted(() => ({ noProjects: false, noPortal: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveProjectsCapabilities: (user: Parameters<typeof actual.resolveProjectsCapabilities>[0]) => {
      const caps = actual.resolveProjectsCapabilities(user);
      return perms.noProjects ? { ...caps, canViewProjects: false } : caps;
    },
    resolvePortalCapabilities: (user: Parameters<typeof actual.resolvePortalCapabilities>[0]) => {
      const caps = actual.resolvePortalCapabilities(user);
      return perms.noPortal ? { ...caps, manageAccess: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Archivos and Clientes page data (test DB)", async () => {
  const { and, asc, eq, inArray, isNull } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { countQueries } = await import("../helpers/count-queries");
  const { listInvitableContacts } = await import("@/lib/repositories/portal-contacts-repository");
  const { getProyectoArchivosData, getProyectoClientesActivity, getProyectoClientesData } = await import(
    "@/lib/actions/page-data/proyectos-actions"
  );

  /** The four-statement version this issue replaced, kept here to compare results. */
  async function oldListInvitableContacts(projectId: string) {
    const [project] = await db
      .select({ clientId: schema.projects.clientId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)))
      .limit(1);
    if (!project || project.clientId === null) return [];
    const linked = await db
      .select({ contactId: schema.projectContacts.contactId })
      .from(schema.projectContacts)
      .where(eq(schema.projectContacts.projectId, projectId));
    const ids = [...new Set([project.clientId, ...linked.map((row) => row.contactId)])];
    const rows = await db
      .select({ id: schema.contacts.id, name: schema.contacts.name, type: schema.contacts.type, email: schema.contacts.email })
      .from(schema.contacts)
      .where(
        and(
          inArray(schema.contacts.id, ids),
          inArray(schema.contacts.type, ["cliente", "socio"]),
          isNull(schema.contacts.deletedAt),
        ),
      )
      .orderBy(asc(schema.contacts.name));
    if (rows.length === 0) return [];
    const people = await db
      .select({ contactId: schema.contactPeople.contactId, email: schema.contactPeople.email })
      .from(schema.contactPeople)
      .where(
        and(
          inArray(
            schema.contactPeople.contactId,
            rows.map((row) => row.id),
          ),
          eq(schema.contactPeople.isPrimary, true),
        ),
      );
    const primaryEmail = new Map(people.map((person) => [person.contactId, person.email?.trim() || null]));
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as "cliente" | "socio",
        email: row.email?.trim() || primaryEmail.get(row.id) || null,
        isProjectClient: row.id === project.clientId,
      }))
      .sort((a, b) => Number(b.isProjectClient) - Number(a.isProjectClient));
  }

  const ids = { projects: [] as string[], staff: [] as string[], contacts: [] as string[] };
  let viewerId = "";
  let projectId = "";
  let noClientProject = "";
  let deletedProject = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Clientes ${run}`, email: `clientes-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const contacts = await db
      .insert(schema.contacts)
      .values([
        // The client: no email of its own, its primary person's instead.
        { type: "cliente", name: `B Cliente ${run}`, notes: "nota interna" },
        { type: "socio", name: `A Socio ${run}`, email: ` socio-${run}@example.test ` },
        { type: "cliente", name: `C Otro cliente ${run}`, email: `otro-${run}@example.test` },
        { type: "proveedor", name: `D Proveedor ${run}`, email: `prov-${run}@example.test` },
        { type: "cliente", name: `E Borrado ${run}`, deletedAt: new Date() },
      ])
      .returning({ id: schema.contacts.id });
    ids.contacts.push(...contacts.map((c) => c.id));
    const [client, socio, otro, proveedor, borrado] = contacts.map((c) => c.id);
    await db.insert(schema.contactPeople).values([
      { contactId: client, name: "Ana", email: ` ana-${run}@example.test `, isPrimary: true },
      { contactId: client, name: "Luis", email: `luis-${run}@example.test`, isPrimary: false },
      { contactId: otro, name: "Primaria vacía", email: "  ", isPrimary: true },
    ]);

    const projects = await db
      .insert(schema.projects)
      .values([
        { name: `Clientes ${run}`, clientId: client, driveClientFolderId: `folder-${run}` },
        { name: `Sin cliente ${run}` },
        { name: `Borrado ${run}`, clientId: client, deletedAt: new Date() },
      ])
      .returning({ id: schema.projects.id });
    [projectId, noClientProject, deletedProject] = projects.map((p) => p.id);
    ids.projects.push(...projects.map((p) => p.id));

    await db.insert(schema.projectContacts).values([
      { projectId, contactId: socio },
      { projectId, contactId: otro },
      { projectId, contactId: proveedor },
      { projectId, contactId: borrado },
      // The client linked again must not duplicate it.
      { projectId, contactId: client },
      { projectId: noClientProject, contactId: socio },
    ]);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
    perms.noPortal = false;
    drive.getStaffFilesProject.mockClear();
    drive.listStaffProjectFiles.mockClear();
    folders.retryProjectFolders.mockClear();
  });

  it("listInvitableContacts is one statement and equals the old result", async () => {
    const { result, count } = await countQueries(() => listInvitableContacts(projectId));
    expect(count).toBe(1);
    expect(result).toEqual(await oldListInvitableContacts(projectId));
    expect(result.map((c) => c.name)).toEqual([`B Cliente ${run}`, `A Socio ${run}`, `C Otro cliente ${run}`]);
    expect(result[0]).toMatchObject({ isProjectClient: true, email: `ana-${run}@example.test` });
    expect(result[1].email).toBe(`socio-${run}@example.test`);
    expect(result[2].email).toBe(`otro-${run}@example.test`);
  });

  it("listInvitableContacts is empty without a client or for a deleted project, like before", async () => {
    for (const id of [noClientProject, deletedProject, randomUUID()]) {
      const { result, count } = await countQueries(() => listInvitableContacts(id));
      expect(count).toBe(1);
      expect(result).toEqual([]);
      expect(await oldListInvitableContacts(id)).toEqual([]);
    }
  });

  it("getProyectoClientesData returns the tab with only the sheet's contact fields", async () => {
    const data = await asViewer(admin(), () => getProyectoClientesData({ id: projectId }));
    expect(data).not.toBeNull();
    expect(data!.rows).toEqual([]);
    expect(data!.hasClient).toBe(true);
    expect(data!.canAssignClient).toBe(true);
    expect(data!.clientFolderUrl).toContain(`folder-${run}`);
    for (const contact of data!.contacts) {
      expect(Object.keys(contact).sort()).toEqual(["email", "id", "isProjectClient", "name", "type"]);
    }
    expect(JSON.stringify(data)).not.toContain("nota interna");
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
    expect(drive.listStaffProjectFiles).not.toHaveBeenCalled();
  });

  it("Clientes data and activity are FORBIDDEN without portal.manageAccess", async () => {
    perms.noPortal = true;
    await expect(asViewer(admin(), () => getProyectoClientesData({ id: projectId }))).rejects.toThrow("FORBIDDEN");
    await expect(asViewer(admin(), () => getProyectoClientesActivity({ id: projectId }))).rejects.toThrow("FORBIDDEN");
  });

  it("Clientes data and activity are null out of scope or for a deleted project", async () => {
    perms.noProjects = true;
    expect(await asViewer(admin(), () => getProyectoClientesData({ id: projectId }))).toBeNull();
    expect(await asViewer(admin(), () => getProyectoClientesActivity({ id: projectId }))).toBeNull();
    perms.noProjects = false;
    expect(await asViewer(admin(), () => getProyectoClientesData({ id: deletedProject }))).toBeNull();
    expect(await asViewer(admin(), () => getProyectoClientesActivity({ id: deletedProject }))).toBeNull();
    expect(await asViewer(admin(), () => getProyectoClientesActivity({ id: projectId }))).toEqual([]);
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getProyectoClientesData({ id: projectId }))).rejects.toThrow("FORBIDDEN");
    await expect(asViewer(null, () => getProyectoArchivosData({ id: projectId, folderId: null }))).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("getProyectoArchivosData out of scope or deleted is not_found with no Drive call", async () => {
    perms.noProjects = true;
    expect(await asViewer(admin(), () => getProyectoArchivosData({ id: projectId, folderId: null }))).toEqual({
      kind: "not_found",
    });
    perms.noProjects = false;
    expect(await asViewer(admin(), () => getProyectoArchivosData({ id: deletedProject, folderId: "x" }))).toEqual({
      kind: "not_found",
    });
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
    expect(drive.listStaffProjectFiles).not.toHaveBeenCalled();
  });

  it("getProyectoArchivosData lists one folder and creates nothing", async () => {
    const data = await asViewer(admin(), () => getProyectoArchivosData({ id: projectId, folderId: null }));
    expect(data).toMatchObject({ kind: "ok", result: { status: "ok" } });
    expect(drive.listStaffProjectFiles).toHaveBeenCalledTimes(1);
    expect(folders.retryProjectFolders).not.toHaveBeenCalled();
    expect(folders.syncProjectFolders).not.toHaveBeenCalled();
  });
});
