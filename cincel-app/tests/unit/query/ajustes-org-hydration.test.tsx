// @vitest-environment happy-dom
/**
 * Ajustes › General, Tema, Control de horario and Google (Phase 9c) hydrate
 * their page data: the server prefetch is dehydrated (through JSON, like the
 * RSC payload) and the client renders from it with **0** action calls on
 * mount, page data and legacy reads alike.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageData = vi.hoisted(() => ({
  getAjustesGeneralPageData: vi.fn(),
  getAjustesTemaPageData: vi.fn(),
  getAjustesHorarioPageData: vi.fn(),
  getAjustesGooglePageData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

const legacy = vi.hoisted(() => ({
  fetchGeneralSettingsAction: vi.fn(),
  saveGeneralSettingsAction: vi.fn(),
  restoreGeneralSettingsAction: vi.fn(),
  fetchOrgAppearanceAction: vi.fn(),
  saveOrgAppearanceAction: vi.fn(),
  resetOrgAppearanceAction: vi.fn(),
  fetchTimeTrackingSettingsAction: vi.fn(),
  fetchTeamHoursAction: vi.fn(),
  saveTimeTrackingSettingsAction: vi.fn(),
  listGroupMappingsAction: vi.fn(),
  getGoogleHealthAction: vi.fn(),
  createGroupMappingAction: vi.fn(),
  updateGroupMappingAction: vi.fn(),
  deleteGroupMappingAction: vi.fn(),
  ensureMissingProjectFoldersAction: vi.fn(),
  completeOnboardingAction: vi.fn(),
}));
vi.mock("@/lib/actions/app-settings-actions", () => ({
  fetchGeneralSettingsAction: legacy.fetchGeneralSettingsAction,
  saveGeneralSettingsAction: legacy.saveGeneralSettingsAction,
  restoreGeneralSettingsAction: legacy.restoreGeneralSettingsAction,
}));
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  fetchOrgAppearanceAction: legacy.fetchOrgAppearanceAction,
  saveOrgAppearanceAction: legacy.saveOrgAppearanceAction,
  resetOrgAppearanceAction: legacy.resetOrgAppearanceAction,
}));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  fetchTimeTrackingSettingsAction: legacy.fetchTimeTrackingSettingsAction,
  fetchTeamHoursAction: legacy.fetchTeamHoursAction,
  saveTimeTrackingSettingsAction: legacy.saveTimeTrackingSettingsAction,
}));
vi.mock("@/lib/actions/workspace-access-actions", () => ({
  listGroupMappingsAction: legacy.listGroupMappingsAction,
  getGoogleHealthAction: legacy.getGoogleHealthAction,
  createGroupMappingAction: legacy.createGroupMappingAction,
  updateGroupMappingAction: legacy.updateGroupMappingAction,
  deleteGroupMappingAction: legacy.deleteGroupMappingAction,
  ensureMissingProjectFoldersAction: legacy.ensureMissingProjectFoldersAction,
}));
vi.mock("@/lib/actions/onboarding-actions", () => ({ completeOnboardingAction: legacy.completeOnboardingAction }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/patterns/FormDialog", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));
vi.mock("@/components/widgets/RecordTable", () => import("@/tests/unit/fixtures/horario"));
vi.mock("@/components/ajustes/SettingsSaveBar", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import { AjustesGeneralClient } from "@/components/ajustes/AjustesGeneralClient";
import { GoogleSettings } from "@/components/ajustes/GoogleSettings";
import { HorarioClient } from "@/components/ajustes/HorarioClient";
import { ThemeEditor } from "@/components/ajustes/ThemeEditor";
import { GoogleSetupWizard } from "@/components/configuracion/GoogleSetupWizard";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import {
  ajustesGeneralOptions,
  ajustesGoogleOptions,
  ajustesHorarioOptions,
  ajustesTemaOptions,
} from "@/lib/query/options/ajustes";
import { hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import { buildDefaultLoadedGeneralSettings } from "@/lib/settings/general-settings";
import { THEME_PRESETS } from "@/lib/ui/themes";
import { SETTINGS, TEAM_ROWS, WEEK } from "@/tests/unit/fixtures/horario";

function expectNoClientCalls() {
  for (const fn of [...Object.values(pageData), ...Object.values(legacy)]) expect(fn).not.toHaveBeenCalled();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Ajustes org segments hydrate their page data (0 client calls on mount)", () => {
  it("General: the flags from the page, the settings from the root layout's seed", async () => {
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await server.prefetchQuery({
        ...ajustesGeneralOptions(),
        queryFn: async () => ({ canManage: true, canManageAppearance: true }),
      });
    });
    // `GeneralSettingsSeed` (root layout) puts the settings in the cache before the page renders.
    client.setQueryData(qk.org.general(), buildDefaultLoadedGeneralSettings());
    renderWithQueryClient(<AjustesGeneralClient />, { client, hydrate: state });

    expect(screen.getByRole("link", { name: "Abrir Tema y estilo →" })).toBeTruthy();
    expectNoClientCalls();
  });

  it("Tema: the published theme", async () => {
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await server.prefetchQuery({ ...ajustesTemaOptions(), queryFn: async () => ({ org: THEME_PRESETS.calido }) });
    });
    renderWithQueryClient(<ThemeEditor presets={THEME_PRESETS} />, { client, hydrate: state });

    const presets = screen.getByRole("radiogroup", { name: "Partir de un tema" });
    expect(within(presets).getByRole("radio", { name: /Cálido/ }).getAttribute("aria-checked")).toBe("true");
    expectNoClientCalls();
  });

  it("Horario: this week's settings and report", async () => {
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await server.prefetchQuery({
        ...ajustesHorarioOptions(WEEK),
        queryFn: async () => ({ settings: SETTINGS, rows: TEAM_ROWS, canManage: true, canViewReport: true }),
      });
    });
    renderWithQueryClient(
      <StyleProvider style="visual" scope="staff">
        <HorarioClient weekStart={WEEK} viewerName="Ana" />
      </StyleProvider>,
      { client, hydrate: state },
    );

    expect(screen.getByRole("region", { name: "Horas del equipo" })).toBeTruthy();
    expectNoClientCalls();
  });

  it("Google and primeros-pasos: mappings, puestos and Estado", async () => {
    const page = {
      mappings: [
        {
          id: "00000000-0000-4000-8000-0000000000a1",
          groupEmail: "cincel-direccion@example.test",
          kind: "role" as const,
          role: "Dirección",
          positionId: null,
          positionName: null,
          rank: 70,
          memberCount: 4,
          exists: true,
        },
      ],
      positions: [],
      health: null,
    };
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await server.prefetchQuery({ ...ajustesGoogleOptions(), queryFn: async () => page });
    });
    const { unmount } = renderWithQueryClient(<GoogleSettings />, { client, hydrate: state });
    expect(screen.getByText("cincel-direccion@example.test")).toBeTruthy();
    unmount();

    renderWithQueryClient(<GoogleSetupWizard />, { client, hydrate: state });
    expect(screen.getByText("No se pudo cargar el estado de Google. Recarga la página.")).toBeTruthy();
    expectNoClientCalls();
  });
});
