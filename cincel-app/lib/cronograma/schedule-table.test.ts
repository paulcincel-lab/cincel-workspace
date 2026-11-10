import { describe, expect, it } from "vitest";

import md22Tasks from "@/lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "@/scripts/data/md22-pagos-calendar.json";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";

import { computeProgress } from "./metrics";
import { buildScheduleTable, daysBetween, SCHEDULE_TABLE_COLUMNS } from "./schedule-table";

function task(overrides: Partial<ScheduleTask>): ScheduleTask {
  return {
    id: "t",
    stableKey: "PB-t",
    legacyId: null,
    planta: "PB",
    seccion: "Preliminares",
    responsable: null,
    inicio: "2026-09-01",
    fin: "2026-09-10",
    tarea: "Tarea",
    status: "pending",
    flagged: false,
    ...overrides,
  };
}

const today = new Date("2026-09-18T00:00:00");

describe("daysBetween", () => {
  it("counts whole days, negative when the end is earlier", () => {
    expect(daysBetween("2026-09-18", "2026-09-25")).toBe(7);
    expect(daysBetween("2026-09-18", "2026-09-10")).toBe(-8);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("buildScheduleTable", () => {
  it("is empty (same columns) without tasks", () => {
    expect(buildScheduleTable({ tasks: [], payments: [], today })).toEqual({ columns: SCHEDULE_TABLE_COLUMNS, rows: [] });
  });

  it("uses the columns of the Cronograma tab", () => {
    expect(SCHEDULE_TABLE_COLUMNS.map((c) => c.label)).toEqual([
      "Partida",
      "Responsable",
      "Inicio",
      "Fin",
      "Duración",
      "% real",
      "% plan",
      "Desviación",
      "Holgura",
      "Meses",
    ]);
  });

  it("groups tareas under their partida with real, plan, desviación and holgura", () => {
    const table = buildScheduleTable({
      tasks: [
        task({ id: "a", tarea: "Trazo", inicio: "2026-09-01", fin: "2026-09-10", status: "done", responsable: "Paul" }),
        task({ id: "b", tarea: "Limpieza", inicio: "2026-09-08", fin: "2026-09-15", status: "progress" }),
        task({ id: "c", seccion: "Acabados", tarea: "Pintura", inicio: "2026-09-21", fin: "2026-09-30" }),
      ],
      payments: [],
      today,
    });

    const partidas = table.rows.filter((r) => r.kind === "partida");
    expect(partidas.map((r) => r.partida)).toEqual(["Preliminares", "Acabados"]);

    const preliminares = partidas[0];
    expect(preliminares).toMatchObject({
      inicio: "2026-09-01",
      fin: "2026-09-15",
      duracion: 15,
      real: 75,
      plan: 100,
      desviacion: -25,
      holgura: -3,
    });

    const trazo = table.rows.find((r) => r.id === "tarea-a");
    expect(trazo).toMatchObject({ kind: "tarea", partida: "Trazo", responsable: "Paul", real: 100, plan: 100, holgura: 0 });

    const pintura = table.rows.find((r) => r.id === "tarea-c");
    expect(pintura).toMatchObject({ real: 0, plan: 0, desviacion: 0, holgura: 12, duracion: 10 });

    // Tareas follow their partida.
    const ids = table.rows.map((r) => r.id);
    expect(ids.indexOf("tarea-a")).toBeGreaterThan(ids.indexOf("partida-preliminares"));
    expect(ids.indexOf("tarea-c")).toBeGreaterThan(ids.indexOf("partida-acabados"));
  });

  it("adds the start and delivery milestones, delivery holgura against the contract end", () => {
    const table = buildScheduleTable({
      tasks: [task({ id: "a", inicio: "2026-09-01", fin: "2026-10-31" })],
      payments: [],
      today,
      contractEnd: "2026-11-10",
    });
    const hitos = table.rows.filter((r) => r.kind === "hito");
    expect(hitos.map((h) => h.partida)).toEqual(["Inicio de obra", "Entrega de obra"]);
    expect(hitos[0]).toMatchObject({ fin: "2026-09-01", real: 100 });
    expect(hitos[1]).toMatchObject({ fin: "2026-10-31", real: 0, holgura: 10 });
    expect(table.rows.at(-1)?.id).toBe("hito-entrega");
  });

  it("matches computeProgress for the project totals on the MD22 dataset", () => {
    const tasks = md22Tasks as unknown as ScheduleTask[];
    const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
      fecha: r.fecha,
      pagadoPct: r.pagado,
      avancePct: r.avance,
    }));
    const metrics = computeProgress({ tasks, payments }, today);
    const table = buildScheduleTable({ tasks, payments, today });

    expect(table.totals).toMatchObject({ partida: "Proyecto", real: metrics.realPct, plan: metrics.plannedPct });
    expect(table.rows.filter((r) => r.kind === "tarea")).toHaveLength(tasks.length);
    expect(table.totals).not.toHaveProperty("holgura");
  });

  it("gives every row a unique id even when two tareas share an id", () => {
    const table = buildScheduleTable({
      tasks: [
        task({ id: "PB-dup", tarea: "Llave angular", responsable: "Cincel" }),
        task({ id: "PB-dup", tarea: "Llave angular", responsable: "Chava" }),
      ],
      payments: [],
      today,
    });
    const ids = table.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["tarea-PB-dup", "tarea-PB-dup-2"]));
  });

  it("has unique row ids for the Madrid 22 schedule (which repeats two task ids)", () => {
    const table = buildScheduleTable({ tasks: md22Tasks as unknown as ScheduleTask[], payments: [], today });
    const ids = table.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
