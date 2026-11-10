// @vitest-environment node
/**
 * Old routes (FE §2.2, §2.3): `proxy.ts` redirects every old staff URL to
 * its new route before anything renders (no `(staff)` layout, no stub
 * page), the query preserved. `/` keeps its own redirect page.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { proxy } from "@/proxy";

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

type Query = Record<string, string>;

type LegacyCase = {
  /** The old path. */
  name: string;
  query?: Query;
  /** Target (FE §2.2). */
  on: string;
};

const CASES: LegacyCase[] = [
  { name: "/dashboard", query: { tab: "kpis" }, on: "/inicio?tab=kpis" },
  { name: "/tablero", query: { proyecto: "p1" }, on: "/tareas?estilo=visual&proyecto=p1" },
  { name: "/mis-tareas", on: "/tareas?estilo=analitico&responsable=yo" },
  { name: "/calendario", query: { fecha: "2026-11-07" }, on: "/tareas" },
  { name: "/actividades/general", on: "/tareas?estilo=analitico" },
  {
    name: "/actividades/presale",
    on: "/tareas?estilo=analitico&tramo=presale",
  },
  {
    name: "/actividades/presale?project=X",
    query: { project: "X" },
    on: "/tareas?estilo=analitico&tramo=presale&project=X&iniciar=1",
  },
  // The old Tareas view switch: Tablero is Visual, Lista Analítico, Calendario the page without the param.
  { name: "/tareas?vista=tablero", query: { vista: "tablero", tramo: "diseno" }, on: "/tareas?estilo=visual&tramo=diseno" },
  { name: "/tareas?vista=lista", query: { vista: "lista", responsable: "yo" }, on: "/tareas?estilo=analitico&responsable=yo" },
  { name: "/tareas?vista=calendario", query: { vista: "calendario", cal: "semana", fecha: "2026-11-07" }, on: "/tareas" },
  { name: "/equipo", on: "/personas" },
  { name: "/directorio", query: { q: "ana" }, on: "/personas/clientes?q=ana" },
  { name: "/clientes", on: "/personas/clientes" },
  { name: "/contratistas", on: "/personas/contratistas" },
  { name: "/proveedores/colaboradores", on: "/personas/proveedores" },
  {
    name: "/proveedores/contratistas",
    on: "/personas/proveedores",
  },
  { name: "/proveedores/tiendas", on: "/personas/proveedores" },
  { name: "/recursos", on: "/biblioteca" },
  {
    name: "/recursos/formacion",
    query: { carpeta: "c1" },
    on: "/biblioteca/formacion?carpeta=c1",
  },
  {
    name: "/recursos/mis-vacaciones",
    on: "/biblioteca/vacaciones",
  },
  { name: "/recursos/empresa", on: "/biblioteca" },
  { name: "/recursos/empresa/book", on: "/biblioteca/empresa/book" },
  {
    name: "/recursos/empresa/imagen-de-la-empresa",
    on: "/biblioteca/empresa/imagen-de-la-empresa",
  },
  {
    name: "/recursos/empresa/manual-de-la-empresa",
    on: "/biblioteca/empresa/manual-de-la-empresa",
  },
  {
    name: "/recursos/empresa/politicas-de-la-empresa",
    on: "/biblioteca/empresa/politicas-de-la-empresa",
  },
  { name: "/recursos/empresa/rfc", on: "/biblioteca/empresa/rfc" },
  { name: "/profile", on: "/ajustes/perfil" },
  { name: "/configuracion", on: "/ajustes/apariencia" },
  { name: "/configuracion/areas", on: "/ajustes/puestos" },
  { name: "/configuracion/estatus", on: "/ajustes/estatus" },
  { name: "/configuracion/general", on: "/ajustes/general" },
  { name: "/configuracion/google", on: "/ajustes/google" },
  {
    name: "/configuracion/google/primeros-pasos",
    on: "/ajustes/google/primeros-pasos",
  },
  { name: "/configuracion/importar-monday", on: "/ajustes/monday" },
  { name: "/configuracion/permisos", on: "/ajustes/permisos" },
  { name: "/configuracion/puestos", on: "/ajustes/puestos" },
  { name: "/configuracion/tramos", on: "/ajustes/tramos" },
  {
    name: "/configuracion/workflows",
    on: "/ajustes/tramos",
  },
];

function location(path: string, query: Query = {}): string | null {
  const url = new URL(path, "http://localhost:3000");
  for (const [key, value] of Object.entries(query)) url.searchParams.append(key, value);
  const headers = new Headers({ cookie: `${SESSION_COOKIE}=token` });
  const response = proxy(new NextRequest(url, { headers }));
  const target = response.headers.get("location");
  if (!target) return null;
  const parsed = new URL(target);
  return `${parsed.pathname}${parsed.search}`;
}

beforeEach(() => {
  navigation.redirect.mockClear();
  navigation.notFound.mockClear();
});

describe("old routes redirect in the proxy", () => {
  it.each(CASES.map((legacy) => [legacy.name, legacy] as const))("%s redirects to its new route", (_name, legacy) => {
    const path = legacy.name.split("?")[0];
    expect(location(path, legacy.query)).toBe(legacy.on);
  });

  it("keeps the trailing-slash form and leaves new routes alone", () => {
    expect(location("/dashboard/")).toBe("/inicio");
    expect(location("/inicio")).toBeNull();
    expect(location("/tareas")).toBeNull();
    expect(location("/tareas", { estilo: "visual" })).toBeNull();
    expect(location("/ajustes/apariencia")).toBeNull();
  });

  it("does not redirect deeper paths the table does not know", () => {
    expect(location("/configuracion/google/otra")).toBeNull();
    expect(location("/recursos/formacion/uno")).toBeNull();
  });

  it("sends a guest to /login first", () => {
    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });
});

describe("/ keeps its page", () => {
  it("the proxy lets / through and the page redirects to /inicio", async () => {
    expect(location("/")).toBeNull();
    await expect(RootPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/inicio");
    expect(navigation.redirect).toHaveBeenCalledWith("/inicio");
  });
});
