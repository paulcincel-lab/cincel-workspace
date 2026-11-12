import { describe, expect, it } from "vitest";

import { LOCK_REASON } from "@/components/widgets/editable-cell";
import type { TareasListPages } from "@/lib/query/options/tareas";
import { SIN_TRAMO_KEY } from "@/lib/tareas/summary";
import type { TaskListRow } from "@/lib/types/core";

import { analiticoTaskRow } from "./fixtures/analitico-summary";
import { DISENO, PRESALE } from "./fixtures/lista-tasks";
import {
  matchesTramoFilter,
  patchTaskListPages,
  taskCellAction,
  taskCellLock,
  taskCellOptions,
  taskCellValue,
  taskWithChange,
  type TaskCellCatalogs,
  type TaskCellField,
  type TaskCellTask,
  type TaskCellViewer,
} from "./task-cell-edits";

const ADMIN: TaskCellViewer = {
  admin: true,
  caps: { canCreateActivity: true, canChangeResponsible: true, statusScope: "all" },
};
const COLABORADOR: TaskCellViewer = {
  admin: false,
  caps: { canCreateActivity: true, canChangeResponsible: false, statusScope: "assigned_or_participant" },
};
const READER: TaskCellViewer = {
  admin: false,
  caps: { canCreateActivity: false, canChangeResponsible: false, statusScope: "none" },
};

const PLANOS_FASE = { id: "f-planos", name: "Planos", sortOrder: 1 };
const CONTRATO_FASE = { id: "f-contrato", name: "Contrato", sortOrder: 1 };

const CATALOGS: TaskCellCatalogs = {
  tramos: [DISENO, PRESALE],
  phasesOf: (id) => (id === DISENO.id ? [PLANOS_FASE] : id === PRESALE.id ? [CONTRATO_FASE] : []),
  statuses: [{ id: "cs1", name: "En revisión cliente", closes: false, countsAsCompleted: false, sortOrder: 1 }],
  staff: [
    { id: "s2", name: "Luis Pérez" },
    { id: "s1", name: "Ana Ruiz" },
  ],
  spacesOf: (id) => (id === "p1" ? [{ id: "e1", name: "Cocina" }] : []),
};

const task = analiticoTaskRow({
  id: "t1",
  title: "Planos",
  workflowId: DISENO.id,
  workflow: DISENO,
  phaseId: PLANOS_FASE.id,
  phase: PLANOS_FASE,
  commitmentDate: "2026-11-04",
  deliveryDate: "2026-11-20",
  manager: { id: "s1", name: "Ana Ruiz" },
  managerId: "s1",
  priority: "alta",
});

describe("taskCellLock", () => {
  const fields: TaskCellField[] = ["tarea", "tramo", "fase", "estatus", "responsable", "prioridad", "vence", "espacio"];

  it("lets an admin edit every cell", () => {
    for (const field of fields) expect(taskCellLock(task, field, ADMIN)).toBe(true);
  });

  it("locks the Tramo move and Responsable for a colaborador, with the reason", () => {
    expect(taskCellLock(task, "tramo", COLABORADOR)).toBe(LOCK_REASON.tramo);
    expect(taskCellLock(task, "responsable", COLABORADOR)).toBe(LOCK_REASON.responsible);
    for (const field of ["tarea", "fase", "estatus", "prioridad", "vence"] as const) {
      expect(taskCellLock(task, field, COLABORADOR)).toBe(true);
    }
    // A task without tramo gets one from any task writer.
    expect(taskCellLock({ ...task, workflowId: null, workflow: null }, "tramo", COLABORADOR)).toBe(true);
  });

  it("locks everything without the activity capabilities", () => {
    expect(taskCellLock(task, "tarea", READER)).toBe(LOCK_REASON.taskWriter);
    expect(taskCellLock(task, "estatus", READER)).toBe(LOCK_REASON.status);
    expect(taskCellLock(task, "responsable", READER)).toBe(LOCK_REASON.responsible);
  });

  it("locks a subtask's fase and an admin task's tramo, fase and espacio", () => {
    expect(taskCellLock({ ...task, parentTaskId: "t0" }, "fase", ADMIN)).toBe(LOCK_REASON.subtaskPhase);
    const admin = { ...task, kind: "admin" as const };
    for (const field of ["tramo", "fase", "espacio"] as const) expect(taskCellLock(admin, field, ADMIN)).toBe(LOCK_REASON.adminTask);
  });
});

describe("taskCellOptions", () => {
  const labels = (field: TaskCellField) => taskCellOptions(task, field, CATALOGS).map((o) => o.label);

  it("lists the tramos in order with their colour, and the fases of the row's tramo", () => {
    const tramos = taskCellOptions(task, "tramo", CATALOGS);
    expect(tramos.map((o) => o.label)).toEqual(["Presale", "Diseño"]);
    expect(tramos.every((o) => typeof o.color === "string" && o.color.startsWith("var("))).toBe(true);
    expect(labels("fase")).toEqual(["Planos"]);
    expect(taskCellOptions({ ...task, workflowId: null }, "fase", CATALOGS)).toEqual([]);
  });

  it("lists base and custom statuses, people by name, priorities and the project's espacios", () => {
    expect(labels("estatus")).toEqual(["Pendiente", "En proceso", "Completado", "Bloqueado", "En revisión cliente"]);
    expect(labels("responsable")).toEqual(["Ana Ruiz", "Luis Pérez"]);
    expect(labels("prioridad")).toEqual(["Alta", "Media", "Baja"]);
    expect(labels("espacio")).toEqual(["Cocina"]);
  });
});

describe("taskCellValue / taskCellAction", () => {
  it("reads and saves Vence on the date it shows (commitment, else delivery)", () => {
    expect(taskCellValue(task, "vence")).toBe("2026-11-04");
    expect(taskCellAction(task, "vence", "2026-11-10")).toEqual({ kind: "update", patch: { commitmentDate: "2026-11-10" } });
    const delivery = { ...task, commitmentDate: null };
    expect(taskCellValue(delivery, "vence")).toBe("2026-11-20");
    expect(taskCellAction(delivery, "vence", null)).toEqual({ kind: "update", patch: { deliveryDate: null } });
  });

  it("maps each field to its action", () => {
    expect(taskCellAction(task, "tarea", "  Planos v2 ")).toEqual({ kind: "update", patch: { title: "Planos v2" } });
    expect(taskCellAction(task, "tarea", "  ")).toEqual({ kind: "none" });
    expect(taskCellAction(task, "tramo", PRESALE.id)).toEqual({ kind: "update", patch: { workflowId: PRESALE.id } });
    expect(taskCellAction(task, "fase", null)).toEqual({ kind: "update", patch: { phaseId: null } });
    expect(taskCellAction(task, "estatus", "bloqueado")).toEqual({ kind: "status", status: "bloqueado" });
    expect(taskCellAction(task, "estatus", "custom:cs1")).toEqual({ kind: "customStatus", id: "cs1" });
    expect(taskCellAction(task, "responsable", null)).toEqual({ kind: "assign", managerId: null });
    expect(taskCellAction(task, "prioridad", "baja")).toEqual({ kind: "update", patch: { priority: "baja" } });
    expect(taskCellAction(task, "revision", "2026-11-30")).toEqual({ kind: "update", patch: { reviewDate: "2026-11-30" } });
    expect(taskCellAction(task, "espacio", "e1")).toEqual({ kind: "update", patch: { spaceId: "e1" } });
  });
});

describe("taskWithChange", () => {
  it("moves the task to another tramo and clears its fase", () => {
    const moved = taskWithChange(task, "tramo", PRESALE.id, CATALOGS);
    expect(moved).toMatchObject({ workflowId: PRESALE.id, workflow: PRESALE, phaseId: null, phase: null });
    expect(taskWithChange(task, "tramo", DISENO.id, CATALOGS)).toBe(task);
  });

  it("patches the shown fields of the other cells", () => {
    expect(taskWithChange(task, "fase", PLANOS_FASE.id, CATALOGS).phase).toEqual(PLANOS_FASE);
    expect(taskWithChange(task, "estatus", "custom:cs1", CATALOGS)).toMatchObject({
      status: "en_proceso",
      customStatus: { id: "cs1", name: "En revisión cliente" },
    });
    expect(taskWithChange(task, "responsable", "s2", CATALOGS).manager).toEqual({ id: "s2", name: "Luis Pérez" });
    expect(taskWithChange(task, "responsable", null, CATALOGS)).toMatchObject({ managerId: null, manager: null });
    expect(taskWithChange(task, "vence", "2026-11-12", CATALOGS)).toMatchObject({
      commitmentDate: "2026-11-12",
      deliveryDate: "2026-11-20",
    });
    expect(taskWithChange(task, "tarea", "Planos v2", CATALOGS).title).toBe("Planos v2");
    expect(taskWithChange(task, "espacio", "e1", CATALOGS).space).toEqual({ id: "e1", name: "Cocina" });
  });
});

describe("patchTaskListPages", () => {
  const pages = (rows: TaskListRow[]): TareasListPages => ({ pages: [{ rows, nextCursor: null, total: rows.length }], pageParams: [null] });
  const other = analiticoTaskRow({ id: "t2", title: "Render" });
  const sub = analiticoTaskRow({ id: "t3", title: "Corte", parentTaskId: "t1" });
  const toPresale = <R extends TaskCellTask>(row: R): R => taskWithChange(row, "tramo", PRESALE.id, CATALOGS);
  const moved = toPresale(task);

  it("matches the tramo filter forms", () => {
    expect(matchesTramoFilter(null, null)).toBe(true);
    expect(matchesTramoFilter("diseno", "diseno")).toBe(true);
    expect(matchesTramoFilter("presale, diseno", "diseno")).toBe(true);
    expect(matchesTramoFilter("presale", "diseno")).toBe(false);
    expect(matchesTramoFilter(SIN_TRAMO_KEY, null)).toBe(true);
  });

  it("takes the row and its subtasks out of the old tramo group and puts the row first in the new one", () => {
    const diseno = pages([task, other, sub]);
    const out = patchTaskListPages(diseno, { tramo: "diseno", proyecto: "p1" } as never, "t1", toPresale, { subtasks: true, moved });
    expect(out.pages[0].rows.map((r) => r.id)).toEqual(["t2"]);

    const presale = pages([other]);
    const into = patchTaskListPages(presale, { tramo: "presale", proyecto: "p1" } as never, "t1", toPresale, { subtasks: true, moved });
    expect(into.pages[0].rows.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(into.pages[0].rows[0].phaseId).toBeNull();

    // Another project's group stays as it is.
    const roma = pages([other]);
    expect(patchTaskListPages(roma, { tramo: "presale", proyecto: "p2" } as never, "t1", toPresale, { moved })).toBe(roma);
  });

  it("patches in place in an unscoped list and leaves lists without the task untouched", () => {
    const all = pages([task, other]);
    const out = patchTaskListPages(all, { tramo: null, proyecto: null } as never, "t1", toPresale, { moved });
    expect(out.pages[0].rows.map((r) => [r.id, r.workflowId])).toEqual([
      ["t1", PRESALE.id],
      ["t2", DISENO.id],
    ]);
    const without = pages([other]);
    expect(patchTaskListPages(without, { tramo: null, proyecto: null } as never, "t1", toPresale, { moved })).toBe(without);
  });
});

describe("Horas estimadas cell (#1084)", () => {
  it("reads, previews and saves the hours through the hours action", () => {
    expect(taskCellValue(task, "horas")).toBeNull();
    const withHours = { ...task, estimatedHours: 2.5 };
    expect(taskCellValue(withHours, "horas")).toBe("2.5");
    expect(taskWithChange(task, "horas", "3", CATALOGS)).toMatchObject({ estimatedHours: 3 });
    expect(taskWithChange(withHours, "horas", null, CATALOGS)).toMatchObject({ estimatedHours: null });
    expect(taskCellAction(task, "horas", "3")).toEqual({ kind: "hours", hours: 3 });
    expect(taskCellAction(task, "horas", null)).toEqual({ kind: "hours", hours: null });
  });

  it("is locked for a viewer that can't edit tasks", () => {
    expect(taskCellLock(task, "horas", ADMIN)).toBe(true);
    expect(taskCellLock(task, "horas", COLABORADOR)).toBe(true);
    expect(taskCellLock(task, "horas", READER)).toBe(LOCK_REASON.taskWriter);
  });
});
