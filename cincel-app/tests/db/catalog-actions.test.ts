// @vitest-environment node
/**
 * Catalog page-data actions against a real Postgres (#954 Security). Runs
 * only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and
 * is deleted afterwards.
 *
 * - `fetchCatalogProjectSpaces` for a project the viewer can't see (no
 *   `canViewProjects`, a deleted project, an unknown id) → `null`; a guest or
 *   a session without system access → FORBIDDEN.
 * - `fetchCatalogStaff` / `fetchCatalogAssignableStaff` rows carry exactly
 *   `{id,name}` (+ `suggested`).
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

describe.skipIf(!url)("catalog actions (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { fetchCatalogAssignableStaff, fetchCatalogProjectOptions, fetchCatalogProjectSpaces, fetchCatalogStaff } = await import(
    "@/lib/actions/page-data/catalog-actions"
  );

  const ids = { projects: [] as string[], staff: [] as string[] };
  let visibleProject = "";
  let deletedProject = "";
  let viewerId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Catalog ${run}`, lastName: "Prueba", email: `catalog-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    viewerId = member.id;
    ids.staff.push(member.id);

    const [visible] = await db
      .insert(schema.projects)
      .values({ name: `Catalog ${run} visible`, status: "activo" })
      .returning({ id: schema.projects.id });
    visibleProject = visible.id;
    ids.projects.push(visible.id);
    await db.insert(schema.projectSpaces).values([
      { projectId: visibleProject, name: "Cocina", sortOrder: 0 },
      { projectId: visibleProject, name: "Baño", sortOrder: 1 },
    ]);

    const [deleted] = await db
      .insert(schema.projects)
      .values({ name: `Catalog ${run} borrado`, status: "activo", deletedAt: new Date() })
      .returning({ id: schema.projects.id });
    deletedProject = deleted.id;
    ids.projects.push(deleted.id);
    await db.insert(schema.projectSpaces).values({ projectId: deletedProject, name: "Sala", sortOrder: 0 });
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
  });

  describe("fetchCatalogProjectSpaces", () => {
    it("lists a visible project's espacios in order", async () => {
      const rows = await asViewer(colaborador(), () => fetchCatalogProjectSpaces({ projectId: visibleProject }));
      expect(rows?.map((s) => s.name)).toEqual(["Cocina", "Baño"]);
      expect(rows?.every((s) => s.projectId === visibleProject)).toBe(true);
    });

    it("is null for a viewer without canViewProjects", async () => {
      perms.noProjects = true;
      const rows = await asViewer(colaborador(), () => fetchCatalogProjectSpaces({ projectId: visibleProject }));
      expect(rows).toBeNull();
    });

    it("is null for a deleted project, even for an admin", async () => {
      const rows = await asViewer(admin(), () => fetchCatalogProjectSpaces({ projectId: deletedProject }));
      expect(rows).toBeNull();
    });

    it("is null for an unknown project", async () => {
      const rows = await asViewer(admin(), () => fetchCatalogProjectSpaces({ projectId: randomUUID() }));
      expect(rows).toBeNull();
    });

    it("a guest gets FORBIDDEN", async () => {
      await expect(asViewer(null, () => fetchCatalogProjectSpaces({ projectId: visibleProject }))).rejects.toThrow(
        "FORBIDDEN",
      );
    });

    it("a session without system access gets FORBIDDEN", async () => {
      await expect(
        asViewer({ ...colaborador(), status: "no_system_access" }, () =>
          fetchCatalogProjectSpaces({ projectId: visibleProject }),
        ),
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("fetchCatalogProjectOptions", () => {
    it("lists live projects as exactly {id,name,status,currentWorkflowId}", async () => {
      const rows = await asViewer(colaborador(), () => fetchCatalogProjectOptions({}));
      expect(rows.find((r) => r.id === visibleProject)).toEqual({
        id: visibleProject,
        name: `Catalog ${run} visible`,
        status: "activo",
        currentWorkflowId: null,
      });
      expect(rows.some((r) => r.id === deletedProject)).toBe(false);
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(["currentWorkflowId", "id", "name", "status"]);
    });

    it("is empty for a viewer without canViewProjects", async () => {
      perms.noProjects = true;
      expect(await asViewer(colaborador(), () => fetchCatalogProjectOptions({}))).toEqual([]);
    });
  });

  describe("staff catalogs", () => {
    it("fetchCatalogStaff rows are exactly {id,name}", async () => {
      const rows = await asViewer(admin(), () => fetchCatalogStaff({}));
      const mine = rows.find((r) => r.id === viewerId);
      expect(mine).toEqual({ id: viewerId, name: `Catalog ${run} Prueba` });
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(["id", "name"]);
    });

    it("fetchCatalogAssignableStaff rows are exactly {id,name,suggested}", async () => {
      const rows = await asViewer(colaborador(), () => fetchCatalogAssignableStaff({ workflowId: null }));
      expect(rows.find((r) => r.id === viewerId)).toEqual({ id: viewerId, name: `Catalog ${run} Prueba`, suggested: false });
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(["id", "name", "suggested"]);
    });

    it("a guest gets FORBIDDEN", async () => {
      await expect(asViewer(null, () => fetchCatalogStaff({}))).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(null, () => fetchCatalogAssignableStaff({ workflowId: null }))).rejects.toThrow("FORBIDDEN");
    });
  });
});
