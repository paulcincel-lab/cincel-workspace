import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ removeStorage: vi.fn() }));
vi.mock("@/lib/repositories/browser-state-repository", () => storage);

import type { ProjectListItem, ProjectTramo, TaskListItem } from "@/lib/types/core";
import {
  LEGACY_GROUP_BY_STORAGE_KEY,
  buildGeneralProjectBlocks,
  clearLegacyGroupByStorage,
} from "./general-blocks";

const presale = { id: "wf-presale", key: "presale", name: "Presale", sortOrder: 0 };
const diseno = { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 1 };

function task(id: string, overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    title: id,
    kind: "workflow",
    project: { id: "p1", name: "Casa Norte", clientName: null },
    workflow: null,
    phaseRef: null,
    ...overrides,
  } as TaskListItem;
}

function project(id: string, tramos: ProjectTramo[]): ProjectListItem {
  return { id, name: id, tramos } as unknown as ProjectListItem;
}

describe("buildGeneralProjectBlocks", () => {
  it("makes one block per project, sorted by name, with the project's tramos", () => {
    const tramos: ProjectTramo[] = [{ ...presale, startedAt: "2026-01-01", closedAt: null, current: true }];
    const blocks = buildGeneralProjectBlocks(
      [
        task("a", { project: { id: "p2", name: "Torre Sur", clientName: null }, workflow: diseno }),
        task("b", { workflow: presale }),
        task("c", { project: { id: "p2", name: "Torre Sur", clientName: null }, workflow: presale }),
      ],
      [project("p1", tramos)],
    );
    expect(blocks.map((b) => b.name)).toEqual(["Casa Norte", "Torre Sur"]);
    expect(blocks[0].tramos).toEqual(tramos);
    expect(blocks[1].tramos).toEqual([]);
    expect(blocks[1].tasks.map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("sorts rows by tramo order, then fase order, tasks without them last", () => {
    const blocks = buildGeneralProjectBlocks(
      [
        task("none"),
        task("d2", { workflow: diseno, phaseRef: { id: "f2", name: "Ejecutivo", sortOrder: 2 } }),
        task("p", { workflow: presale }),
        task("d1", { workflow: diseno, phaseRef: { id: "f1", name: "Anteproyecto", sortOrder: 1 } }),
      ],
      [],
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tasks.map((t) => t.id)).toEqual(["p", "d1", "d2", "none"]);
  });

  it("leaves admin tasks out", () => {
    const blocks = buildGeneralProjectBlocks([task("adm", { kind: "admin" })], []);
    expect(blocks).toEqual([]);
  });
});

describe("clearLegacyGroupByStorage", () => {
  it("removes the old selector key", () => {
    clearLegacyGroupByStorage();
    expect(storage.removeStorage).toHaveBeenCalledWith(LEGACY_GROUP_BY_STORAGE_KEY);
    expect(LEGACY_GROUP_BY_STORAGE_KEY).toBe("cincel.actividades.general.groupBy.v1");
  });

  it("ignores blocked storage", () => {
    storage.removeStorage.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(() => clearLegacyGroupByStorage()).not.toThrow();
  });
});
