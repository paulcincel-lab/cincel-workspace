// @vitest-environment node
/**
 * scripts/monday/check-exports.ts: the on-disk check and the markdown output
 * (backend spec §11.2 pre-flight), against a temporary export folder.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkProject,
  DEFAULT_PROJECTS,
  formatChecks,
  parseProjects,
  type ProjectSource,
} from "@/scripts/monday/check-exports";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function exportDir(boards: { id: string; done?: boolean; items?: boolean }[]): string {
  const dir = mkdtempSync(join(tmpdir(), "monday-export-"));
  dirs.push(dir);
  writeFileSync(join(dir, "manifest.json"), "{}");
  for (const b of boards) {
    const bd = join(dir, "boards", b.id);
    mkdirSync(bd, { recursive: true });
    writeFileSync(join(bd, "board.json"), "{}");
    if (b.items !== false) writeFileSync(join(bd, "items.ndjson"), "");
    if (b.done !== false) writeFileSync(join(bd, ".done"), "");
  }
  return dir;
}

const source = (s: Partial<ProjectSource>): ProjectSource => ({
  name: "Madrid 22",
  projectId: "p1",
  batchId: "b1",
  exportPath: null,
  boards: [{ boardId: "100", boardName: "Madrid 22" }],
  ...s,
});

describe("checkProject", () => {
  it("is ok when the folder and every board are there", () => {
    const dir = exportDir([{ id: "100" }]);
    const c = checkProject(source({ exportPath: dir }));
    expect(c.ok).toBe(true);
    expect(c.checks).toEqual([{ boardId: "100", boardName: "Madrid 22", present: true, done: true }]);
  });

  it("flags a missing folder", () => {
    const c = checkProject(source({ exportPath: "/nonexistent/monday/run" }));
    expect(c.ok).toBe(false);
    expect(c.folder).toBe(false);
    expect(c.problem).toBe("Falta la carpeta de la exportación");
  });

  it("flags a missing board and an unfinished one", () => {
    const dir = exportDir([{ id: "100", items: false }]);
    expect(checkProject(source({ exportPath: dir })).problem).toBe("Faltan tableros");
    const dir2 = exportDir([{ id: "100", done: false }]);
    expect(checkProject(source({ exportPath: dir2 })).problem).toBe("Hay tableros sin terminar de exportar");
  });

  it("flags a project that is not found or not imported", () => {
    expect(checkProject(source({ projectId: null })).problem).toBe("Proyecto no encontrado");
    expect(checkProject(source({ batchId: null })).ok).toBe(false);
  });
});

describe("formatChecks", () => {
  it("names the projects to re-export", () => {
    const ok = checkProject(source({ exportPath: exportDir([{ id: "100" }]) }));
    const gone = checkProject(source({ name: "Guadalajara 83", exportPath: "/nonexistent" }));
    const out = formatChecks([ok, gone]);
    expect(out).toContain("| Madrid 22 | presente |");
    expect(out).toContain("FALTA: Falta la carpeta de la exportación");
    expect(out).toContain("Vuelve a exportar de monday: Guadalajara 83.");
  });

  it("says all is present when nothing is missing", () => {
    const ok = checkProject(source({ exportPath: exportDir([{ id: "100" }]) }));
    expect(formatChecks([ok])).toContain("Todas las exportaciones están presentes.");
  });
});

describe("parseProjects", () => {
  it("defaults to the three imported projects", () => {
    expect(parseProjects([])).toEqual(DEFAULT_PROJECTS);
    expect(parseProjects(["--projects", "A, B"])).toEqual(["A", "B"]);
  });
});
