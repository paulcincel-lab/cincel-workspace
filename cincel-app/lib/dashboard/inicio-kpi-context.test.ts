import { describe, expect, it } from "vitest";

import {
  KPI_CONTEXT,
  nextReviewLine,
  projectTramoGroup,
  taskTramoGroup,
  tramoConcentrationLine,
  tramoCountsLine,
} from "./inicio";

const TODAY = "2026-11-07";

const wf = (key: string, name: string, sortOrder: number) => ({ id: `wf-${key}`, key, name, sortOrder });
const PRESALE = wf("presale", "Presale", 1);
const DISENO = wf("diseno", "Diseño", 2);
const CONSTRUCCION = wf("construccion", "Construcción", 3);
const DECORACION = wf("decoracion", "Decoración", 4);

type TaskLike = Parameters<typeof taskTramoGroup>[0];
const task = (workflow: TaskLike["workflow"], kind: TaskLike["kind"] = "workflow"): TaskLike => ({ kind, workflow });
const project = (currentWorkflow: Parameters<typeof projectTramoGroup>[0]["currentWorkflow"]) => ({ currentWorkflow });

describe("tramoCountsLine (Proyectos activos)", () => {
  it("lists the count per área in tramo order, as in the canvas", () => {
    const projects = [
      project(CONSTRUCCION),
      project(PRESALE),
      project(DECORACION),
      project(DISENO),
      project(PRESALE),
      project(CONSTRUCCION),
    ];
    expect(tramoCountsLine(projects, projectTramoGroup, KPI_CONTEXT.noActiveProjects)).toBe(
      "Por área: Presale 2 · Diseño 1 · Construcción 2 · Decoración 1",
    );
  });

  it("puts projects without a tramo last", () => {
    expect(tramoCountsLine([project(null), project(DISENO)], projectTramoGroup, KPI_CONTEXT.noActiveProjects)).toBe(
      "Por área: Diseño 1 · Sin tramo 1",
    );
  });

  it("reads the empty copy without projects", () => {
    expect(tramoCountsLine([], projectTramoGroup, KPI_CONTEXT.noActiveProjects)).toBe("Sin proyectos activos");
  });
});

describe("tramoConcentrationLine (Vencidas, Bloqueadas)", () => {
  it("names the área with the most items out of the total", () => {
    const tasks = [
      ...Array.from({ length: 5 }, () => task(PRESALE)),
      ...Array.from({ length: 8 }, () => task(DISENO)),
      ...Array.from({ length: 14 }, () => task(CONSTRUCCION)),
      ...Array.from({ length: 4 }, () => task(DECORACION)),
    ];
    expect(tramoConcentrationLine(tasks, taskTramoGroup, KPI_CONTEXT.noOverdue)).toBe(
      "Construcción concentra 14 de 31",
    );
  });

  it("breaks ties by tramo order and counts tasks without tramo in the total", () => {
    const tasks = [task(DISENO), task(PRESALE), task(null), task(null, "admin")];
    expect(tramoConcentrationLine(tasks, taskTramoGroup, KPI_CONTEXT.noBlocked)).toBe("Presale concentra 1 de 4");
  });

  it("reads the empty copy with nothing to count", () => {
    expect(tramoConcentrationLine([], taskTramoGroup, KPI_CONTEXT.noBlocked)).toBe("Nada bloqueado hoy");
    expect(tramoConcentrationLine([], taskTramoGroup, KPI_CONTEXT.noOverdue)).toBe("Nada vencido hoy");
  });
});

describe("nextReviewLine (Revisiones · 7 días)", () => {
  it("reads \"sin agendar\" without a review from today on", () => {
    expect(nextReviewLine([], TODAY)).toBe("Próxima revisión sin agendar");
    expect(nextReviewLine([{ reviewDate: null }, { reviewDate: "2026-11-01" }], TODAY)).toBe(
      "Próxima revisión sin agendar",
    );
  });

  it("names the earliest upcoming review", () => {
    expect(
      nextReviewLine([{ reviewDate: "2026-11-20" }, { reviewDate: "2026-11-12" }, { reviewDate: null }], TODAY),
    ).toBe("Próxima revisión 12 nov");
  });

  it("says hoy and mañana for the next two days", () => {
    expect(nextReviewLine([{ reviewDate: TODAY }], TODAY)).toBe("Próxima revisión hoy");
    expect(nextReviewLine([{ reviewDate: "2026-11-08" }], TODAY)).toBe("Próxima revisión mañana");
  });
});
