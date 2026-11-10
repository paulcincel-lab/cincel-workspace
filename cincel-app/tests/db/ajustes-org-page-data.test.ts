// @vitest-environment node
/**
 * Ajustes › General, Tema, Control de horario and Google page data (Query
 * Migration 9c, #965) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Read-only: it creates no rows.
 *
 * - Each page-data action re-checks its segment capability: FORBIDDEN for a
 *   viewer without it (and for a guest); Google is Administrador only.
 * - Horario: `rows` is empty unless `canViewTeamHours`; the loader reads the
 *   time-tracking setting once.
 * - Google: mappings, puestos and Estado in ≤ 9 statements, and the health
 *   read writes nothing.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
// The org appearance read opts out of prerendering with `connection()`; there is no request scope here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

/** Turns `canViewTeamHours` off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noReport: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    canViewTeamHours: (user: Parameters<typeof actual.canViewTeamHours>[0]) =>
      perms.noReport ? false : actual.canViewTeamHours(user),
  };
});

/** Monday of the current week, as the page computes it. */
async function thisWeek(): Promise<string> {
  const { localDate, mondayOf } = await import("@/lib/time-tracking/local-time");
  return mondayOf(localDate(new Date()));
}

describe.skipIf(!url)("Ajustes org page data (test DB)", async () => {
  const { asViewer } = await import("@/lib/query/test-utils");
  const { countQueries } = await import("../helpers/count-queries");
  const actions = await import("@/lib/actions/page-data/ajustes-actions");
  const { loadAjustesGoogle, loadAjustesHorario } = await import("@/lib/loaders/ajustes");
  const { requireCapabilityUser } = await import("@/lib/auth/session");

  const admin = { id: randomUUID(), access: "Administrador" as const };
  const direccion = { id: randomUUID(), access: "Dirección" as const };
  const colaborador = { id: randomUUID(), access: "Colaborador" as const };

  describe("FORBIDDEN without the segment capability", () => {
    it("General, Tema and Horario refuse a Colaborador", async () => {
      const weekStart = await thisWeek();
      await asViewer(colaborador, async () => {
        await expect(actions.getAjustesGeneralPageData({})).rejects.toThrow(/^FORBIDDEN/);
        await expect(actions.getAjustesTemaPageData({})).rejects.toThrow(/^FORBIDDEN/);
        await expect(actions.getAjustesHorarioPageData({ weekStart })).rejects.toThrow(/^FORBIDDEN/);
      });
    });

    it("Google refuses anyone but an Administrador", async () => {
      for (const viewer of [direccion, colaborador]) {
        await asViewer(viewer, async () => {
          await expect(actions.getAjustesGooglePageData({})).rejects.toThrow(/^FORBIDDEN/);
        });
      }
    });

    it("a guest gets FORBIDDEN everywhere", async () => {
      const weekStart = await thisWeek();
      await asViewer(null, async () => {
        await expect(actions.getAjustesGeneralPageData({})).rejects.toThrow(/^FORBIDDEN/);
        await expect(actions.getAjustesTemaPageData({})).rejects.toThrow(/^FORBIDDEN/);
        await expect(actions.getAjustesHorarioPageData({ weekStart })).rejects.toThrow(/^FORBIDDEN/);
        await expect(actions.getAjustesGooglePageData({})).rejects.toThrow(/^FORBIDDEN/);
      });
    });

    it("an Administrador gets every segment", async () => {
      const weekStart = await thisWeek();
      await asViewer(admin, async () => {
        await expect(actions.getAjustesGeneralPageData({})).resolves.toEqual({ canManage: true, canManageAppearance: true });
        await expect(actions.getAjustesTemaPageData({})).resolves.toHaveProperty("org.baseTheme");
        await expect(actions.getAjustesHorarioPageData({ weekStart })).resolves.toMatchObject({
          canManage: true,
          canViewReport: true,
        });
        await expect(actions.getAjustesGooglePageData({})).resolves.toHaveProperty("mappings");
      });
    });

    it("Horario rejects a weekStart that is not a Monday", async () => {
      const { addDays } = await import("@/lib/time-tracking/local-time");
      const tuesday = addDays(await thisWeek(), 1);
      await asViewer(admin, async () => {
        await expect(actions.getAjustesHorarioPageData({ weekStart: tuesday })).rejects.toThrow(/^INVALID/);
      });
    });
  });

  describe("Horario", () => {
    it("rows are empty unless canViewTeamHours; Dirección gets the report without the settings capability", async () => {
      const weekStart = await thisWeek();
      await asViewer(direccion, async () => {
        const data = await actions.getAjustesHorarioPageData({ weekStart });
        expect(data).toMatchObject({ canManage: false, canViewReport: true });
      });

      perms.noReport = true;
      try {
        await asViewer(admin, async () => {
          const data = await actions.getAjustesHorarioPageData({ weekStart });
          expect(data).toMatchObject({ canManage: true, canViewReport: false, rows: [] });
        });
      } finally {
        perms.noReport = false;
      }
    });

    it("reads the time-tracking setting once per load", async () => {
      const weekStart = await thisWeek();
      await asViewer(admin, async () => {
        const user = await requireCapabilityUser();
        const { statements } = await countQueries(() => loadAjustesHorario(user, { weekStart }));
        const settingReads = statements.filter((statement) => /app_settings/i.test(statement.sql));
        expect(settingReads).toHaveLength(1);
      });
    });

    it("rows carry only the report fields", async () => {
      const weekStart = await thisWeek();
      await asViewer(admin, async () => {
        const { rows } = await actions.getAjustesHorarioPageData({ weekStart });
        for (const row of rows) {
          expect(Object.keys(row).sort()).toEqual(["days", "lateCount", "name", "needsReview", "staffId", "status", "target", "total"]);
        }
      });
    });
  });

  describe("Google", () => {
    it("loads mappings, puestos and Estado in ≤ 9 statements, all reads", async () => {
      const { result, count, statements } = await countQueries(() => loadAjustesGoogle(admin));
      expect(count).toBeLessThanOrEqual(9);
      expect(statements.every((statement) => /^\s*(select|with)\b/i.test(statement.sql))).toBe(true);
      expect(Array.isArray(result.mappings)).toBe(true);
      for (const position of result.positions) expect(Object.keys(position).sort()).toEqual(["id", "name"]);
      expect(result.health).not.toBeNull();
    });
  });
});
