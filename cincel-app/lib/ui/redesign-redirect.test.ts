import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedAppearance } from "@/lib/types/redesign";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

const appearance = vi.hoisted(() => ({
  getResolvedAppearance: vi.fn<() => Promise<ResolvedAppearance>>(),
}));
vi.mock("@/lib/ui/preferences-server", () => appearance);

import { redirectIfRedesignOff } from "./redesign-redirect";
import { redesignRedirectTarget } from "./redesign-redirect-target";

function resolved(redesignEnabled: boolean): ResolvedAppearance {
  return {
    theme: "azul",
    mode: "system",
    style: "visual",
    density: "comoda",
    textSize: 14,
    redesignEnabled,
    cssVars: { light: {}, dark: {} },
    version: 1,
  };
}

type Row = { path: string; query?: Record<string, string>; legacy: string };

/** Every new-only route family of FE §2.3 and its legacy equivalent. */
const NEW_ONLY_ROUTES: Row[] = [
  { path: "/inicio", legacy: "/dashboard" },
  { path: "/mi-espacio", legacy: "/dashboard" },
  { path: "/mi-espacio", query: { nota: "n1" }, legacy: "/dashboard" },
  { path: "/tareas", legacy: "/tablero" },
  { path: "/tareas", query: { vista: "tablero" }, legacy: "/tablero" },
  { path: "/tareas", query: { vista: "calendario", cal: "semana" }, legacy: "/calendario" },
  { path: "/tareas", query: { vista: "lista" }, legacy: "/actividades/general" },
  { path: "/tareas", query: { vista: "lista", responsable: "yo" }, legacy: "/mis-tareas" },
  { path: "/tareas", query: { vista: "lista", tramo: "diseno" }, legacy: "/actividades/diseno" },
  { path: "/tareas", query: { tramo: "construccion" }, legacy: "/actividades/construccion" },
  {
    path: "/tareas",
    query: { vista: "lista", tramo: "diseno", project: "p1", iniciar: "1" },
    legacy: "/actividades/diseno?project=p1",
  },
  { path: "/tareas", query: { tarea: "t1" }, legacy: "/tablero" },
  { path: "/personas", legacy: "/equipo" },
  { path: "/personas/equipo/u1", legacy: "/equipo" },
  { path: "/personas/clientes", legacy: "/directorio" },
  { path: "/personas/contratistas", legacy: "/directorio" },
  { path: "/personas/proveedores", legacy: "/directorio" },
  { path: "/biblioteca", legacy: "/recursos" },
  { path: "/biblioteca/vacaciones", legacy: "/recursos/mis-vacaciones" },
  { path: "/biblioteca/formatos", legacy: "/recursos/formatos" },
  { path: "/biblioteca/empresa/book", legacy: "/recursos/empresa/book" },
  { path: "/ajustes", legacy: "/dashboard" },
  { path: "/ajustes/perfil", legacy: "/profile" },
  { path: "/ajustes/apariencia", legacy: "/dashboard" },
  { path: "/ajustes/notificaciones", legacy: "/dashboard" },
  { path: "/ajustes/integraciones", legacy: "/dashboard" },
  { path: "/ajustes/tema", legacy: "/dashboard" },
  { path: "/ajustes/horario", legacy: "/dashboard" },
  { path: "/ajustes/general", legacy: "/configuracion/general" },
  { path: "/ajustes/permisos", legacy: "/configuracion/permisos" },
  { path: "/ajustes/puestos", legacy: "/configuracion/puestos" },
  { path: "/ajustes/estatus", legacy: "/configuracion/estatus" },
  { path: "/ajustes/tramos", legacy: "/configuracion/tramos" },
  { path: "/ajustes/monday", legacy: "/configuracion/importar-monday" },
  { path: "/ajustes/google", legacy: "/configuracion/google" },
  { path: "/ajustes/google/primeros-pasos", legacy: "/configuracion/google/primeros-pasos" },
];

/** Routes that exist in both worlds, plus legacy routes: never redirected by this helper. */
const NEVER_REDIRECTED = [
  "/proyectos",
  "/proyectos/p1",
  "/proyectos/p1/tareas",
  "/asistente",
  "/dashboard",
  "/tablero",
  "/configuracion/general",
  "/login",
];

beforeEach(() => {
  navigation.redirect.mockClear();
  appearance.getResolvedAppearance.mockReset();
});

describe("redesignRedirectTarget", () => {
  it.each(NEW_ONLY_ROUTES)("maps $path $query to $legacy", ({ path, query, legacy }) => {
    expect(redesignRedirectTarget(path, query)).toBe(legacy);
  });

  it.each(NEVER_REDIRECTED)("returns null for %s", (path) => {
    expect(redesignRedirectTarget(path)).toBeNull();
  });

  it("accepts URLSearchParams, array values and a trailing slash", () => {
    expect(redesignRedirectTarget("/tareas/", new URLSearchParams("vista=calendario"))).toBe("/calendario");
    expect(redesignRedirectTarget("/tareas", { vista: ["lista", "tablero"], responsable: "yo" })).toBe("/mis-tareas");
  });

  it("returns null for a malformed path segment", () => {
    expect(redesignRedirectTarget("/biblioteca/%E0%A4%A")).toBeNull();
  });
});

describe("redirectIfRedesignOff", () => {
  describe("flag off", () => {
    beforeEach(() => appearance.getResolvedAppearance.mockResolvedValue(resolved(false)));

    it.each(NEW_ONLY_ROUTES)("redirects $path $query to $legacy", async ({ path, query, legacy }) => {
      await expect(redirectIfRedesignOff(path, query)).rejects.toThrow(`NEXT_REDIRECT:${legacy}`);
      expect(navigation.redirect).toHaveBeenLastCalledWith(legacy);
    });

    it("accepts the page's searchParams promise", async () => {
      await expect(redirectIfRedesignOff("/tareas", Promise.resolve({ vista: "calendario" }))).rejects.toThrow(
        "NEXT_REDIRECT:/calendario",
      );
    });

    it.each(NEVER_REDIRECTED)("never redirects %s", async (path) => {
      await expect(redirectIfRedesignOff(path)).resolves.toBeUndefined();
      expect(navigation.redirect).not.toHaveBeenCalled();
    });
  });

  describe("flag on", () => {
    beforeEach(() => appearance.getResolvedAppearance.mockResolvedValue(resolved(true)));

    it.each(NEW_ONLY_ROUTES)("renders $path $query normally", async ({ path, query }) => {
      await expect(redirectIfRedesignOff(path, query)).resolves.toBeUndefined();
      expect(navigation.redirect).not.toHaveBeenCalled();
    });

    it.each(NEVER_REDIRECTED)("never redirects %s", async (path) => {
      await expect(redirectIfRedesignOff(path)).resolves.toBeUndefined();
      expect(navigation.redirect).not.toHaveBeenCalled();
    });
  });

  it("treats an appearance read failure as flag off", async () => {
    appearance.getResolvedAppearance.mockRejectedValue(new Error("db down"));
    await expect(redirectIfRedesignOff("/inicio")).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("does not read the appearance for a route that never redirects", async () => {
    await expect(redirectIfRedesignOff("/asistente")).resolves.toBeUndefined();
    expect(appearance.getResolvedAppearance).not.toHaveBeenCalled();
  });
});
