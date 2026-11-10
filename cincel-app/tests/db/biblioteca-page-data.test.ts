// @vitest-environment node
/**
 * Biblioteca and Mis vacaciones page data (Query Migration Phase 8, #942)
 * against a real Postgres. Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). Every row it creates carries a
 * per-run marker and is deleted afterwards.
 *
 * - `listResourceLinks({ section, viewerId })` filters the section and the
 *   personal links (`personal_for_id IS NULL OR = viewer`) in SQL.
 * - The Biblioteca loader never returns another user's personal links (the
 *   data is dehydrated into public HTML); a section ships only its rows plus
 *   the viewer's favorites; no capability → FORBIDDEN.
 * - `getMisVacacionesPageData`: a non-decider gets `deciders: null` (no
 *   pending requests of others, no settings); a decider gets the others'
 *   pending requests, never their own.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns `canViewResources` / `enterprise.canView` off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noResources: false, noEmpresa: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveResourcesCapabilities: (user: Parameters<typeof actual.resolveResourcesCapabilities>[0]) => {
      const caps = actual.resolveResourcesCapabilities(user);
      return {
        ...caps,
        canViewResources: perms.noResources ? false : caps.canViewResources,
        enterprise: { ...caps.enterprise, canView: perms.noEmpresa ? false : caps.enterprise.canView },
      };
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Biblioteca page data (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { listResourceLinks } = await import("@/lib/repositories/resources-repository");
  const { getBibliotecaPageData, getMisVacacionesPageData } = await import("@/lib/actions/page-data/biblioteca-actions");
  const { loadBibliotecaPageData } = await import("@/lib/loaders/biblioteca");

  const ids = { staff: [] as string[], links: [] as string[] };
  let ana = "";
  let beto = "";
  const link = {} as Record<string, string>;

  const colaborador = (id: () => string) => () => ({ id: id(), access: "Colaborador" as const });
  const asAna = colaborador(() => ana);
  const asBeto = colaborador(() => beto);
  const betoAdmin = () => ({ id: beto, access: "Administrador" as const });

  /** Only this run's rows (the database may hold others). */
  const mine = (rows: { id: string }[]) => rows.map((r) => r.id).filter((id) => ids.links.includes(id));
  const nameOf = (id: string) => Object.entries(link).find(([, value]) => value === id)?.[0];
  const names = (rows: { id: string }[]) => mine(rows).map(nameOf).sort();

  beforeAll(async () => {
    const staff = await db
      .insert(schema.staff)
      .values([
        { name: `Ana biblioteca ${run}`, email: `ana-bib-${run}@cincel.example` },
        { name: `Beto biblioteca ${run}`, email: `beto-bib-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    ana = staff[0].id;
    beto = staff[1].id;
    ids.staff.push(ana, beto);

    // [name, section, personal for]; "anaDocs" is a shared row of a personal section.
    const rows: [string, string, string | null][] = [
      ["formacionShared", "formacion", null],
      ["formatosShared", "formatos-obra", null],
      ["anaDocs", "mis-documentos", null],
      ["anaPersonal", "mis-documentos", ana],
      ["betoPersonal", "mis-documentos", beto],
      ["anaFavorite", "mis-favoritos", ana],
      ["betoFavorite", "mis-favoritos", beto],
      ["vacacionesShared", "mis-vacaciones", null],
      ["vacacionesAna", "mis-vacaciones", ana],
      ["empresaShared", "empresa", null],
    ];
    const inserted = await db
      .insert(schema.resourceLinks)
      .values(
        rows.map(([name, section, personalForId]) => ({
          title: `${name} ${run}`,
          section,
          linkType: "drive_file",
          url: `https://docs.google.com/document/d/${name}${run}/edit`,
          personalForId,
        })),
      )
      .returning({ id: schema.resourceLinks.id });
    rows.forEach(([name], i) => {
      link[name] = inserted[i].id;
    });
    ids.links.push(...inserted.map((r) => r.id));

    // A pending request of Ana and one of Beto (the decider never sees his own).
    await db.insert(schema.vacationRequests).values([
      { staffId: ana, fromDate: "2031-07-07", toDate: "2031-07-11", kind: "vacaciones", days: 5 },
      { staffId: beto, fromDate: "2031-08-04", toDate: "2031-08-05", kind: "personal", days: 2 },
    ]);
  });

  afterAll(async () => {
    if (ids.links.length) await db.delete(schema.resourceLinks).where(inArray(schema.resourceLinks.id, ids.links));
    // Vacation requests cascade with the staff rows.
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noResources = false;
    perms.noEmpresa = false;
  });

  describe("listResourceLinks", () => {
    it("filters one section and the viewer's personal links in SQL", async () => {
      const rows = await listResourceLinks({ section: "mis-documentos", viewerId: beto });
      expect(names(rows)).toEqual(["anaDocs", "betoPersonal"]);
    });

    it("filters a list of sections", async () => {
      const rows = await listResourceLinks({ section: ["formacion", "mis-favoritos"], viewerId: ana });
      expect(names(rows)).toEqual(["anaFavorite", "formacionShared"]);
    });

    it("reads nothing for an empty section list", async () => {
      await expect(listResourceLinks({ section: [], viewerId: ana })).resolves.toEqual([]);
    });
  });

  describe("getBibliotecaPageData", () => {
    it("never returns another user's personal links (index as Beto)", async () => {
      const data = await asViewer(asBeto(), () => getBibliotecaPageData({ section: null }));
      const got = names(data.links);
      expect(got).not.toContain("anaPersonal");
      expect(got).not.toContain("anaFavorite");
      expect(got).not.toContain("vacacionesAna");
      expect(got).toEqual(expect.arrayContaining(["betoPersonal", "betoFavorite", "formacionShared", "formatosShared"]));
      // A Colaborador has no `enterprise.canView` by default: Empresa stays out of the index.
      expect(got).not.toContain("empresaShared");
      expect(data.viewerId).toBe(beto);
      // The index carries the open counts of its own links only (never who opened).
      expect(data.usage).not.toBeNull();
      for (const id of Object.keys(data.usage!.byLink)) expect(data.links.some((link) => link.id === id)).toBe(true);
    });

    it("ships only the section's rows plus the viewer's favorites", async () => {
      const data = await asViewer(asAna(), () => getBibliotecaPageData({ section: "formacion" }));
      expect(names(data.links)).toEqual(["anaFavorite", "formacionShared"]);
      expect(new Set(data.links.map((l) => l.section))).toEqual(new Set(["formacion", "mis-favoritos"]));
      expect(data.usage).toBeNull();
    });

    it("leaves Empresa out of the index without enterprise.canView", async () => {
      perms.noEmpresa = true;
      const data = await asViewer(asAna(), () => getBibliotecaPageData({ section: null }));
      expect(names(data.links)).not.toContain("empresaShared");
      await expect(asViewer(asAna(), () => getBibliotecaPageData({ section: "empresa" }))).rejects.toThrow(/^FORBIDDEN/);
    });

    it("is FORBIDDEN without the capability, and for a guest", async () => {
      perms.noResources = true;
      await expect(asViewer(asAna(), () => getBibliotecaPageData({ section: "formacion" }))).rejects.toThrow(/^FORBIDDEN/);
      perms.noResources = false;
      await expect(asViewer(null, () => getBibliotecaPageData({ section: null }))).rejects.toThrow(/^FORBIDDEN/);
    });

    it("rejects an unknown section", async () => {
      await expect(
        asViewer(asAna(), () => getBibliotecaPageData({ section: "otra" as "formacion" })),
      ).rejects.toThrow(/^INVALID/);
    });

    it("gives the server prefetch the same data as the action", async () => {
      const viaAction = await asViewer(asAna(), () => getBibliotecaPageData({ section: "mis-documentos" }));
      const viaLoader = await asViewer(asAna(), async () =>
        loadBibliotecaPageData(await requireCapabilityUser(), { section: "mis-documentos" }),
      );
      expect(mine(viaLoader.links)).toEqual(mine(viaAction.links));
      expect(names(viaLoader.links)).toEqual(["anaDocs", "anaFavorite", "anaPersonal"]);
    });
  });

  describe("getMisVacacionesPageData", () => {
    it("returns deciders: null for a non-decider (no pending requests of others, no settings)", async () => {
      const data = await asViewer(asAna(), () => getMisVacacionesPageData({ month: "2031-07" }));
      expect(data.deciders).toBeNull();
      expect(data.month).toBe("2031-07");
      expect(data.mine).not.toBeNull();
      expect(JSON.stringify(data)).not.toContain(beto);
    });

    it("returns the others' pending requests and the settings for a decider, never their own", async () => {
      const data = await asViewer(betoAdmin(), () => getMisVacacionesPageData({ month: "2031-07" }));
      expect(data.deciders).not.toBeNull();
      const requesters = data.deciders!.requests.map((r) => r.staffId);
      expect(requesters).toContain(ana);
      expect(requesters).not.toContain(beto);
      expect(data.deciders!.viewerStaffId).toBe(beto);
      expect(data.deciders!.settings).not.toBeNull();
    });

    it("ships only the mis-vacaciones documents the viewer may see", async () => {
      const asOwner = await asViewer(asAna(), () => getMisVacacionesPageData({}));
      expect(names(asOwner.library.links)).toEqual(["vacacionesAna", "vacacionesShared"]);
      const asOther = await asViewer(asBeto(), () => getMisVacacionesPageData({}));
      expect(names(asOther.library.links)).toEqual(["vacacionesShared"]);
    });

    it("keeps the documents empty, not FORBIDDEN, without canViewResources", async () => {
      perms.noResources = true;
      const data = await asViewer(asAna(), () => getMisVacacionesPageData({}));
      expect(data.library.links).toEqual([]);
    });

    it("rejects a malformed month", async () => {
      await expect(asViewer(asAna(), () => getMisVacacionesPageData({ month: "julio" }))).rejects.toThrow(/^INVALID/);
    });
  });
});
