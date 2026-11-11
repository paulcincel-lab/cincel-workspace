import { describe, expect, it } from "vitest";

import { LOCK_REASON } from "@/components/widgets/editable-cell";
import { tareasListFiltersOf } from "@/lib/query/options/tareas";
import { DEFAULT_TAREAS_QUERY, parseTareasQuery, toTareasSearch } from "@/lib/tareas/query";

import {
  TASK_SUPPORT_COLUMN,
  taskSupportExclude,
  taskSupportIds,
  taskSupportLock,
  taskSupportOptions,
  taskWithSupport,
} from "./task-cell-edits";
import { ANALITICO_COLUMNS } from "./tareas-analitico";
import { LISTA_COLUMNS } from "./lista-table";

const staff = [
  { id: "u2", name: "Bruno Díaz" },
  { id: "u1", name: "Ana López" },
  { id: "u3", name: "Carla Ruiz" },
];

describe("Apoyo cells (#1038)", () => {
  it("sits right after Responsable in the Analítico and Lista tables", () => {
    for (const columns of [ANALITICO_COLUMNS, LISTA_COLUMNS]) {
      const keys = columns.map((c) => c.key);
      expect(keys[keys.indexOf("responsable") + 1]).toBe(TASK_SUPPORT_COLUMN);
      expect(columns.find((c) => c.key === TASK_SUPPORT_COLUMN)?.label).toBe("Apoyo");
    }
  });

  it("value, options by name with avatars, and the Responsable excluded", () => {
    const task = { managerId: "u1", support: [{ id: "u2", name: "Bruno Díaz" }] };
    expect(taskSupportIds(task)).toEqual(["u2"]);
    expect(taskSupportOptions(staff).map((o) => o.label)).toEqual(["Ana López", "Bruno Díaz", "Carla Ruiz"]);
    expect(taskSupportOptions(staff)[0]).toMatchObject({ value: "u1", avatar: { name: "Ana López" } });
    expect(taskSupportExclude(task)).toEqual(["u1"]);
    expect(taskSupportExclude({ managerId: null })).toEqual([]);
  });

  it("locks with the Responsable's rule (canChangeResponsible)", () => {
    expect(taskSupportLock({ caps: { canChangeResponsible: true } })).toBe(true);
    expect(taskSupportLock({ caps: { canChangeResponsible: false } })).toBe(LOCK_REASON.support);
  });

  it("the optimistic patch names the people from the staff list, without repeats", () => {
    const task = { id: "t1", support: [{ id: "u2", name: "Bruno Díaz" }] };
    expect(taskWithSupport(task, ["u3", "u2", "u3"], staff)).toEqual({
      id: "t1",
      support: [
        { id: "u3", name: "Carla Ruiz" },
        { id: "u2", name: "Bruno Díaz" },
      ],
    });
    expect(taskWithSupport(task, [], staff).support).toEqual([]);
  });
});

describe("Incluir apoyo (?apoyo=)", () => {
  it("is on by default and left out of the URL; ?apoyo=0 turns it off", () => {
    expect(DEFAULT_TAREAS_QUERY.apoyo).toBe(true);
    expect(parseTareasQuery(new URLSearchParams("")).apoyo).toBe(true);
    expect(parseTareasQuery(new URLSearchParams("apoyo=0")).apoyo).toBe(false);
    expect(toTareasSearch({ responsable: "yo", apoyo: true })).toBe("?responsable=yo");
    expect(toTareasSearch({ responsable: "yo", apoyo: false })).toBe("?responsable=yo&apoyo=0");
  });

  it("reaches the list filters only with a responsable filter", () => {
    const off = { ...DEFAULT_TAREAS_QUERY, apoyo: false };
    expect(tareasListFiltersOf({ ...off, responsable: "yo" }).apoyo).toBe(false);
    expect("apoyo" in tareasListFiltersOf(off)).toBe(false);
    expect("apoyo" in tareasListFiltersOf({ ...off, responsable: "todos" })).toBe(false);
    expect("apoyo" in tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, responsable: "yo" })).toBe(false);
  });
});
