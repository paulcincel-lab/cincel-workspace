import { describe, expect, it } from "vitest";

import { PORTFOLIO, TRAMOS, fixtureProject, fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";
import type { TaskListItem } from "@/lib/types/core";

import {
  buildProjectSummary,
  contactsTable,
  fichaTable,
  monthRange,
  monthYear,
  partidaItems,
  projectMetaLine,
  projectTaskStats,
  shortDate,
  tramoSteps,
} from "./project-summary";

describe("dates (es-MX, lowercase)", () => {
  it("formats short dates, month + year and month ranges in lowercase", () => {
    expect(shortDate("2026-11-03")).toBe("3 nov");
    expect(monthYear("2026-04-06")).toBe("abril 2026");
    expect(monthRange("2026-04-06", "2026-05-29")).toBe("abr – may");
    expect(monthRange("2026-07-01", null)).toBe("desde jul");
    expect(monthRange(null, null)).toBeNull();
  });
});

describe("projectMetaLine", () => {
  it("joins tipo, ciudad and responsable", () => {
    expect(projectMetaLine(fixtureProject())).toBe("Local comercial · CDMX · Responsable: Paul Langarica");
  });

  it("leaves out what the project lacks", () => {
    expect(projectMetaLine({ projectType: null, addressCity: " ", manager: { id: "s1", name: "Ana" } })).toBe(
      "Responsable: Ana"
    );
    expect(projectMetaLine({ projectType: null, addressCity: null, manager: null })).toBe("");
  });
});

describe("projectTaskStats", () => {
  const task = (over: Partial<TaskListItem>): TaskListItem =>
    ({
      id: "t",
      status: "pendiente",
      archived: false,
      commitmentDate: null,
      workflowId: "w-construccion",
      phase: null,
      ...over,
    }) as TaskListItem;

  it("counts done, open and overdue and picks the first fase of the current tramo", () => {
    const stats = projectTaskStats(
      [
        task({ id: "a", status: "completado" }),
        task({ id: "b", commitmentDate: "2026-11-01", phase: { id: "f2", name: "Acabados", sortOrder: 2 } }),
        task({ id: "c", commitmentDate: "2026-12-01", phase: { id: "f1", name: "Obra negra", sortOrder: 1 } }),
        task({ id: "d", archived: true }),
        task({ id: "e", workflowId: "w-diseno", phase: { id: "f0", name: "Anteproyecto", sortOrder: 0 } }),
      ],
      "2026-11-06",
      "w-construccion"
    );
    expect(stats).toEqual({ total: 4, done: 1, open: 3, overdue: 1, currentPhase: "Obra negra" });
  });

  it("has no fase when no open task carries one", () => {
    expect(projectTaskStats([task({})], "2026-11-06", null).currentPhase).toBeNull();
  });
});

describe("tramoSteps", () => {
  it("marks closed tramos done, the current one current and the rest next, with ranges", () => {
    const steps = tramoSteps(fixtureProject(), TRAMOS, "2026-11-06");
    expect(steps.map((s) => [s.label, s.state, s.range])).toEqual([
      ["Presale", "done", "abr – may"],
      ["Diseño", "done", "jun"],
      ["Construcción", "current", "desde jul"],
      ["Decoración", "next", null],
    ]);
    expect(steps[2].durationDays).toBe(128);
    expect(steps[3].durationDays).toBeNull();
  });

  it("falls back to the started tramos without a catalog", () => {
    expect(tramoSteps(fixtureProject(), [], "2026-11-06").map((s) => s.label)).toEqual([
      "Presale",
      "Diseño",
      "Construcción",
    ]);
  });
});

describe("partidaItems", () => {
  it("builds one item per sección with real by status and plan by due date", () => {
    const items = partidaItems(fixtureSummaryInput().schedule!.tasks, "2026-11-06");
    const acabados = items.find((i) => i.id === "Acabados y pisos");
    expect(acabados).toMatchObject({ real: 25, plan: 50 });
    expect(acabados?.sublabel).toBe("10 oct – 25 nov · Alejandro Riofrio");
    expect(items.find((i) => i.id === "Demoliciones")).toMatchObject({ real: 100, plan: 100 });
  });
});

describe("contactsTable (B8)", () => {
  it("lists client, contacts and team under «Cliente y contactos» when allowed", () => {
    const { title, table } = contactsTable(fixtureSummaryInput());
    expect(title).toBe("Cliente y contactos");
    expect(table.rows.map((r) => r.nombre)).toEqual([
      "Grupo Espinopapa",
      "Mariana Ruiz",
      "Paul Langarica",
      "Alejandro Riofrio",
      "Ana López",
    ]);
  });

  it("keeps only the team under «Equipo» otherwise", () => {
    const { title, table } = contactsTable(fixtureSummaryInput({ showClientContacts: false }));
    expect(title).toBe("Equipo");
    expect(table.rows.map((r) => r.kind)).toEqual(["equipo", "equipo", "equipo"]);
    expect(JSON.stringify(table)).not.toContain("Grupo Espinopapa");
    expect(JSON.stringify(table)).not.toContain("Mariana Ruiz");
  });

  it("gives staff a Cutto chat link and clients none", () => {
    const { table } = contactsTable(fixtureSummaryInput());
    const paul = table.rows.find((r) => r.nombre === "Paul Langarica");
    expect(paul?.chatUrl).toBe("https://cutto.cloudketer.dev/dm/paul%40cincel.mx");
    expect(table.rows.find((r) => r.nombre === "Grupo Espinopapa")?.chatUrl).toBe("");
    expect(table.rows.find((r) => r.nombre === "Ana López")?.chatUrl).toBe("");
    expect(table.columns.map((c) => c.key)).toContain("chat");
  });
});

describe("fichaTable", () => {
  it("shows Espacios and Fase actual only when they exist", () => {
    const withData = fichaTable(fixtureSummaryInput()).rows.map((r) => r.campo);
    expect(withData).toContain("Espacios");
    expect(withData).toContain("Fase actual");
    const without = fichaTable(
      fixtureSummaryInput({ spaces: [], taskStats: { total: 0, done: 0, open: 0, overdue: 0, currentPhase: null } })
    ).rows.map((r) => r.campo);
    expect(without).not.toContain("Espacios");
    expect(without).not.toContain("Fase actual");
  });

  it("leaves contract, origin and monday group to admins", () => {
    const admin = fichaTable(fixtureSummaryInput()).rows.map((r) => r.campo);
    expect(admin).toEqual(expect.arrayContaining(["Contrato", "Origen", "Grupo de monday"]));
    const other = fichaTable(fixtureSummaryInput({ showBudget: false })).rows.map((r) => r.campo);
    expect(other).not.toContain("Contrato");
    expect(other).not.toContain("Origen");
    expect(other).not.toContain("Grupo de monday");
  });
});

describe("buildProjectSummary", () => {
  it("builds the budget only for admins", () => {
    const admin = buildProjectSummary(fixtureSummaryInput());
    expect(admin.budget?.[0]).toMatchObject({ real: 64 });
    expect(admin.budget?.[0].sublabel).toContain("de");
    expect(admin.budgetTable?.rows).toHaveLength(2);
    expect(admin.avance[0].budgetPct).toBe(64);
    expect(admin.kpis.map((k) => k.key)).toContain("presupuesto");

    const other = buildProjectSummary(fixtureSummaryInput({ showBudget: false }));
    expect(other.budget).toBeNull();
    expect(other.budgetTable).toBeNull();
    expect(other.avance[0].budgetPct).toBeNull();
    expect(other.kpis.map((k) => k.key)).not.toContain("presupuesto");
  });

  it("uses the portfolio row for avance and the task counts for the caption", () => {
    const data = buildProjectSummary(fixtureSummaryInput());
    expect(data.avance[0]).toMatchObject({ real: PORTFOLIO.real, plan: PORTFOLIO.plan, sublabel: "32 de 39 tareas" });
    expect(data.kpis.find((k) => k.key === "dias-entrega")).toMatchObject({ value: 84, display: "84 d" });
  });

  it("falls back to projects.progress without a portfolio row and omits days to delivery", () => {
    const data = buildProjectSummary(fixtureSummaryInput({ portfolio: null }));
    expect(data.avance[0].real).toBe(70);
    expect(data.kpis.map((k) => k.key)).not.toContain("dias-entrega");
  });

  it("lists recent files newest first and folders in the table", () => {
    const data = buildProjectSummary(fixtureSummaryInput());
    expect(data.recentFiles?.items.map((i) => i.title)).toEqual(["Planta arquitectónica.pdf", "Render fachada.jpg"]);
    expect(data.recentFiles?.items[0].subtitle).toBe("3 nov");
    expect(data.recentFiles?.table.rows[0]).toMatchObject({ nombre: "Planos", tipo: "Carpeta" });
    expect(data.recentFiles?.total).toBe(3);
    expect(buildProjectSummary(fixtureSummaryInput({ files: null })).recentFiles).toBeNull();
  });

  it("has no partidas without a cronograma", () => {
    expect(buildProjectSummary(fixtureSummaryInput({ schedule: null })).partidas).toEqual([]);
  });
});
