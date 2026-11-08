/**
 * Old route stubs (FE §2.2, §2.3): every old page is a plain server-side
 * redirect to its new route, the query preserved, for every user.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => navigation);

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
  /** Target (FE §2.2). */
  on: string;
};

const CASES: StubCase[] = [
  { name: "/", page: RootPage, on: "/inicio" },
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
  { name: "/clientes", page: ClientesPage, on: "/personas/clientes" },
  { name: "/contratistas", page: ContratistasPage, on: "/personas/contratistas" },
  { name: "/proveedores/colaboradores", page: ColaboradoresPage, on: "/personas/proveedores" },
  {
    name: "/proveedores/contratistas",
    page: ProveedoresContratistasPage,
    on: "/personas/proveedores",
  },
  { name: "/proveedores/tiendas", page: TiendasPage, on: "/personas/proveedores" },
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
  { name: "/configuracion", page: ConfiguracionPage, on: "/ajustes/apariencia" },
  { name: "/configuracion/areas", page: ConfiguracionAreasPage, on: "/ajustes/puestos" },
  { name: "/configuracion/estatus", page: ConfiguracionEstatusPage, on: "/ajustes/estatus" },
  { name: "/configuracion/general", page: ConfiguracionGeneralPage, on: "/ajustes/general" },
  { name: "/configuracion/google", page: ConfiguracionGooglePage, on: "/ajustes/google" },
  {
    name: "/configuracion/google/primeros-pasos",
    page: GoogleSetupWizardPage,
    on: "/ajustes/google/primeros-pasos",
  },
  { name: "/configuracion/importar-monday", page: ImportarMondayPage, on: "/ajustes/monday" },
  { name: "/configuracion/permisos", page: ConfiguracionPermisosPage, on: "/ajustes/permisos" },
  { name: "/configuracion/puestos", page: ConfiguracionPuestosPage, on: "/ajustes/puestos" },
  { name: "/configuracion/tramos", page: ConfiguracionTramosPage, on: "/ajustes/tramos" },
  {
    name: "/configuracion/workflows",
    page: ConfiguracionWorkflowsPage,
    on: "/ajustes/tramos",
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
});

describe("old route stubs", () => {
  it.each(CASES.map((stub) => [stub.name, stub] as const))("%s redirects to its new route", async (_name, stub) => {
    await expect(run(stub)).rejects.toThrow(`NEXT_REDIRECT:${stub.on}`);
    expect(navigation.redirect).toHaveBeenCalledTimes(1);
    expect(navigation.redirect).toHaveBeenCalledWith(stub.on);
  });
});
