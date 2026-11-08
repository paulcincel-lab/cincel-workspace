// @vitest-environment node
/**
 * The per-screen revalidation helpers (plan §2e, §4.4): each one calls
 * exactly the `revalidatePath` targets the actions called before Phase 1a,
 * live and redirect-only (⚠) alike, so moving them changed nothing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { revalidateAjustesScreen } from "@/lib/cache/screens/ajustes";
import { revalidateAsistenteScreen } from "@/lib/cache/screens/asistente";
import { revalidateBibliotecaScreen, revalidateVacacionesScreen } from "@/lib/cache/screens/biblioteca";
import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";
import { revalidateMiEspacioScreen } from "@/lib/cache/screens/mi-espacio";
import { revalidatePersonasScreen } from "@/lib/cache/screens/personas";
import {
  revalidateProyectoClientesScreen,
  revalidateProyectoCronogramaScreen,
  revalidateProyectoFichaScreen,
  revalidateProyectosListScreen,
} from "@/lib/cache/screens/proyectos";
import { revalidateTareasScreen } from "@/lib/cache/screens/tareas";

const calls = () => revalidatePath.mock.calls;

beforeEach(() => revalidatePath.mockReset());

describe("screen revalidation helpers: the full screen", () => {
  it.each([
    [
      "revalidateTareasScreen()",
      () => revalidateTareasScreen(),
      [["/tareas"], ["/tablero"], ["/calendario"], ["/mis-tareas"], ["/actividades", "layout"]],
    ],
    ["revalidateInicioScreen()", () => revalidateInicioScreen(), [["/dashboard"]]],
    ["revalidateProyectosListScreen()", () => revalidateProyectosListScreen(), [["/proyectos"], ["/proyectos", "layout"]]],
    [
      "revalidateProyectoFichaScreen(id)",
      () => revalidateProyectoFichaScreen("p1"),
      [["/proyectos/p1/ficha"], ["/proyectos/p1", "layout"]],
    ],
    ["revalidateProyectoCronogramaScreen(id)", () => revalidateProyectoCronogramaScreen("p1"), [["/proyectos/p1/cronograma"]]],
    ["revalidateProyectoClientesScreen()", () => revalidateProyectoClientesScreen(), [["/proyectos/[id]/clientes", "page"]]],
    ["revalidateMiEspacioScreen()", () => revalidateMiEspacioScreen(), [["/mi-espacio"], ["/mi-espacio", "layout"]]],
    ["revalidatePersonasScreen()", () => revalidatePersonasScreen(), [["/personas"], ["/equipo"], ["/directorio"]]],
    ["revalidateVacacionesScreen()", () => revalidateVacacionesScreen(), [["/biblioteca/vacaciones"]]],
    ["revalidateBibliotecaScreen()", () => revalidateBibliotecaScreen(), [["/recursos"]]],
    ["revalidateAsistenteScreen()", () => revalidateAsistenteScreen(), [["/asistente"]]],
  ])("%s", (_name, run, expected) => {
    run();
    expect(calls()).toEqual(expected);
  });

  it.each([
    ["perfil", "/ajustes/perfil"],
    ["horario", "/ajustes/horario"],
    ["integraciones", "/ajustes/integraciones"],
    ["notificaciones", "/ajustes/notificaciones"],
    ["puestos", "/configuracion/puestos"],
    ["estatus", "/configuracion/estatus"],
    ["tramos", "/configuracion/tramos"],
    ["workflows", "/configuracion/workflows"],
    ["google", "/configuracion/google"],
    ["importar-monday", "/configuracion/importar-monday"],
  ] as const)("revalidateAjustesScreen(%s)", (seg, path) => {
    revalidateAjustesScreen(seg);
    expect(calls()).toEqual([[path]]);
  });
});

describe("screen revalidation helpers: the targets an action names, in its order", () => {
  it("tasks-actions revalidateTareas: /tareas, /tablero, /calendario, then the ficha", () => {
    revalidateTareasScreen(["tareas", "tablero", "calendario"]);
    revalidateProyectoFichaScreen("p1", ["ficha"]);
    expect(calls()).toEqual([["/tareas"], ["/tablero"], ["/calendario"], ["/proyectos/p1/ficha"]]);
  });

  it("tramo-start-actions revalidateTramoStart(projectId): the eight targets in the old order", () => {
    revalidateTareasScreen(["actividadesLayout"]);
    revalidateProyectosListScreen(["proyectos"]);
    revalidateProyectoFichaScreen("p1", ["ficha"]);
    revalidateInicioScreen();
    revalidateTareasScreen(["tablero", "misTareas", "calendario"]);
    expect(calls()).toEqual([
      ["/actividades", "layout"],
      ["/proyectos"],
      ["/proyectos/p1/ficha"],
      ["/dashboard"],
      ["/tablero"],
      ["/mis-tareas"],
      ["/calendario"],
    ]);
  });

  it("single targets", () => {
    revalidateProyectosListScreen(["proyectosLayout"]);
    revalidateProyectoFichaScreen("p2", ["projectLayout"]);
    revalidateMiEspacioScreen(["miEspacioLayout"]);
    revalidateMiEspacioScreen(["miEspacio"]);
    revalidatePersonasScreen(["equipo"]);
    revalidatePersonasScreen(["directorio"]);
    revalidatePersonasScreen(["personas"]);
    revalidateTareasScreen(["tareas"]);
    expect(calls()).toEqual([
      ["/proyectos", "layout"],
      ["/proyectos/p2", "layout"],
      ["/mi-espacio", "layout"],
      ["/mi-espacio"],
      ["/equipo"],
      ["/directorio"],
      ["/personas"],
      ["/tareas"],
    ]);
  });
});

/** The rule after the move (#935): only the keep-list's `('/', 'layout')` stays inline. */
describe("no revalidatePath outside the helpers", () => {
  const ROOT = join(__dirname, "../../..");
  const CALL = /\brevalidatePath\(\s*([^)]*)\)/g;
  /** `('/', 'layout')` stays inline (keep-list); the correo tool's call has no effect and goes in Phase 10. */
  const ALLOWED_ARGS = /^"\/",\s*"layout"$/;
  const ALLOWED_FILES = new Set(["lib/assistant/tools/correo.ts"]);

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("lib/actions, lib/assistant, lib/auth and app only keep ('/', 'layout')", () => {
    const offenders: string[] = [];
    for (const dir of ["lib/actions", "lib/assistant", "lib/auth", "app"]) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (ALLOWED_FILES.has(rel)) continue;
        for (const match of readFileSync(file, "utf8").matchAll(CALL)) {
          if (!ALLOWED_ARGS.test(match[1].trim())) offenders.push(`${rel}: revalidatePath(${match[1]})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
