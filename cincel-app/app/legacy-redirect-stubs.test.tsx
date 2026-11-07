/**
 * Legacy route stubs (FE §2.2, §2.3): with the redesign flag on every legacy
 * page redirects server-side to its new route with the query preserved; with
 * it off the page renders (or keeps its legacy redirect) exactly as today.
 */
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ on: false }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const auth = vi.hoisted(() => ({
  getSessionAccess: vi.fn(async () => ({
    status: "active",
    user: { access: "Administrador", email: "admin@example.com" },
  })),
  isBootstrapAdminEmail: vi.fn(() => false),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({
    theme: "azul",
    mode: "system",
    style: "esencial",
    density: "comoda",
    textSize: 14,
    redesignEnabled: flag.on,
    cssVars: { light: {}, dark: {} },
    version: 1,
  })),
}));

// Hoisted with the mocks: every data call fails like a missing session (the pages catch it) and every view is empty.
const { unavailable, Stub } = vi.hoisted(() => ({
  unavailable: () => vi.fn(async () => Promise.reject(new Error("UNAUTHENTICATED"))),
  Stub: () => null,
}));

vi.mock("@/components/layout/Sidebar", () => ({ default: Stub }));
vi.mock("@/components/layout/Header", () => ({ default: Stub }));
vi.mock("@/components/calendario/CalendarWorkspace", () => ({ default: Stub }));
vi.mock("@/components/recursos/ResourcesWorkspaceServer", () => ({ default: Stub }));
vi.mock("@/components/configuracion/GoogleSetupBanner", () => ({ GoogleSetupBanner: Stub }));
vi.mock("@/components/configuracion/GoogleSetupWizard", () => ({ GoogleSetupWizard: Stub }));
vi.mock("@/components/configuracion/GoogleWorkspaceSettings", () => ({ GoogleWorkspaceSettings: Stub }));
vi.mock("@/components/configuracion/GeneralSettingsWorkspace", () => ({ default: Stub }));
vi.mock("@/components/configuracion/PermissionsWorkspace", () => ({ default: Stub }));
vi.mock("@/components/configuracion/monday-import/MondayImportWizard", () => ({ MondayImportWizard: Stub }));
vi.mock("@/components/shell/RedesignOptIn", () => ({ RedesignOptInBanner: Stub, RedesignOptInEntry: Stub }));
vi.mock("@/lib/actions/org-appearance-actions", () => ({ fetchOrgAppearanceAction: unavailable() }));
vi.mock("./(staff)/dashboard/DashboardClient", () => ({ DashboardClient: Stub }));
vi.mock("./(staff)/tablero/TableroClient", () => ({ TableroClient: Stub }));
vi.mock("./(staff)/mis-tareas/MisTareasClient", () => ({ MisTareasClient: Stub }));
vi.mock("./(staff)/equipo/EquipoClient", () => ({ EquipoClient: Stub }));
vi.mock("./(staff)/directorio/DirectorioClient", () => ({ DirectorioClient: Stub }));
vi.mock("./(staff)/actividades/[tramo]/ActividadesClient", () => ({ ActividadesClient: Stub }));
vi.mock("./(staff)/profile/ProfileClient", () => ({ default: Stub }));
vi.mock("./(staff)/configuracion/estatus/EstatusClient", () => ({ EstatusClient: Stub }));
vi.mock("./(staff)/configuracion/puestos/PuestosClient", () => ({ PuestosClient: Stub }));
vi.mock("./(staff)/configuracion/tramos/TramosClient", () => ({ TramosClient: Stub }));

vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectsAction: unavailable() }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchBoardAction: unavailable(),
  fetchMyTasksAction: unavailable(),
  fetchTasksAction: unavailable(),
  fetchAdminTasksAction: unavailable(),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ fetchTaskStatusesAction: unavailable() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: unavailable() }));
vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffAction: unavailable(),
  fetchAssignableStaffAction: unavailable(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => ({ fetchTramoBoardAction: unavailable() }));
vi.mock("@/lib/actions/contacts-actions", () => ({ fetchContactsAction: unavailable() }));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: unavailable() }));
vi.mock("@/lib/actions/workspace-access-actions", () => ({
  getGoogleHealthAction: unavailable(),
  listGroupMappingsAction: unavailable(),
}));
vi.mock("@/lib/actions/app-settings-actions", () => ({
  fetchAppearanceAction: unavailable(),
  fetchGeneralSettingsAction: unavailable(),
}));
vi.mock("@/lib/actions/monday-import-actions", () => ({
  getMondayImportChoicesAction: unavailable(),
  getMondayImportStatusAction: unavailable(),
  openMondayImportRunAction: unavailable(),
}));
vi.mock("@/lib/settings/general-settings", () => ({ buildDefaultLoadedGeneralSettings: () => ({}) }));
vi.mock("@/lib/auth/permissionsState", () => ({ buildDefaultPermissionsState: () => ({}) }));
vi.mock("@/lib/onboarding/first-login-server", () => ({ getFirstLoginState: unavailable() }));
vi.mock("@/lib/onboarding/first-login", () => ({ isBootstrapAdminEmail: auth.isBootstrapAdminEmail }));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: auth.getSessionAccess }));

import RootPage from "./page";
import DashboardPage from "./(staff)/dashboard/page";
import TableroPage from "./(staff)/tablero/page";
import MisTareasPage from "./(staff)/mis-tareas/page";
import CalendarioPage from "./(staff)/calendario/page";
import ActividadesPage from "./(staff)/actividades/[tramo]/page";
import EquipoPage from "./(staff)/equipo/page";
import DirectorioPage from "./(staff)/directorio/page";
import ClientesPage from "./(staff)/clientes/page";
import ContratistasPage from "./(staff)/contratistas/page";
import ColaboradoresPage from "./(staff)/proveedores/colaboradores/page";
import ProveedoresContratistasPage from "./(staff)/proveedores/contratistas/page";
import TiendasPage from "./(staff)/proveedores/tiendas/page";
import RecursosPage from "./(staff)/recursos/page";
import RecursosSeccionPage from "./(staff)/recursos/[seccion]/page";
import RecursosEmpresaPage from "./(staff)/recursos/empresa/page";
import EmpresaBookPage from "./(staff)/recursos/empresa/book/page";
import EmpresaImagenPage from "./(staff)/recursos/empresa/imagen-de-la-empresa/page";
import EmpresaManualPage from "./(staff)/recursos/empresa/manual-de-la-empresa/page";
import EmpresaPoliticasPage from "./(staff)/recursos/empresa/politicas-de-la-empresa/page";
import EmpresaRFCPage from "./(staff)/recursos/empresa/rfc/page";
import ProfilePage from "./(staff)/profile/page";
import ConfiguracionPage from "./(staff)/configuracion/page";
import ConfiguracionAreasPage from "./(staff)/configuracion/areas/page";
import ConfiguracionEstatusPage from "./(staff)/configuracion/estatus/page";
import ConfiguracionGeneralPage from "./(staff)/configuracion/general/page";
import ConfiguracionGooglePage from "./(staff)/configuracion/google/page";
import GoogleSetupWizardPage from "./(staff)/configuracion/google/primeros-pasos/page";
import ImportarMondayPage from "./(staff)/configuracion/importar-monday/page";
import ConfiguracionPermisosPage from "./(staff)/configuracion/permisos/page";
import ConfiguracionPuestosPage from "./(staff)/configuracion/puestos/page";
import ConfiguracionTramosPage from "./(staff)/configuracion/tramos/page";
import ConfiguracionWorkflowsPage from "./(staff)/configuracion/workflows/page";

type Query = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Query>; params?: Promise<Record<string, string>> };
type Page = (props: never) => Promise<unknown>;

type StubCase = {
  name: string;
  page: Page;
  params?: Record<string, string>;
  query?: Query;
  /** Target with the flag on (FE §2.2). */
  on: string;
  /** Flag off: the legacy redirect it keeps, or undefined when it renders. */
  off?: string;
  setup?: () => void;
};

const CASES: StubCase[] = [
  { name: "/", page: RootPage, on: "/inicio", off: "/dashboard" },
  { name: "/dashboard", page: DashboardPage, query: { tab: "kpis" }, on: "/inicio?tab=kpis" },
  { name: "/tablero", page: TableroPage, query: { proyecto: "p1" }, on: "/tareas?vista=tablero&proyecto=p1" },
  { name: "/mis-tareas", page: MisTareasPage, on: "/tareas?vista=lista&responsable=yo" },
  { name: "/calendario", page: CalendarioPage, query: { fecha: "2026-11-07" }, on: "/tareas?vista=calendario&fecha=2026-11-07" },
  { name: "/actividades/general", page: ActividadesPage, params: { tramo: "general" }, on: "/tareas?vista=lista" },
  {
    name: "/actividades/presale",
    page: ActividadesPage,
    params: { tramo: "presale" },
    on: "/tareas?vista=lista&tramo=presale",
  },
  {
    name: "/actividades/presale?project=X",
    page: ActividadesPage,
    params: { tramo: "presale" },
    query: { project: "X" },
    on: "/tareas?vista=lista&tramo=presale&project=X&iniciar=1",
  },
  { name: "/equipo", page: EquipoPage, on: "/personas" },
  { name: "/directorio", page: DirectorioPage, query: { q: "ana" }, on: "/personas/clientes?q=ana" },
  { name: "/clientes", page: ClientesPage, on: "/personas/clientes", off: "/directorio" },
  { name: "/contratistas", page: ContratistasPage, on: "/personas/contratistas", off: "/directorio" },
  { name: "/proveedores/colaboradores", page: ColaboradoresPage, on: "/personas/proveedores", off: "/directorio" },
  {
    name: "/proveedores/contratistas",
    page: ProveedoresContratistasPage,
    on: "/personas/proveedores",
    off: "/directorio",
  },
  { name: "/proveedores/tiendas", page: TiendasPage, on: "/personas/proveedores", off: "/directorio" },
  { name: "/recursos", page: RecursosPage, on: "/biblioteca" },
  {
    name: "/recursos/formacion",
    page: RecursosSeccionPage,
    params: { seccion: "formacion" },
    query: { carpeta: "c1" },
    on: "/biblioteca/formacion?carpeta=c1",
  },
  {
    name: "/recursos/mis-vacaciones",
    page: RecursosSeccionPage,
    params: { seccion: "mis-vacaciones" },
    on: "/biblioteca/vacaciones",
  },
  { name: "/recursos/empresa", page: RecursosEmpresaPage, on: "/biblioteca" },
  { name: "/recursos/empresa/book", page: EmpresaBookPage, on: "/biblioteca/empresa/book" },
  {
    name: "/recursos/empresa/imagen-de-la-empresa",
    page: EmpresaImagenPage,
    on: "/biblioteca/empresa/imagen-de-la-empresa",
  },
  {
    name: "/recursos/empresa/manual-de-la-empresa",
    page: EmpresaManualPage,
    on: "/biblioteca/empresa/manual-de-la-empresa",
  },
  {
    name: "/recursos/empresa/politicas-de-la-empresa",
    page: EmpresaPoliticasPage,
    on: "/biblioteca/empresa/politicas-de-la-empresa",
  },
  { name: "/recursos/empresa/rfc", page: EmpresaRFCPage, on: "/biblioteca/empresa/rfc" },
  { name: "/profile", page: ProfilePage, on: "/ajustes/perfil" },
  { name: "/configuracion", page: ConfiguracionPage, on: "/ajustes/apariencia", off: "/configuracion/permisos" },
  { name: "/configuracion/areas", page: ConfiguracionAreasPage, on: "/ajustes/puestos", off: "/configuracion/puestos" },
  { name: "/configuracion/estatus", page: ConfiguracionEstatusPage, on: "/ajustes/estatus" },
  { name: "/configuracion/general", page: ConfiguracionGeneralPage, on: "/ajustes/general" },
  { name: "/configuracion/google", page: ConfiguracionGooglePage, on: "/ajustes/google" },
  {
    name: "/configuracion/google/primeros-pasos",
    page: GoogleSetupWizardPage,
    on: "/ajustes/google/primeros-pasos",
    setup: () => auth.isBootstrapAdminEmail.mockReturnValue(true),
  },
  { name: "/configuracion/importar-monday", page: ImportarMondayPage, on: "/ajustes/monday" },
  { name: "/configuracion/permisos", page: ConfiguracionPermisosPage, on: "/ajustes/permisos" },
  { name: "/configuracion/puestos", page: ConfiguracionPuestosPage, on: "/ajustes/puestos" },
  { name: "/configuracion/tramos", page: ConfiguracionTramosPage, on: "/ajustes/tramos" },
  {
    name: "/configuracion/workflows",
    page: ConfiguracionWorkflowsPage,
    on: "/ajustes/tramos",
    off: "/configuracion/tramos",
  },
];

function run(stub: StubCase): Promise<unknown> {
  const props: Props = { searchParams: Promise.resolve(stub.query ?? {}) };
  if (stub.params) props.params = Promise.resolve(stub.params);
  return (stub.page as unknown as (p: Props) => Promise<unknown>)(props);
}

beforeEach(() => {
  navigation.redirect.mockClear();
  navigation.notFound.mockClear();
  auth.isBootstrapAdminEmail.mockReset();
  auth.isBootstrapAdminEmail.mockReturnValue(false);
});

describe("legacy route stubs with the redesign flag on", () => {
  beforeEach(() => {
    flag.on = true;
  });

  it.each(CASES.map((stub) => [stub.name, stub] as const))("%s redirects to its new route", async (_name, stub) => {
    stub.setup?.();
    await expect(run(stub)).rejects.toThrow(`NEXT_REDIRECT:${stub.on}`);
    expect(navigation.redirect).toHaveBeenCalledTimes(1);
    expect(navigation.redirect).toHaveBeenCalledWith(stub.on);
  });
});

describe("legacy route stubs with the redesign flag off", () => {
  beforeEach(() => {
    flag.on = false;
  });

  it.each(CASES.map((stub) => [stub.name, stub] as const))("%s behaves as today", async (_name, stub) => {
    stub.setup?.();
    if (stub.off) {
      await expect(run(stub)).rejects.toThrow(`NEXT_REDIRECT:${stub.off}`);
      expect(navigation.redirect).toHaveBeenCalledTimes(1);
      expect(navigation.redirect).toHaveBeenCalledWith(stub.off);
      return;
    }
    const element = await run(stub);
    expect(isValidElement(element)).toBe(true);
    expect((element as ReactElement).type).toBeTruthy();
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("an unknown resource section still 404s", async () => {
    await expect(
      run({ name: "/recursos/otra", page: RecursosSeccionPage, params: { seccion: "otra" }, on: "" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});

describe("legacy route stubs when the appearance cannot be resolved", () => {
  it("count the flag as off and render as today", async () => {
    const { getResolvedAppearance } = await import("@/lib/ui/preferences-server");
    vi.mocked(getResolvedAppearance).mockRejectedValueOnce(new Error("db down"));
    const element = await run(CASES.find((stub) => stub.name === "/tablero")!);
    expect(isValidElement(element)).toBe(true);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});
