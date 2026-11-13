import { describe, expect, it } from "vitest";

import { LISTA_COLUMNS, listaPlazo, listaTable, listaTasks, projectSummaries } from "@/components/tareas/lista-table";
import { LISTA_TASKS, LISTA_TODAY, makeListaTask } from "@/components/tareas/fixtures/lista-tasks";

function column(key: string) {
  const found = LISTA_COLUMNS.find((c) => c.key === key);
  if (!found) throw new Error(`missing column ${key}`);
  return found;
}

describe("listaTable", () => {
  const table = listaTable(LISTA_TASKS, LISTA_TODAY);

  it("groups by estatus in base status order and sorts each group by delay", () => {
    expect(table.groupBy).toBe("estatus");
    expect(table.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t5", "t4"]);
    expect(table.rows.map((r) => r.estatus)).toEqual(["Pendiente", "Pendiente", "En proceso", "En proceso", "Completado"]);
  });

  it("puts the by-project summary on each row (Analítico only)", () => {
    const lomas = table.rows.find((r) => r.id === "t1")!;
    expect(lomas).toMatchObject({ abiertas: 2, vencidas: 1, pctVencidas: 50, retrasoPromedio: 6, diasRetraso: 6 });
    const roma = table.rows.find((r) => r.id === "t3")!;
    expect(roma).toMatchObject({ abiertas: 2, vencidas: 1, pctVencidas: 50, retrasoPromedio: 2, diasRetraso: 2 });
    for (const key of ["diasRetraso", "abiertas", "vencidas", "pctVencidas", "retrasoPromedio"]) {
      expect(column(key).hideOn).toEqual(["visual", "esencial"]);
    }
  });

  it("shows Plazo only in Esencial and keeps the Visual columns", () => {
    expect(column("plazo").hideOn).toEqual(["visual", "analitico"]);
    const visible = LISTA_COLUMNS.filter((c) => !c.hideOn?.includes("visual")).map((c) => c.key);
    expect(visible).toEqual(["tarea", "proyecto", "etapa", "responsable", "apoyo", "vence", "prioridad", "subtareas"]);
    expect(table.rows.map((r) => r.plazo)).toEqual(["Vencida", "Esta semana", "Vencida", "Más adelante", "Completada"]);
  });

  it("heats % vencidas at 45 / 60 and totals the whole list", () => {
    expect(table.heat).toEqual([{ key: "pctVencidas", warnAt: 45, critAt: 60 }]);
    expect(table.totals).toEqual({
      tarea: "Total · 5 tareas",
      diasRetraso: 8,
      abiertas: 4,
      vencidas: 2,
      pctVencidas: 50,
      retrasoPromedio: 4,
    });
  });

  it("formats the row cells as plain data", () => {
    const row = table.rows.find((r) => r.id === "t1")!;
    expect(row).toMatchObject({
      tarea: "Levantamiento",
      proyecto: "Casa Lomas",
      etapa: "Diseño",
      responsable: "Ana Ruiz",
      vence: "2026-11-01",
      prioridad: "Alta",
      subtareas: "1/4",
    });
    expect(table.rows.find((r) => r.id === "t5")).toMatchObject({ vence: null, responsable: null, subtareas: null });
  });

  it("renders an empty table with zero totals", () => {
    const empty = listaTable([], LISTA_TODAY);
    expect(empty.rows).toEqual([]);
    expect(empty.totals).toMatchObject({ tarea: "Total · 0 tareas", abiertas: 0, pctVencidas: 0, retrasoPromedio: 0 });
  });
});

describe("listaPlazo", () => {
  it("closes the week on Sunday", () => {
    expect(listaPlazo(makeListaTask({ commitmentDate: "2026-11-08" }), LISTA_TODAY)).toBe("Esta semana");
    expect(listaPlazo(makeListaTask({ commitmentDate: "2026-11-09" }), LISTA_TODAY)).toBe("Más adelante");
    // Monday 2 → Sunday 8 is the same week.
    expect(listaPlazo(makeListaTask({ commitmentDate: "2026-11-08" }), "2026-11-02")).toBe("Esta semana");
    expect(listaPlazo(makeListaTask({ commitmentDate: "2026-11-07" }), LISTA_TODAY)).toBe("Esta semana");
  });
});

describe("projectSummaries", () => {
  it("counts only open tasks", () => {
    const summaries = projectSummaries(LISTA_TASKS, LISTA_TODAY);
    expect(summaries.get("p2")).toEqual({ abiertas: 2, vencidas: 1, pctVencidas: 50, retrasoPromedio: 2 });
  });
});

describe("listaTasks", () => {
  it("narrows by etapa key(s) and proyecto", () => {
    expect(listaTasks(LISTA_TASKS, { etapa: null, proyecto: null })).toHaveLength(5);
    expect(listaTasks(LISTA_TASKS, { etapa: "diseno", proyecto: null }).map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(listaTasks(LISTA_TASKS, { etapa: "presale,diseno", proyecto: null })).toHaveLength(5);
    expect(listaTasks(LISTA_TASKS, { etapa: null, proyecto: "p2" }).map((t) => t.id).sort()).toEqual(["t3", "t4", "t5"]);
    expect(listaTasks(LISTA_TASKS, { etapa: "diseno", proyecto: "p2" })).toEqual([]);
  });
});
