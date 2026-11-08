// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
}));

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

const workspace = vi.hoisted(() => ({ listGroupMappingsAction: vi.fn(), getGoogleHealthAction: vi.fn() }));
vi.mock("@/lib/actions/workspace-access-actions", () => workspace);
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
vi.mock("@/app/(staff)/ajustes/(admin)/tramos/TramosClient", () => ({ TramosClient: stand("TramosClient") }));
vi.mock("@/app/(staff)/ajustes/(admin)/puestos/PuestosClient", () => ({ PuestosClient: stand("PuestosClient") }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/settings-pattern-stand-ins"));

import MondayLayout from "../monday/layout";
import MondayPage from "../monday/page";
import GoogleLayout from "../google/layout";
import GooglePage from "../google/page";
import GoogleSetupPage from "../google/primeros-pasos/page";
import TramosLayout from "../tramos/layout";
import TramosPage from "../tramos/page";
import PuestosLayout from "../puestos/layout";
import PuestosPage from "../puestos/page";

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
  { name: "tramos", Page: TramosPage, Layout: TramosLayout },
  { name: "puestos", Page: PuestosPage, Layout: PuestosLayout },
];

async function renderPage(Page: Page) {
  render(await Page());
}

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
});

afterEach(() => cleanup());

describe("Ajustes admin segments: monday, Google, Tramos y fases, Puestos", () => {
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
        expect(workflows.fetchWorkflowsAction).not.toHaveBeenCalled();
      });

      it("sends a guest to /login", async () => {
        viewer.value = { status: "guest", user: null };
        await expect(Page()).rejects.toThrow("NEXT_REDIRECT:/login");
      });
    });
  }
});

describe("/ajustes/monday", () => {
  it("renders the unchanged wizard with the same data as today, between the last import and the history", async () => {
    await renderPage(MondayPage);
    expect(seen.props.MondayImportWizard).toEqual({
      initialRun: RUN,
      initialChoices: CHOICES,
      hasServerToken: true,
      loadError: null,
    });
    expect(monday.openMondayImportRunAction).toHaveBeenCalledWith(false);
    expect(screen.getByRole("region", { name: "Importar de monday" })).toBeTruthy();
    expect(screen.getByText("Trae tableros, grupos y personas de monday a Cincel.")).toBeTruthy();
    expect(seen.props.MondayLastImport).toEqual({ entry: ENTRY });
    expect(seen.props.MondayImportHistory).toEqual({ history: [ENTRY], error: null });

    const order = screen.getAllByTestId(/MondayLastImport|MondayImportWizard|MondayImportHistory/).map((el) => el.dataset.testid);
    expect(order).toEqual(["MondayLastImport", "MondayImportWizard", "MondayImportHistory"]);
  });

  it("shows only the wizard before any import", async () => {
    monday.getMondayImportHistoryAction.mockResolvedValue({ ok: true, history: [] });
    await renderPage(MondayPage);
    expect(screen.getByTestId("MondayImportWizard")).toBeTruthy();
    expect(screen.queryByTestId("MondayLastImport")).toBeNull();
    expect(screen.queryByTestId("MondayImportHistory")).toBeNull();
  });

  it("passes the load errors to the wizard like the legacy page", async () => {
    monday.openMondayImportRunAction.mockResolvedValue({ ok: false, error: "Sin acceso" });
    monday.getMondayImportChoicesAction.mockResolvedValue({ ok: false, error: "Otro" });
    await renderPage(MondayPage);
    expect(seen.props.MondayImportWizard).toMatchObject({ initialRun: null, initialChoices: null, loadError: "Sin acceso" });
  });

  it("keeps the wizard when the history fails and shows its error", async () => {
    monday.getMondayImportHistoryAction.mockRejectedValue(new Error("db"));
    await renderPage(MondayPage);
    expect(screen.getByTestId("MondayImportWizard")).toBeTruthy();
    expect(seen.props.MondayImportHistory).toEqual({
      history: [],
      error: "No se pudo cargar el historial de importaciones. Recarga la página.",
    });
  });

  it("sends the bootstrap admin to Permisos (rule unchanged)", async () => {
    viewer.value = BOOTSTRAP;
    await expect(MondayPage()).rejects.toThrow("NEXT_REDIRECT:/ajustes/permisos");
    expect(monday.openMondayImportRunAction).not.toHaveBeenCalled();
  });
});

describe("/ajustes/google", () => {
  it("passes the same mappings, positions and health as the legacy page", async () => {
    await renderPage(GooglePage);
    expect(seen.props.GoogleSettings).toEqual({
      mappings: [{ id: "m-1" }],
      positions: [
        { id: "p-1", name: "Diseño" },
        { id: "p-3", name: "Google" },
      ],
      health: { sharedDriveId: "drive" },
    });
  });

  it("renders with a null health when the health query fails", async () => {
    workspace.getGoogleHealthAction.mockRejectedValue(new Error("down"));
    await renderPage(GooglePage);
    expect(seen.props.GoogleSettings).toMatchObject({ health: null });
  });
});

describe("/ajustes/google/primeros-pasos", () => {
  it("renders the unchanged wizard for the bootstrap admin", async () => {
    viewer.value = BOOTSTRAP;
    await renderPage(GoogleSetupPage);
    expect(seen.props.GoogleSetupWizard).toMatchObject({ mappings: [{ id: "m-1" }], health: { sharedDriveId: "drive" } });
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

describe("/ajustes/tramos and /ajustes/puestos", () => {
  it("render Project Flow's pages with the same data", async () => {
    await renderPage(TramosPage);
    expect(workflows.fetchWorkflowsAction).toHaveBeenCalledWith({
      includeInactive: true,
      includeInactiveTemplates: true,
      includeInactivePhases: true,
    });
    expect(seen.props.TramosClient).toEqual({ initialWorkflows: [{ id: "w-1" }] });

    cleanup();
    await renderPage(PuestosPage);
    expect(seen.props.PuestosClient).toEqual({
      initialPositions: [
        { id: "p-1", name: "Diseño", active: true, googleManaged: false },
        { id: "p-2", name: "Antiguo", active: false, googleManaged: false },
        { id: "p-3", name: "Google", active: false, googleManaged: true },
      ],
      initialWorkflows: [{ id: "w-1" }],
    });
  });

  it("fall back to empty data so the clients hydrate themselves", async () => {
    workflows.fetchWorkflowsAction.mockRejectedValue(new Error("FORBIDDEN"));
    await renderPage(TramosPage);
    expect(seen.props.TramosClient).toEqual({ initialWorkflows: [] });
  });
});
