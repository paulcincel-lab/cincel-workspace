// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn((err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_")) throw err;
  }),
}));
vi.mock("next/navigation", () => navigation);

type Viewer = { status: string; user: { id: string; email: string | null; access: string } | null };
const viewer = vi.hoisted(() => ({
  value: { status: "active", user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" } } as Viewer,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: vi.fn(async () => viewer.value),
  requirePageCapability: vi.fn(async (cap: (user: { access: string }) => boolean) => {
    const user = viewer.value.user;
    if (viewer.value.status !== "active" || !user || !cap({ access: user.access })) navigation.notFound();
    return user;
  }),
  requireCapabilityUser: vi.fn(async () => {
    const user = viewer.value.user;
    if (viewer.value.status !== "active" || !user) throw new Error("FORBIDDEN");
    return { member: { id: user.id }, email: user.email, access: user.access };
  }),
}));
/** The Etapas and Puestos loaders (Query Migration 9b): the pages prefetch with them. */
const catalogLoaders = vi.hoisted(() => ({
  loadAjustesEstatus: vi.fn(),
  loadAjustesPermisos: vi.fn(),
  loadAjustesPuestos: vi.fn(),
  loadAjustesEtapas: vi.fn(),
}));
vi.mock("@/lib/loaders/ajustes-catalogs", () => catalogLoaders);

const bootstrap = vi.hoisted(() => ({ email: "bootstrap@cincel.mx" }));
vi.mock("@/lib/onboarding/first-login", () => ({
  isBootstrapAdminEmail: (email: string | null | undefined) => email === bootstrap.email,
}));

const monday = vi.hoisted(() => ({
  getMondayImportStatusAction: vi.fn(),
  openMondayImportRunAction: vi.fn(),
  getMondayImportChoicesAction: vi.fn(),
  getMondayImportHistoryAction: vi.fn(),
}));
vi.mock("@/lib/actions/monday-import-actions", () => monday);
const mondayLoader = vi.hoisted(() => ({ loadAjustesMonday: vi.fn() }));
vi.mock("@/lib/loaders/ajustes-monday", () => mondayLoader);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesMondayPageData: vi.fn() }));

const workspace = vi.hoisted(() => ({ listGroupMappingsAction: vi.fn(), getGoogleHealthAction: vi.fn() }));
vi.mock("@/lib/actions/workspace-access-actions", () => workspace);
/** What the Google loader (`loadAjustesGoogle`) reads, in one `Promise.all`. */
const googleReads = vi.hoisted(() => ({ listGroupMappings: vi.fn(), listPositions: vi.fn(), loadGoogleHealth: vi.fn() }));
vi.mock("@/lib/repositories/workspace-group-mappings-repository", () => ({
  listGroupMappings: googleReads.listGroupMappings,
}));
vi.mock("@/lib/repositories/positions-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/positions-repository")>()),
  listPositions: googleReads.listPositions,
}));
vi.mock("@/lib/auth/google-health", () => ({ loadGoogleHealth: googleReads.loadGoogleHealth }));
// No Directory in these tests: the mappings come back as listed.
vi.mock("@/lib/google/group-stats", () => ({ withGroupStats: async (rows: unknown[]) => rows }));
const positions = vi.hoisted(() => ({ fetchPositionsAction: vi.fn() }));
vi.mock("@/lib/actions/positions-actions", () => positions);
const workflows = vi.hoisted(() => ({ fetchWorkflowsAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => workflows);

const seen = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
function stand(name: string) {
  function Stand(props: Record<string, unknown>) {
    seen.props[name] = props;
    return <div data-testid={name} />;
  }
  Stand.displayName = name;
  return Stand;
}
vi.mock("@/components/configuracion/monday-import/MondayImportWizard", () => ({
  MondayImportWizard: stand("MondayImportWizard"),
}));
vi.mock("@/components/ajustes/MondayImportSections", () => ({
  MondayLastImport: stand("MondayLastImport"),
  MondayImportHistory: stand("MondayImportHistory"),
}));
vi.mock("@/components/ajustes/GoogleSettings", () => ({ GoogleSettings: stand("GoogleSettings") }));
vi.mock("@/components/configuracion/GoogleSetupWizard", () => ({ GoogleSetupWizard: stand("GoogleSetupWizard") }));
vi.mock("@/app/(staff)/ajustes/(admin)/etapas/EtapasClient", () => ({ EtapasClient: stand("EtapasClient") }));
vi.mock("@/app/(staff)/ajustes/(admin)/puestos/PuestosClient", () => ({ PuestosClient: stand("PuestosClient") }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import MondayLayout from "../monday/layout";
import MondayPage from "../monday/page";
import GoogleLayout from "../google/layout";
import GooglePage from "../google/page";
import GoogleSetupPage from "../google/primeros-pasos/page";
import EtapasLayout from "../etapas/layout";
import EtapasPage from "../etapas/page";
import PuestosLayout from "../puestos/layout";
import PuestosPage from "../puestos/page";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { qk } from "@/lib/query/keys";

const ADMIN: Viewer = { status: "active", user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" } };
const BOOTSTRAP: Viewer = { status: "active", user: { id: "boot", email: "bootstrap@cincel.mx", access: "Administrador" } };
const DIRECCION: Viewer = { status: "active", user: { id: "dir", email: "dir@cincel.mx", access: "Dirección" } };
const COLABORADOR: Viewer = { status: "active", user: { id: "col", email: "col@cincel.mx", access: "Colaborador" } };

const RUN = { runId: "run-1", step: "conectar" };
const CHOICES = { statuses: [] };
const ENTRY = { batchId: "b-1", status: "applied", appliedAt: "2026-11-03T18:00:00.000Z" };

type Page = () => Promise<ReactElement>;
type Layout = (props: { children: ReactNode }) => Promise<ReactNode>;

const PAGES: { name: string; Page: Page; Layout: Layout }[] = [
  { name: "monday", Page: MondayPage, Layout: MondayLayout },
  { name: "google", Page: GooglePage, Layout: GoogleLayout },
  { name: "etapas", Page: EtapasPage, Layout: EtapasLayout },
  { name: "puestos", Page: PuestosPage, Layout: PuestosLayout },
];

beforeEach(() => {
  vi.clearAllMocks();
  seen.props = {};
  viewer.value = ADMIN;
  monday.getMondayImportStatusAction.mockResolvedValue({ ok: true, hasServerToken: true, hasAppliedImport: true, run: null });
  monday.openMondayImportRunAction.mockResolvedValue({ ok: true, run: RUN });
  monday.getMondayImportChoicesAction.mockResolvedValue({ ok: true, choices: CHOICES });
  monday.getMondayImportHistoryAction.mockResolvedValue({ ok: true, history: [ENTRY] });
  workspace.listGroupMappingsAction.mockResolvedValue([{ id: "m-1" }]);
  workspace.getGoogleHealthAction.mockResolvedValue({ sharedDriveId: "drive" });
  positions.fetchPositionsAction.mockResolvedValue([
    { id: "p-1", name: "Diseño", active: true, googleManaged: false },
    { id: "p-2", name: "Antiguo", active: false, googleManaged: false },
    { id: "p-3", name: "Google", active: false, googleManaged: true },
  ]);
  workflows.fetchWorkflowsAction.mockResolvedValue([{ id: "w-1" }]);
  // The same puestos for every loader that reads the repository directly.
  googleReads.listPositions.mockResolvedValue([
    { id: "p-1", name: "Diseño", active: true, googleManaged: false },
    { id: "p-2", name: "Antiguo", active: false, googleManaged: false },
    { id: "p-3", name: "Google", active: false, googleManaged: true },
  ]);
});

afterEach(() => cleanup());

describe("Ajustes admin segments: monday, Google, Etapas y fases, Puestos", () => {
  for (const { name, Page, Layout } of PAGES) {
    describe(name, () => {
      it("the segment layout 404s for anyone but an Administrador", async () => {
        for (const other of [DIRECCION, COLABORADOR]) {
          viewer.value = other;
          await expect(Layout({ children: <p>contenido</p> })).rejects.toThrow("NEXT_NOT_FOUND");
        }
        viewer.value = ADMIN;
        expect(await Layout({ children: <p>contenido</p> })).toBeTruthy();
      });

      it("the page 404s for anyone but an Administrador, before loading data", async () => {
        for (const other of [DIRECCION, COLABORADOR]) {
          viewer.value = other;
          await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
        }
        expect(monday.getMondayImportHistoryAction).not.toHaveBeenCalled();
        expect(workspace.listGroupMappingsAction).not.toHaveBeenCalled();
        expect(googleReads.listGroupMappings).not.toHaveBeenCalled();
        expect(googleReads.loadGoogleHealth).not.toHaveBeenCalled();
        expect(workflows.fetchWorkflowsAction).not.toHaveBeenCalled();
        expect(catalogLoaders.loadAjustesEtapas).not.toHaveBeenCalled();
        expect(catalogLoaders.loadAjustesPuestos).not.toHaveBeenCalled();
      });

      it("sends a guest to /login", async () => {
        viewer.value = { status: "guest", user: null };
        await expect(Page()).rejects.toThrow("NEXT_REDIRECT:/login");
      });
    });
  }
});

describe("/ajustes/monday", () => {
  const RUN_STATE = { runId: "run-1", step: "conectar", jobs: {} };
  const pageData = (patch: Record<string, unknown> = {}) => ({
    status: { hasServerToken: true },
    run: RUN_STATE,
    choices: CHOICES,
    history: [ENTRY],
    errors: { load: null, history: null },
    ...patch,
  });

  async function renderMondayPage() {
    renderWithQueryClient(await MondayPage());
  }

  beforeEach(() => {
    mondayLoader.loadAjustesMonday.mockResolvedValue(pageData());
  });

  it("reads the page data through the loader and opens no run (GET writes nothing)", async () => {
    await renderMondayPage();
    expect(mondayLoader.loadAjustesMonday).toHaveBeenCalledTimes(1);
    expect(mondayLoader.loadAjustesMonday).toHaveBeenCalledWith(expect.objectContaining({ id: "admin" }));
    expect(monday.openMondayImportRunAction).not.toHaveBeenCalled();
    expect(seen.props.MondayImportWizard).toEqual({ latestRun: RUN_STATE, hasServerToken: true, loadError: null });
    expect(screen.getByRole("region", { name: "Importar de monday" })).toBeTruthy();
    expect(screen.getByText("Trae tableros, grupos y personas de monday a Cincel.")).toBeTruthy();
    expect(seen.props.MondayLastImport).toEqual({ entry: ENTRY });
    expect(seen.props.MondayImportHistory).toEqual({ history: [ENTRY], error: null });

    const order = screen.getAllByTestId(/MondayLastImport|MondayImportWizard|MondayImportHistory/).map((el) => el.dataset.testid);
    expect(order).toEqual(["MondayLastImport", "MondayImportWizard", "MondayImportHistory"]);
  });

  it("shows only the wizard before any import", async () => {
    mondayLoader.loadAjustesMonday.mockResolvedValue(pageData({ run: null, history: [] }));
    await renderMondayPage();
    expect(seen.props.MondayImportWizard).toMatchObject({ latestRun: null });
    expect(screen.queryByTestId("MondayLastImport")).toBeNull();
    expect(screen.queryByTestId("MondayImportHistory")).toBeNull();
  });

  it("passes the load error to the wizard", async () => {
    mondayLoader.loadAjustesMonday.mockResolvedValue(
      pageData({ run: null, choices: null, errors: { load: "Sin acceso", history: null } }),
    );
    await renderMondayPage();
    expect(seen.props.MondayImportWizard).toMatchObject({ latestRun: null, loadError: "Sin acceso" });
  });

  it("keeps the wizard when the history fails and shows its error", async () => {
    const error = "No se pudo cargar el historial de importaciones. Recarga la página.";
    mondayLoader.loadAjustesMonday.mockResolvedValue(pageData({ history: [], errors: { load: null, history: error } }));
    await renderMondayPage();
    expect(screen.getByTestId("MondayImportWizard")).toBeTruthy();
    expect(seen.props.MondayImportHistory).toEqual({ history: [], error });
  });

  it("sends the bootstrap admin to Permisos (rule unchanged)", async () => {
    viewer.value = BOOTSTRAP;
    await expect(MondayPage()).rejects.toThrow("NEXT_REDIRECT:/ajustes/permisos");
    expect(mondayLoader.loadAjustesMonday).not.toHaveBeenCalled();
    expect(monday.openMondayImportRunAction).not.toHaveBeenCalled();
  });
});

describe("/ajustes/google", () => {
  const HEALTH = {
    workspaceDomain: "cincel.mx",
    oauthClientConfigured: true,
    groupMappingCount: 1,
    roleGroupMappingCount: 1,
    serviceAccountEmail: "cincel@proyecto.iam.gserviceaccount.com",
    sharedDriveId: "drive",
    tokenKeyConfigured: true,
    lastDirectoryError: null,
    lastDriveError: null,
    googleLinkedStaff: 4,
    activeStaff: 9,
    pendingGoogleStaff: [],
    projectsWithoutFolder: 0,
    projectsWithFolder: 0,
  };

  beforeEach(() => {
    googleReads.listGroupMappings.mockResolvedValue([{ id: "m-1" }]);
    googleReads.loadGoogleHealth.mockResolvedValue(HEALTH);
  });

  /** Renders the page under a client and returns what it hydrated into `qk.ajustes.page('google')`. */
  async function hydratedGooglePage(Page: Page) {
    const { client } = renderWithQueryClient(await Page());
    return client.getQueryData(qk.ajustes.page("google"));
  }

  it("hydrates the same mappings, positions and health as the legacy page, with no client call", async () => {
    expect(await hydratedGooglePage(GooglePage)).toEqual({
      mappings: [{ id: "m-1" }],
      positions: [
        { id: "p-1", name: "Diseño" },
        { id: "p-3", name: "Google" },
      ],
      health: HEALTH,
    });
    expect(screen.getByTestId("GoogleSettings")).toBeTruthy();
    expect(workspace.listGroupMappingsAction).not.toHaveBeenCalled();
    expect(workspace.getGoogleHealthAction).not.toHaveBeenCalled();
  });

  it("starts the three reads together: the health does not wait for the others", async () => {
    let releaseMappings: (rows: unknown[]) => void = () => {};
    googleReads.listGroupMappings.mockReturnValue(new Promise((resolve) => (releaseMappings = resolve)));
    const page = GooglePage();
    await vi.waitFor(() => expect(googleReads.loadGoogleHealth).toHaveBeenCalledTimes(1));
    expect(googleReads.listPositions).toHaveBeenCalledTimes(1);
    releaseMappings([{ id: "m-1" }]);
    renderWithQueryClient(await page);
  });

  it("hydrates a null health when the health read fails", async () => {
    googleReads.loadGoogleHealth.mockRejectedValue(new Error("down"));
    expect(await hydratedGooglePage(GooglePage)).toMatchObject({ health: null, mappings: [{ id: "m-1" }] });
  });

  it("sends only the Estado fields (nothing else the health read carries)", async () => {
    googleReads.loadGoogleHealth.mockResolvedValue({ ...HEALTH, oauthClientSecret: "secret", tokenKey: "key" });
    const data = (await hydratedGooglePage(GooglePage)) as { health: Record<string, unknown> };
    expect(Object.keys(data.health).sort()).toEqual(Object.keys(HEALTH).sort());
  });
});

describe("/ajustes/google/primeros-pasos", () => {
  beforeEach(() => {
    googleReads.listGroupMappings.mockResolvedValue([{ id: "m-1" }]);
    googleReads.listPositions.mockResolvedValue([]);
    googleReads.loadGoogleHealth.mockResolvedValue({
      sharedDriveId: "drive",
      pendingGoogleStaff: [],
      projectsWithoutFolder: 0,
      projectsWithFolder: 0,
    });
  });

  it("renders the unchanged wizard for the bootstrap admin, with the Google page data hydrated", async () => {
    viewer.value = BOOTSTRAP;
    const { client } = renderWithQueryClient(await GoogleSetupPage());
    expect(screen.getByTestId("GoogleSetupWizard")).toBeTruthy();
    expect(client.getQueryData(qk.ajustes.page("google"))).toMatchObject({
      mappings: [{ id: "m-1" }],
      health: { sharedDriveId: "drive" },
    });
  });

  it("sends any other admin to Ajustes › Google", async () => {
    await expect(GoogleSetupPage()).rejects.toThrow(
      "NEXT_REDIRECT:/ajustes/google",
    );
  });

  it("404s for anyone but an Administrador", async () => {
    viewer.value = COLABORADOR;
    await expect(GoogleSetupPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("/ajustes/etapas and /ajustes/puestos", () => {
  it("prefetch their page data for the viewer and hydrate it (the clients take no props)", async () => {
    const etapas = { workflows: [{ id: "w-1", key: "diseno", name: "Diseño", sortOrder: 1, active: true }] };
    catalogLoaders.loadAjustesEtapas.mockResolvedValue(etapas);
    const etapasPage = await EtapasPage();
    renderWithQueryClient(etapasPage);
    expect(catalogLoaders.loadAjustesEtapas).toHaveBeenCalledWith(expect.objectContaining({ access: "Administrador" }));
    expect(seen.props.EtapasClient).toEqual({});
    const etapasQc = (etapasPage.props as { qc: import("@tanstack/react-query").QueryClient }).qc;
    expect(etapasQc.getQueryData(qk.ajustes.page("etapas"))).toEqual(etapas);
    expect(etapasQc.getQueryData(qk.catalog.workflows())).toEqual([
      { id: "w-1", key: "diseno", name: "Diseño", sortOrder: 1 },
    ]);
    expect(workflows.fetchWorkflowsAction).not.toHaveBeenCalled();

    cleanup();
    const puestos = { positions: [{ id: "p-1", name: "Diseño", active: true, googleManaged: false }], workflows: [] };
    catalogLoaders.loadAjustesPuestos.mockResolvedValue(puestos);
    const puestosPage = await PuestosPage();
    renderWithQueryClient(puestosPage);
    expect(seen.props.PuestosClient).toEqual({});
    const puestosQc = (puestosPage.props as { qc: import("@tanstack/react-query").QueryClient }).qc;
    expect(puestosQc.getQueryData(qk.ajustes.page("puestos"))).toEqual(puestos);
    expect(positions.fetchPositionsAction).not.toHaveBeenCalled();
  });

  it("still render when the loader fails (the client query then loads or shows the error)", async () => {
    catalogLoaders.loadAjustesEtapas.mockRejectedValue(new Error("FORBIDDEN"));
    const page = await EtapasPage();
    const qc = (page.props as { qc: import("@tanstack/react-query").QueryClient }).qc;
    expect(qc.getQueryData(qk.ajustes.page("etapas"))).toBeUndefined();
  });
});
