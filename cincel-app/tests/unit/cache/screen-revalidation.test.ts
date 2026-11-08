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

import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";
import { revalidateProyectoFichaScreen } from "@/lib/cache/screens/proyectos";

const calls = () => revalidatePath.mock.calls;

beforeEach(() => revalidatePath.mockReset());

describe("screen revalidation helpers: the full screen", () => {
  it.each([
    // Emptied in Phase 3: Inicio is the `qk.inicio()` query, invalidated by the mutations.
    ["revalidateInicioScreen()", () => revalidateInicioScreen(), []],
    // The ficha target went in 5b (#960): the ficha is the `qk.proyectos.tab(id,'ficha')` query.
    ["revalidateProyectoFichaScreen(id)", () => revalidateProyectoFichaScreen("p1"), [["/proyectos/p1", "layout"]]],
  ])("%s", (_name, run, expected) => {
    run();
    expect(calls()).toEqual(expected);
  });
});

describe("screen revalidation helpers: the targets an action names, in its order", () => {
  it("single targets", () => {
    revalidateProyectoFichaScreen("p2", ["projectLayout"]);
    expect(calls()).toEqual([["/proyectos/p2", "layout"]]);
  });
});

/** The rule after the move (#935): only the keep-list's `('/', 'layout')` stays inline. */
describe("no revalidatePath outside the helpers", () => {
  const ROOT = join(__dirname, "../../..");
  const CALL = /\brevalidatePath\(\s*([^)]*)\)/g;
  /** `('/', 'layout')` stays inline (keep-list). */
  const ALLOWED_ARGS = /^"\/",\s*"layout"$/;
  const ALLOWED_FILES = new Set<string>();

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
