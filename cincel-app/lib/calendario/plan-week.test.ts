// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  cellsAfterPlacements,
  orderBacklog,
  planWeek,
  PLAN_WEEK_REASONS,
  type PlanWeekBacklogTask,
  type PlanWeekInput,
  type PlanWeekPerson,
} from "@/lib/calendario/plan-week";

const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
const [LUN, MAR, MIE, JUE, VIE] = DAYS as [string, string, string, string, string];

const person = (staffId: string, name: string, extra: Partial<PlanWeekPerson> = {}): PlanWeekPerson => ({
  staffId,
  name,
  workday: 6,
  absent: [],
  booked: {},
  ...extra,
});

let seq = 0;
const task = (taskId: string, title: string, managerId: string | null, extra: Partial<PlanWeekBacklogTask> = {}): PlanWeekBacklogTask => ({
  taskId,
  title,
  hours: 2,
  priority: "media",
  managerId,
  deadline: null,
  dependsOn: [],
  projectId: `p${++seq}`,
  ...extra,
});

const base = (over: Partial<PlanWeekInput>): PlanWeekInput => ({
  weekStart: LUN,
  days: DAYS,
  people: [],
  backlog: [],
  now: LUN,
  ...over,
});

/** The canvas team: Ana, Jorge and Luis on Madrid 22 and Proyecto Beta. */
function canvasInput(): PlanWeekInput {
  return base({
    people: [
      person("ana", "Ana García", { booked: { [LUN]: 3, [MAR]: 1.5 } }),
      person("jorge", "Jorge Ruiz", { booked: { [LUN]: 6, [MAR]: 6, [MIE]: 6, [JUE]: 6, [VIE]: 6 } }),
      person("luis", "Luis Martínez", { booked: { [JUE]: 4 }, absent: [LUN, MAR] }),
    ],
    backlog: [
      task("t1", "Planos de cocina", "ana", { hours: 4, priority: "alta", projectId: "madrid-22" }),
      task("t2", "Detalles de carpintería", "ana", { hours: 3, projectId: "madrid-22", dependsOn: ["t1"] }),
      task("t3", "Cotización de herrería", "jorge", { hours: 2, projectId: "beta" }),
      task("t4", "Revisión de instalaciones", "luis", { hours: 3, priority: "alta", projectId: "beta" }),
      task("t5", "Lista de pendientes", "luis", { hours: 3, priority: "baja", projectId: "beta" }),
      task("t6", "Acabados de baño", null, { hours: 1, projectId: "madrid-22" }),
    ],
  });
}

describe("planWeek", () => {
  it("places the canvas team deterministically", () => {
    const first = planWeek(canvasInput());
    expect(planWeek(canvasInput())).toEqual(first);
    expect(first.placements).toEqual([
      { taskId: "t1", staffId: "ana", date: MAR },
      { taskId: "t4", staffId: "luis", date: MIE },
      { taskId: "t2", staffId: "ana", date: MIE },
      { taskId: "t5", staffId: "luis", date: MIE },
    ]);
    expect(first.deferred).toEqual([
      { taskId: "t3", title: "Cotización de herrería", reason: "Jorge Ruiz ya está al 100 %" },
      { taskId: "t6", title: "Acabados de baño", reason: "Sin responsable" },
    ]);
  });

  it("never exceeds a workday and every unplaced task has a reason", () => {
    const input = canvasInput();
    const plan = planWeek(input);
    for (const cell of plan.cells) expect(cell.after).toBeLessThanOrEqual(cell.workday + 1e-9);
    const placed = new Set(plan.placements.map((p) => p.taskId));
    for (const t of input.backlog) {
      if (!placed.has(t.taskId)) expect(plan.deferred.find((d) => d.taskId === t.taskId)?.reason).toBeTruthy();
    }
    expect(plan.placements.length + plan.deferred.length).toBe(input.backlog.length);
  });

  it("reports before and after hours per person and day, with workday 0 on absences", () => {
    const { cells } = planWeek(canvasInput());
    expect(cells).toHaveLength(15);
    expect(cells.find((c) => c.staffId === "ana" && c.date === LUN)).toEqual({ staffId: "ana", date: LUN, before: 3, after: 3, workday: 6 });
    expect(cells.find((c) => c.staffId === "ana" && c.date === MAR)).toEqual({ staffId: "ana", date: MAR, before: 1.5, after: 5.5, workday: 6 });
    expect(cells.find((c) => c.staffId === "luis" && c.date === LUN)?.workday).toBe(0);
  });

  it("does not split a task: a 4 h task skips a day with 3 h left", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García", { booked: { [LUN]: 3 } })],
        backlog: [task("a", "Cálculo estructural", "ana", { hours: 4 })],
      }),
    );
    expect(plan.placements).toEqual([{ taskId: "a", staffId: "ana", date: MAR }]);
  });

  it("starts at today, not at the Monday of a week already begun", () => {
    const plan = planWeek(base({ now: "2026-11-18T10:00:00-06:00", people: [person("ana", "Ana García")], backlog: [task("a", "Ajustes", "ana")] }));
    expect(plan.placements[0]?.date).toBe(MIE);
  });

  it("orders by deadline, priority, hours and id, with dependencies first", () => {
    const ordered = orderBacklog([
      task("d", "d", "ana", { hours: 1 }),
      task("c", "c", "ana", { priority: "alta", hours: 1 }),
      task("b", "b", "ana", { deadline: VIE, hours: 1 }),
      task("a", "a", "ana", { deadline: MIE, hours: 1, dependsOn: ["b"] }),
      task("e", "e", "ana", { hours: 5 }),
    ]);
    expect(ordered.map((t) => t.taskId)).toEqual(["b", "a", "c", "e", "d"]);
  });

  it("never places a task before its dependency", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García"), person("luis", "Luis Martínez", { booked: { [LUN]: 5 } })],
        backlog: [task("a", "Planos", "ana", { hours: 5, priority: "alta" }), task("b", "Renders", "luis", { hours: 1, dependsOn: ["a"] })],
      }),
    );
    const date = (id: string) => plan.placements.find((p) => p.taskId === id)?.date;
    expect(date("a")).toBe(LUN);
    expect(date("b")! >= date("a")!).toBe(true);
  });

  it("defers a task whose dependency has no date", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García")],
        backlog: [task("a", "Entrega", "ana", { dependsOn: ["ext"] })],
        externalDeps: { ext: { title: "Autorización del cliente", date: null } },
      }),
    );
    expect(plan.deferred).toEqual([{ taskId: "a", title: "Entrega", reason: "Depende de Autorización del cliente, que aún no tiene fecha" }]);
  });

  it("defers a task whose dependency could not be placed", () => {
    const plan = planWeek(
      base({
        people: [person("jorge", "Jorge Ruiz", { booked: Object.fromEntries(DAYS.map((d) => [d, 6])) }), person("ana", "Ana García")],
        backlog: [task("a", "Cimbra", "jorge", { priority: "alta" }), task("b", "Obra negra", "ana", { dependsOn: ["a"] })],
      }),
    );
    expect(plan.deferred.map((d) => d.reason)).toEqual(["Jorge Ruiz ya está al 100 %", "Depende de Cimbra, que aún no tiene fecha"]);
  });

  it("respects a dated external dependency", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García")],
        backlog: [task("a", "Instalación", "ana", { dependsOn: ["ext"] })],
        externalDeps: { ext: { title: "Pedido", date: JUE } },
      }),
    );
    expect(plan.placements[0]?.date).toBe(JUE);
  });

  it("explains a deadline that leaves no room", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García", { booked: { [LUN]: 6, [MAR]: 6 } })],
        backlog: [task("a", "Entrega de planos", "ana", { deadline: MAR })],
      }),
    );
    expect(plan.deferred).toEqual([{ taskId: "a", title: "Entrega de planos", reason: PLAN_WEEK_REASONS.deadline }]);
  });

  it("skips absent days and explains a full week of vacation", () => {
    const away = person("luis", "Luis Martínez", { absent: DAYS });
    const partial = person("ana", "Ana García", { absent: [LUN, MAR] });
    const plan = planWeek(base({ people: [away, partial], backlog: [task("a", "Visita", "luis"), task("b", "Dibujo", "ana")] }));
    expect(plan.deferred).toEqual([{ taskId: "a", title: "Visita", reason: "Luis Martínez está de vacaciones" }]);
    expect(plan.placements).toEqual([{ taskId: "b", staffId: "ana", date: MIE }]);
  });

  it("defers a task longer than the workday as a full lane", () => {
    const plan = planWeek(base({ people: [person("ana", "Ana García", { workday: 4 })], backlog: [task("a", "Maqueta", "ana", { hours: 5 })] }));
    expect(plan.deferred[0]?.reason).toBe("Ana García ya está al 100 %");
  });

  it("handles a dependency cycle without looping", () => {
    const plan = planWeek(
      base({
        people: [person("ana", "Ana García")],
        backlog: [task("a", "Uno", "ana", { dependsOn: ["b"] }), task("b", "Dos", "ana", { dependsOn: ["a"] })],
      }),
    );
    expect(plan.placements).toEqual([]);
    expect(plan.deferred).toHaveLength(2);
  });

  it("returns an empty plan for an empty backlog", () => {
    expect(planWeek(base({ people: [person("ana", "Ana García")] })).placements).toEqual([]);
  });
});

describe("cellsAfterPlacements", () => {
  it("adds the hours of the placements to the before value", () => {
    const cells = [{ staffId: "ana", date: LUN, before: 3, after: 3, workday: 6 }];
    const out = cellsAfterPlacements(cells, [{ taskId: "a", staffId: "ana", date: LUN }], { a: 2.5 });
    expect(out[0]?.after).toBe(5.5);
  });
});
