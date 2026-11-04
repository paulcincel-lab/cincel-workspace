// @vitest-environment node
/**
 * Acceptance coverage for Staff SSO Phase 3 (backend spec §A.11 #8, #9, #15,
 * #16 and review NB 5) against a real Postgres, with the real folder sync,
 * staff token store, Archivos loader, picker mode switch and consent callback
 * wired together the way the routes wire them. Only Google is faked: one
 * in-memory Shared Drive and the GOOGLE_FAKE Directory. Each describe block
 * names the criterion its failures disprove.
 *
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row a test creates carries a per-run marker
 * and is deleted afterwards. All credentials below are placeholders.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const DOMAIN = "cincel.example";
const SHARED_DRIVE = "shared-drive-root";
const run = randomUUID().slice(0, 8);
const ROLE_GROUP = `test-${run}-colaboradores`;
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const ENV_KEYS = [
  "AUTH_GOOGLE_ENABLED",
  "GOOGLE_FAKE",
  "GOOGLE_WORKSPACE_DOMAIN",
  "TOKEN_ENCRYPTION_KEY",
  "GOOGLE_SA_CLIENT_EMAIL",
  "GOOGLE_SA_PRIVATE_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "APP_ORIGIN",
] as const;

describe.skipIf(!url)("Staff SSO Phase 3 acceptance (test DB)", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { DriveAdminError } = await import("@/lib/google/drive-admin");
  type DriveAdmin = import("@/lib/google/drive-admin").DriveAdmin;
  type DriveFile = import("@/lib/google/drive-admin").DriveFile;
  type ListOptions = import("@/lib/google/drive-admin").ListOptions;
  const { setFakeDirectoryState } = await import("@/lib/google/fake-directory");
  const { encryptToken } = await import("@/lib/google/token-crypto");
  const { getStaffAccessToken } = await import("@/lib/google/staff-token");
  const { createProjectAncestry, loadStaffFiles, isStaffFolderNotFound } = await import("@/lib/google/staff-files");
  const { getStaffFilesProject } = await import("@/lib/google/staff-files-app");
  const folders = await import("@/lib/google/project-folders");
  const { syncProjectFolders, retryProjectFolders } = await import("@/lib/google/project-folders-app");
  type ProjectDriveDeps = import("@/lib/google/project-folders-app").ProjectDriveDeps;
  const { getPickerDriveStatus, pickerDriveMode, resolvePickerDriveCaller } = await import("@/lib/google/picker-drive");
  const { calendarTokenMode } = await import("@/lib/google/calendar-sync-service");
  const repo = await import("@/lib/repositories/google-oauth-repository");
  const { grantGoogleScope } = await import("@/lib/auth/google-consent");

  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[] };
  let clientId = "";
  let n = 0;

  // ── Fake Shared Drive ────────────────────────────────────────────────────
  type Node = { name: string; parent: string | null; mimeType: string; trashed?: boolean };
  let tree: Map<string, Node>;
  let nextId = 1;
  let createFails = false;
  /** Access tokens Drive refuses (403) when they list a folder. */
  let deniedTokens: Set<string>;
  const listedWith: string[] = [];

  const toFile = (id: string): DriveFile => {
    const node = tree.get(id);
    if (!node) throw new DriveAdminError("File not found", 404, "notFound");
    return { id, name: node.name, mimeType: node.mimeType, parents: node.parent ? [node.parent] : [],
      trashed: !!node.trashed, modifiedTime: "2026-11-01T10:00:00.000Z", webViewLink: `https://drive.example/${id}` };
  };
  const childrenOf = (parentId: string) =>
    [...tree.entries()].filter(([, node]) => node.parent === parentId && !node.trashed).map(([id]) => toFile(id));

  /** Service-account client: folder creation and parent lookups. */
  const serviceDrive = {
    async createFolder(name: string, parentId: string) {
      if (createFails) throw new DriveAdminError("Insufficient permissions", 403, "insufficientFilePermissions");
      const id = `folder-${run}-${nextId++}`;
      tree.set(id, { name, parent: parentId, mimeType: FOLDER_MIME });
      return toFile(id);
    },
    async list(options: ListOptions = {}) {
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(options.q ?? "")?.[1]?.replace(/\\(.)/g, "$1");
      const files = childrenOf(options.parentId ?? "").filter((f) => !name || f.name === name);
      return { files };
    },
    async get(fileId: string) {
      return toFile(fileId);
    },
    async rename(fileId: string, name: string) {
      tree.get(fileId)!.name = name;
      return toFile(fileId);
    },
  } as unknown as DriveAdmin;

  /** A client acting with the staff member's own token, as staff-files-app opens it. */
  const openStaffDrive = (accessToken: string) => ({
    async listAll(options: Omit<ListOptions, "pageToken"> = {}) {
      listedWith.push(accessToken);
      if (deniedTokens.has(accessToken)) throw new DriveAdminError("Forbidden", 403, "insufficientFilePermissions");
      return childrenOf(options.parentId ?? "");
    },
  });

  const folderDeps = (): ProjectDriveDeps => ({
    db: db as unknown as ProjectDriveDeps["db"],
    openDrive: () => serviceDrive,
    sharedDriveId: SHARED_DRIVE,
    skip: false,
  });

  // ── Rows ─────────────────────────────────────────────────────────────────
  function person() {
    n += 1;
    return { sub: `sub-${run}-${n}`, email: `acept-${run}-${n}@${DOMAIN}`, name: `Acept ${run} ${n}`, hd: DOMAIN };
  }

  async function insertStaff(values: { name: string; email: string; googleSub?: string }) {
    const [row] = await db.insert(schema.staff).values(values).returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return row.id;
  }

  async function insertProject(name: string) {
    const [row] = await db
      .insert(schema.projects)
      .values({ code: `T-${run}-${ids.projects.length + 1}`, name, clientId })
      .returning({ id: schema.projects.id });
    ids.projects.push(row.id);
    return row.id;
  }

  async function projectRow(id: string) {
    const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
    return row;
  }

  async function tokenRow(staffId: string) {
    const [row] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    return row ?? null;
  }

  /** A linked staff member whose Google sign-in or consent stored a Drive grant (encrypted, `google_sub` set). */
  async function staffWithDriveGrant(accessToken = `staff-access-${run}-${n + 1}`) {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: who.sub });
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: who.email,
      accessToken: encryptToken(accessToken),
      refreshToken: encryptToken("staff-refresh"),
      scope: `openid email profile ${DRIVE}`,
      googleSub: who.sub,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    return { staffId, email: who.email, accessToken };
  }

  /** A staff member connected through the old connect flow (plaintext, `google_sub` null). */
  async function staffWithLegacyRow() {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email });
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: `legacy-${run}-${n}@gmail.example`,
      accessToken: "legacy-plain-access",
      refreshToken: "legacy-plain-refresh",
      scope: DRIVE,
      googleSub: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    return { staffId, email: who.email };
  }

  /** The Archivos tab for one staff member: real project row, real token store, fake Drive. */
  async function archivos(staffId: string, projectId: string, folderId: string | null = null) {
    const project = await getStaffFilesProject(projectId);
    if (!project) throw new Error("project not found");
    return loadStaffFiles(project, folderId, {
      ancestry: createProjectAncestry({ getDrive: () => serviceDrive }),
      getStaffToken: () => getStaffAccessToken(staffId, "drive"),
      openStaffDrive,
    });
  }

  async function readyProject(name: string) {
    const projectId = await insertProject(name);
    const result = await syncProjectFolders(projectId, folderDeps());
    expect(result?.status).toBe("ready");
    return projectId;
  }

  beforeAll(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    process.env.GOOGLE_FAKE = "1";
    process.env.GOOGLE_WORKSPACE_DOMAIN = DOMAIN;
    process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
    process.env.GOOGLE_SA_CLIENT_EMAIL = "service-account@placeholder.example";
    process.env.GOOGLE_SA_PRIVATE_KEY = "placeholder-key";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "placeholder-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "placeholder-client-secret";
    process.env.APP_ORIGIN = "http://localhost:3000";

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente acept ${run}` })
      .returning({ id: schema.contacts.id });
    clientId = contact.id;
    ids.contacts.push(contact.id);

    await db.insert(schema.workspaceGroupMappings).values({
      groupEmail: `${ROLE_GROUP}@${DOMAIN}`,
      groupId: ROLE_GROUP,
      kind: "role",
      role: "Colaborador",
      rank: 10,
    });
  });

  beforeEach(() => {
    tree = new Map([[SHARED_DRIVE, { name: "Proyectos", parent: null, mimeType: FOLDER_MIME }]]);
    createFails = false;
    deniedTokens = new Set();
    listedWith.length = 0;
    delete process.env.AUTH_GOOGLE_ENABLED;
  });

  afterEach(() => setFakeDirectoryState(null));

  afterAll(async () => {
    await db.delete(schema.authEvents).where(sql`${schema.authEvents.email} like ${`%-${run}-%`}`);
    await db.delete(schema.workspaceGroupMappings).where(eq(schema.workspaceGroupMappings.groupId, ROLE_GROUP));
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe("§A.11 #8: project folders in the Shared Drive", () => {
    it("creates the project folder and its three subfolders and stores their ids", async () => {
      const projectId = await insertProject(`Casa ${run}`);
      expect((await projectRow(projectId)).driveFolderStatus).toBe("pending");

      const result = await syncProjectFolders(projectId, folderDeps());
      expect(result).toMatchObject({ status: "ready", created: 4 });

      const row = await projectRow(projectId);
      expect(row.driveFolderStatus).toBe("ready");
      expect(row.driveFolderError).toBeNull();
      expect(tree.get(row.driveFolderId!)).toMatchObject({ name: `${row.code} · Casa ${run}`, parent: SHARED_DRIVE });
      expect(childrenOf(row.driveFolderId!).map((f) => f.name).sort()).toEqual([
        folders.INTERNAL_FOLDER_NAME,
        folders.CLIENT_FOLDER_NAME,
        folders.INBOUND_FOLDER_NAME,
      ]);
      expect(tree.get(row.driveInternalFolderId!)?.name).toBe(folders.INTERNAL_FOLDER_NAME);
      expect(tree.get(row.driveClientFolderId!)?.name).toBe(folders.CLIENT_FOLDER_NAME);
      expect(tree.get(row.driveInboundFolderId!)?.name).toBe(folders.INBOUND_FOLDER_NAME);
    });

    it("is idempotent: running again creates nothing and keeps the same ids", async () => {
      const projectId = await readyProject(`Idem ${run}`);
      const before = await projectRow(projectId);
      const size = tree.size;

      await expect(syncProjectFolders(projectId, folderDeps())).resolves.toMatchObject({ status: "ready", created: 0 });
      // Even with the status reset, the stored ids are reused and nothing new appears.
      await db.update(schema.projects).set({ driveFolderStatus: "pending" }).where(eq(schema.projects.id, projectId));
      await expect(syncProjectFolders(projectId, folderDeps())).resolves.toMatchObject({ status: "ready", created: 0 });

      expect(tree.size).toBe(size);
      const after = await projectRow(projectId);
      expect(after.driveFolderId).toBe(before.driveFolderId);
      expect(after.driveClientFolderId).toBe(before.driveClientFolderId);
    });

    it("with the project folder stored, finds existing subfolders by name and only creates the missing one", async () => {
      const projectId = await readyProject(`Parcial ${run}`);
      const before = await projectRow(projectId);
      tree.delete(before.driveInboundFolderId!);
      await db
        .update(schema.projects)
        .set({ driveClientFolderId: null, driveInboundFolderId: null, driveFolderStatus: "failed" })
        .where(eq(schema.projects.id, projectId));

      await expect(syncProjectFolders(projectId, folderDeps())).resolves.toMatchObject({ status: "ready", created: 1 });
      const after = await projectRow(projectId);
      expect(after.driveFolderId).toBe(before.driveFolderId);
      expect(after.driveClientFolderId).toBe(before.driveClientFolderId);
      expect(childrenOf(after.driveFolderId!)).toHaveLength(3);
    });

    it("a Drive failure leaves the project usable as failed with the error, and Reintentar carpeta fixes it", async () => {
      const projectId = await insertProject(`Falla ${run}`);
      createFails = true;

      await expect(syncProjectFolders(projectId, folderDeps())).resolves.toEqual({
        status: "failed",
        error: "Insufficient permissions",
      });
      const failed = await projectRow(projectId);
      expect(failed).toMatchObject({ driveFolderStatus: "failed", driveFolderError: "Insufficient permissions" });
      expect(failed.deletedAt).toBeNull();

      // The project is still an ordinary row: it can be edited while Drive is down.
      await db.update(schema.projects).set({ name: `Falla editada ${run}` }).where(eq(schema.projects.id, projectId));
      expect((await projectRow(projectId)).name).toBe(`Falla editada ${run}`);

      createFails = false;
      await expect(retryProjectFolders(projectId, folderDeps())).resolves.toEqual({ status: "ready" });
      const fixed = await projectRow(projectId);
      expect(fixed).toMatchObject({ driveFolderStatus: "ready", driveFolderError: null });
      expect(tree.get(fixed.driveFolderId!)?.name).toBe(`${fixed.code} · Falla editada ${run}`);
    });

    it("Reintentar carpeta is not_found for a soft-deleted project", async () => {
      const projectId = await insertProject(`Borrado ${run}`);
      await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
      await expect(retryProjectFolders(projectId, folderDeps())).resolves.toEqual({ status: "not_found" });
    });
  });

  describe("§A.11 #9: Archivos tab states", () => {
    it("reports pending and failed (with the folder error) before the folder is ready", async () => {
      const staff = await staffWithDriveGrant();
      const pending = await insertProject(`Pendiente ${run}`);
      await expect(archivos(staff.staffId, pending)).resolves.toEqual({ status: "pending" });

      createFails = true;
      const failed = await insertProject(`Fallida ${run}`);
      await syncProjectFolders(failed, folderDeps());
      await expect(archivos(staff.staffId, failed)).resolves.toEqual({
        status: "failed",
        error: "Insufficient permissions",
      });
      expect(listedWith).toEqual([]);
    });

    it("asks for Drive once, then lists the folder with the staff member's own token", async () => {
      const projectId = await readyProject(`Archivos ${run}`);
      const who = person();
      const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: who.sub });

      // No grant yet: the tab shows Conectar Google Drive and Drive is never called.
      await expect(archivos(staffId, projectId)).resolves.toEqual({ status: "needs_consent" });
      expect(listedWith).toEqual([]);

      const granted = await grantGoogleScope(
        staffId,
        "drive",
        who,
        { accessToken: `consent-access-${run}`, refreshToken: "consent-refresh", scope: `openid email profile ${DRIVE}`,
          expiresAt: new Date(Date.now() + 3600_000) },
        { ip: "203.0.113.7", userAgent: "vitest" },
      );
      expect(granted).toMatchObject({ status: "granted", linked: false });

      const first = await archivos(staffId, projectId);
      const row = await projectRow(projectId);
      expect(first).toMatchObject({
        status: "ok",
        folderId: row.driveFolderId,
        breadcrumbs: [{ id: row.driveFolderId, name: `${row.code} · Archivos ${run}` }],
      });
      if (first.status !== "ok") throw new Error("expected ok");
      expect(first.items.map((i) => [i.name, i.kind])).toEqual([
        [folders.INTERNAL_FOLDER_NAME, "folder"],
        [folders.CLIENT_FOLDER_NAME, "folder"],
        [folders.INBOUND_FOLDER_NAME, "folder"],
      ]);

      // Opening a subfolder later doesn't ask again.
      const sub = await archivos(staffId, projectId, row.driveClientFolderId);
      expect(sub).toMatchObject({ status: "ok", folderId: row.driveClientFolderId });
      expect(listedWith).toEqual([`consent-access-${run}`, `consent-access-${run}`]);
    });

    it("a user without Drive access to the folder gets no_drive_access", async () => {
      const projectId = await readyProject(`Sin acceso ${run}`);
      const staff = await staffWithDriveGrant();
      deniedTokens.add(staff.accessToken);
      await expect(archivos(staff.staffId, projectId)).resolves.toEqual({ status: "no_drive_access" });
    });

    it("a folder outside the project is not found (404)", async () => {
      const projectA = await readyProject(`A ${run}`);
      const projectB = await readyProject(`B ${run}`);
      const staff = await staffWithDriveGrant();
      const other = (await projectRow(projectB)).driveClientFolderId;
      const error = await archivos(staff.staffId, projectA, other).catch((e: unknown) => e);
      expect(isStaffFolderNotFound(error)).toBe(true);
    });

    it("a legacy (old connect) row never counts as a Drive grant for the tab", async () => {
      const projectId = await readyProject(`Legacy ${run}`);
      const staff = await staffWithLegacyRow();
      await expect(archivos(staff.staffId, projectId)).resolves.toEqual({ status: "needs_consent" });
      expect(listedWith).toEqual([]);
    });
  });

  describe("§A.11 #15: AUTH_GOOGLE_ENABLED=false keeps the picker and Calendar on the old path", () => {
    beforeEach(() => {
      process.env.AUTH_GOOGLE_ENABLED = "false";
    });

    it("both picker and Calendar sync are in delegation mode", () => {
      expect(pickerDriveMode()).toBe("delegation");
      expect(calendarTokenMode()).toBe("delegation");
    });

    it("the picker uses the old connect account and status shows it like before", async () => {
      const staff = await staffWithLegacyRow();
      const resolved = await resolvePickerDriveCaller(staff.staffId, staff.email);
      expect(resolved).toEqual({ ok: true, caller: { staffId: staff.staffId, email: staff.email } });

      await expect(
        getPickerDriveStatus({ staffId: staff.staffId, email: staff.email, googleLinked: false }),
      ).resolves.toEqual({
        configured: true,
        mode: "delegation",
        hasDriveGrant: true,
        googleLinked: false,
        oauthAvailable: true,
        connectedEmail: `legacy-${run}-${n}@gmail.example`,
      });
    });

    it("the picker falls back to service-account impersonation without a connected account", async () => {
      const who = person();
      const staffId = await insertStaff({ name: who.name, email: who.email });
      await expect(resolvePickerDriveCaller(staffId, who.email)).resolves.toEqual({
        ok: true,
        caller: { staffId, email: who.email },
      });
      const noEmail = await resolvePickerDriveCaller(staffId, "");
      expect(noEmail.ok).toBe(false);
      if (!noEmail.ok) expect(noEmail.response.status).toBe(403);
    });
  });

  describe("§A.11 #16: a password-session staff member connects Drive during cutover", () => {
    it("gets linked (google_sub set) and Drive then works in the tab and the picker", async () => {
      const projectId = await readyProject(`Cutover ${run}`);
      const who = person();
      const staffId = await insertStaff({ name: who.name, email: who.email });
      await db
        .insert(schema.authCredentials)
        .values({ staffId, passwordHash: "x", salt: "y", mustChangePassword: false });
      setFakeDirectoryState({
        users: [{ id: who.sub, primaryEmail: who.email }],
        groups: [{ id: ROLE_GROUP, email: `${ROLE_GROUP}@${DOMAIN}`, members: [who.email] }],
      });
      process.env.AUTH_GOOGLE_ENABLED = "true";

      // Before: no Google link, so Drive asks for consent everywhere.
      await expect(archivos(staffId, projectId)).resolves.toEqual({ status: "needs_consent" });
      const before = await resolvePickerDriveCaller(staffId, who.email);
      expect(before.ok).toBe(false);
      if (!before.ok) await expect(before.response.json()).resolves.toEqual({ error: "needs_consent" });

      await expect(
        grantGoogleScope(
          staffId,
          "drive",
          who,
          { accessToken: `cutover-access-${run}`, refreshToken: "cutover-refresh", scope: `openid ${DRIVE}`,
            expiresAt: new Date(Date.now() + 3600_000) },
          { ip: "203.0.113.7", userAgent: "vitest" },
        ),
      ).resolves.toEqual({ status: "granted", staffId, linked: true });

      const [staffRow] = await db.select().from(schema.staff).where(eq(schema.staff.id, staffId));
      expect(staffRow.googleSub).toBe(who.sub);
      expect((await tokenRow(staffId))?.googleSub).toBe(who.sub);

      await expect(archivos(staffId, projectId)).resolves.toMatchObject({ status: "ok" });
      await expect(resolvePickerDriveCaller(staffId, who.email)).resolves.toEqual({
        ok: true,
        caller: { staffId, email: who.email, accessToken: `cutover-access-${run}` },
      });
      await expect(getPickerDriveStatus({ staffId, email: who.email, googleLinked: true })).resolves.toMatchObject({
        mode: "staff_token",
        hasDriveGrant: true,
        googleLinked: true,
      });
    });
  });

  describe("NB 5: each mode reads only its own token rows", () => {
    it("staff_token mode uses a google_sub row and ignores a legacy row (403 needs_consent)", async () => {
      process.env.AUTH_GOOGLE_ENABLED = "true";
      const staff = await staffWithDriveGrant();
      await expect(resolvePickerDriveCaller(staff.staffId, staff.email)).resolves.toEqual({
        ok: true,
        caller: { staffId: staff.staffId, email: staff.email, accessToken: staff.accessToken },
      });

      const legacy = await staffWithLegacyRow();
      const refused = await resolvePickerDriveCaller(legacy.staffId, legacy.email);
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.response.status).toBe(403);
        await expect(refused.response.json()).resolves.toEqual({ error: "needs_consent" });
      }
      await expect(
        getPickerDriveStatus({ staffId: legacy.staffId, email: legacy.email, googleLinked: false }),
      ).resolves.toMatchObject({ mode: "staff_token", hasDriveGrant: false });
      // The plaintext legacy token is left as it is, never decrypted or rewritten.
      expect((await tokenRow(legacy.staffId))?.accessToken).toBe("legacy-plain-access");
    });

    it("delegation mode ignores a google_sub row: no encrypted token reaches the old path", async () => {
      process.env.AUTH_GOOGLE_ENABLED = "false";
      const staff = await staffWithDriveGrant();
      await expect(repo.getGoogleOauthAccount(staff.staffId)).resolves.toBeNull();
      await expect(resolvePickerDriveCaller(staff.staffId, staff.email)).resolves.toEqual({
        ok: true,
        caller: { staffId: staff.staffId, email: staff.email },
      });
      await expect(
        getPickerDriveStatus({ staffId: staff.staffId, email: staff.email, googleLinked: true }),
      ).resolves.toMatchObject({ mode: "delegation", connectedEmail: null, hasDriveGrant: true });
    });

    it("flipping the flag on, off and on again keeps both rows working in their own mode", async () => {
      const staff = await staffWithDriveGrant();
      const legacy = await staffWithLegacyRow();
      const encryptedBefore = (await tokenRow(staff.staffId))?.accessToken;

      process.env.AUTH_GOOGLE_ENABLED = "true";
      expect((await resolvePickerDriveCaller(staff.staffId, staff.email)).ok).toBe(true);
      expect((await resolvePickerDriveCaller(legacy.staffId, legacy.email)).ok).toBe(false);

      process.env.AUTH_GOOGLE_ENABLED = "false";
      await expect(resolvePickerDriveCaller(staff.staffId, staff.email)).resolves.toEqual({
        ok: true,
        caller: { staffId: staff.staffId, email: staff.email },
      });
      expect((await repo.getGoogleOauthAccount(legacy.staffId))?.accessToken).toBe("legacy-plain-access");
      // The old connect flow's token refresh only writes legacy rows.
      await repo.updateGoogleOauthTokens(staff.staffId, { accessToken: "plain", expiresAt: new Date() });
      expect((await tokenRow(staff.staffId))?.accessToken).toBe(encryptedBefore);

      process.env.AUTH_GOOGLE_ENABLED = "true";
      await expect(resolvePickerDriveCaller(staff.staffId, staff.email)).resolves.toEqual({
        ok: true,
        caller: { staffId: staff.staffId, email: staff.email, accessToken: staff.accessToken },
      });
    });
  });
});
