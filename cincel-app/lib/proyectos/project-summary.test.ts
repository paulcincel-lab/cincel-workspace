import { describe, expect, it } from "vitest";

import { PORTFOLIO, TRAMOS, fixtureProject, fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";
import type { TaskListItem } from "@/lib/types/core";

import {
  buildProjectSummary,
  contactsTable,
  esencialTramoLine,
  fichaTable,
  monthRange,
  monthYear,
  partidaItems,
  projectMetaLine,
  projectTaskStats,
  recentFileRows,
  relativeWhen,
  shortDate,
  nextTramoHint,
  RESUMEN_NO_TRAMO,
  startedTramos,
  teamLine,
  tramoSteps,
  type TramoProgress,
} from "./project-summary";
import {
  loadToneOf,
  resumenKpis,
  sCurveGapStart,
  taskGroupsByTramo,
  tareasCsvFilename,
  teamLoadRows,
  tramoPhaseGroups,
} from "./project-summary";
import { PHASES_BY_TRAMO, fixtureTaskRow } from "@/tests/unit/fixtures/project-summary";
import {
  activityItems,
  nextTasks,
  statusCounts,
  teamLoadCards,
  tramoProgress as visualTramoProgress,
} from "./project-summary";
import { HISTORY_EVENTS, TASK_ROWS } from "@/tests/unit/fixtures/project-summary";
import type { HistoryEvent } from "@/lib/types/core";
import type { TaskListRow } from "@/lib/types/core";

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

  it("counts done, open and overdue and picks the first fase of the current etapa", () => {
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
    expect(stats).toEqual({ total: 4, done: 1, open: 3, overdue: 1, currentPhase: "Obra negra", currentPhaseId: "f1" });
  });

  it("has no fase when no open task carries one", () => {
    expect(projectTaskStats([task({})], "2026-11-06", null).currentPhase).toBeNull();
  });
});

// #1043: a project created with "Ninguno" (no tramo) or started directly in Diseño.
const [PRESALE_REF, DISENO_REF, CONSTRUCCION_REF] = TRAMOS;
const noTramoProject = () =>
  fixtureProject({ needsTramo: true, currentWorkflowId: null, currentWorkflow: null, tramos: [], stages: [] });
const disenoProject = () =>
  fixtureProject({
    currentWorkflowId: DISENO_REF!.id,
    currentWorkflow: DISENO_REF!,
    tramos: [{ ...DISENO_REF!, startedAt: "2026-06-01T00:00:00.000Z", closedAt: null, current: true }],
    stages: [DISENO_REF!],
  });

describe("startedTramos / nextTramoHint", () => {
  it("lists only the started etapas, in catalog order", () => {
    expect(startedTramos(TRAMOS, fixtureProject()).map((t) => t.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(startedTramos(TRAMOS, disenoProject()).map((t) => t.key)).toEqual(["diseno"]);
    expect(startedTramos(TRAMOS, noTramoProject())).toEqual([]);
  });

  it("hints the next etapa only when a readiness rule waits on the current one", () => {
    expect(nextTramoHint(TRAMOS, disenoProject())?.key).toBe("construccion");
    // Construcción is current; Decoración has no readiness rule.
    expect(nextTramoHint(TRAMOS, fixtureProject())).toBeNull();
    expect(nextTramoHint(TRAMOS, noTramoProject())).toBeNull();
    const presaleOnly = fixtureProject({
      tramos: [{ ...PRESALE_REF!, startedAt: "2026-04-06T00:00:00.000Z", closedAt: null, current: true }],
    });
    expect(nextTramoHint(TRAMOS, presaleOnly)?.key).toBe("diseno");
    // Never an earlier tramo, and never one already started.
    const both = fixtureProject({
      tramos: [
        { ...DISENO_REF!, startedAt: "2026-06-01T00:00:00.000Z", closedAt: null, current: true },
        { ...CONSTRUCCION_REF!, startedAt: "2026-07-01T00:00:00.000Z", closedAt: null, current: false },
      ],
    });
    expect(nextTramoHint(TRAMOS, both)).toBeNull();
  });
});

describe("tramoSteps", () => {
  it("marks closed etapas done and the current one current, only for started etapas, with ranges", () => {
    const steps = tramoSteps(fixtureProject(), TRAMOS, "2026-11-06");
    expect(steps.map((s) => [s.label, s.state, s.range])).toEqual([
      ["Presale", "done", "abr – may"],
      ["Diseño", "done", "jun"],
      ["Construcción", "current", "desde jul"],
    ]);
    expect(steps[2].durationDays).toBe(128);
  });

  it("has no steps without a started etapa, and no earlier etapas when started later", () => {
    expect(tramoSteps(noTramoProject(), TRAMOS, "2026-11-06")).toEqual([]);
    expect(tramoSteps(disenoProject(), TRAMOS, "2026-11-06").map((s) => [s.label, s.state])).toEqual([["Diseño", "current"]]);
  });

  it("falls back to the started etapas without a catalog", () => {
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
      fixtureSummaryInput({ spaces: [], taskStats: { total: 0, done: 0, open: 0, overdue: 0, currentPhase: null, currentPhaseId: null } })
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

describe("esencialTramoLine", () => {
  const progress: TramoProgress[] = [
    { tramoId: "w-presale", key: "presale", label: "Presale", state: "done", pct: 100, open: 0, overdue: 0, total: 4, startsOn: null },
    { tramoId: "w-diseno", key: "diseno", label: "Diseño", state: "done", pct: 95, open: 1, overdue: 1, total: 20, startsOn: null },
    {
      tramoId: "w-construccion",
      key: "construccion",
      label: "Construcción",
      state: "current",
      pct: 42,
      open: 6,
      overdue: 3,
      total: 15,
      startsOn: "2026-07-03",
    },
    { tramoId: "w-decoracion", key: "decoracion", label: "Decoración", state: "next", pct: 0, open: 2, overdue: 0, total: 2, startsOn: "2027-01-12" },
  ];
  // Decoración started (planned, not current) so its "next" detail shows.
  const withDecoracion = () =>
    fixtureSummaryInput({
      project: fixtureProject({
        tramos: [
          ...fixtureProject().tramos,
          { ...TRAMOS[3]!, startedAt: null, closedAt: null, current: false },
        ],
      }),
    });

  it("details per state (done with overdue, current fase index, next start month)", () => {
    const line = esencialTramoLine(withDecoracion(), progress);
    expect(line.title).toBe("En Construcción · Obra negra");
    expect(line.real).toBe(82);
    expect(line.steps.map((s) => [s.state, s.detail])).toEqual([
      ["done", "100 %"],
      ["done", "95 % · 1 vencida"],
      ["current", "fase 2 de 3"],
      ["next", "inicia ene"],
    ]);
    expect(line.next).toBeNull();
    expect(line.ariaLabel).toBe(
      "Etapas: Presale terminado 100 %, Diseño terminado 95 %, 1 vencida, Construcción en curso fase 2 de 3, Decoración inicia enero",
    );
  });

  it("leaves out etapas the project never started", () => {
    const line = esencialTramoLine(fixtureSummaryInput(), progress);
    expect(line.steps.map((s) => s.key)).toEqual(["presale", "diseno", "construccion"]);
  });

  it("started in Diseño: only Diseño, plus the Siguiente: Construcción hint", () => {
    const line = esencialTramoLine(fixtureSummaryInput({ project: disenoProject() }), [
      { ...progress[1]!, state: "current" },
    ]);
    expect(line.steps.map((s) => [s.key, s.state])).toEqual([["diseno", "current"]]);
    expect(line.next).toEqual({ key: "construccion", label: "Construcción" });
    expect(line.ariaLabel).toContain("siguiente Construcción");
  });

  it("uses the fase id and the catalog order, not the name", () => {
    const input = fixtureSummaryInput({
      taskStats: { total: 1, done: 0, open: 1, overdue: 0, currentPhase: "Renamed", currentPhaseId: "f-acabados" },
      phasesByTramo: {
        "w-construccion": [
          { id: "f-acabados", name: "Acabados", sortOrder: 3 },
          { id: "f-preliminares", name: "Preliminares", sortOrder: 1 },
        ],
      },
    });
    expect(esencialTramoLine(input, progress).steps[2]!.detail).toBe("fase 2 de 2");
  });

  it("reads 'sin iniciar' for a next etapa without dates and pluralizes vencidas", () => {
    const line = esencialTramoLine(withDecoracion(), [
      { ...progress[0]!, overdue: 2 },
      progress[2]!,
      { ...progress[3]!, startsOn: null },
    ]);
    expect(line.steps[0]!.detail).toBe("100 % · 2 vencidas");
    expect(line.steps[2]!.detail).toBe("sin iniciar");
  });

  it("no started etapa: no steps, no hint, the empty-state copy", () => {
    const line = esencialTramoLine(fixtureSummaryInput({ project: noTramoProject() }), progress);
    expect(line.steps).toEqual([]);
    expect(line.next).toBeNull();
    expect(line.title).toBe(RESUMEN_NO_TRAMO);
    expect(line.ariaLabel).toBe(RESUMEN_NO_TRAMO);
  });

  it("started etapas but none current reads Sin etapa asignada", () => {
    const project = fixtureProject({
      needsTramo: true,
      currentWorkflowId: null,
      currentWorkflow: null,
      tramos: fixtureProject().tramos.map((t) => ({ ...t, current: false, closedAt: t.closedAt ?? "2026-10-01T00:00:00.000Z" })),
    });
    const line = esencialTramoLine(fixtureSummaryInput({ project }), []);
    expect(line.title).toBe("Sin etapa asignada");
    expect(line.steps.map((s) => s.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(line.steps.every((s) => s.state === "next" && s.detail === "")).toBe(true);
  });
});

describe("recentFileRows", () => {
  const now = new Date("2026-11-06T18:00:00.000Z");

  it("skips folders, newest first, extension label, null when Drive unreadable", () => {
    const files = fixtureSummaryInput().files!;
    const extra = [
      { ...files[1]!, id: "f3", name: "Presupuesto", mimeType: "application/vnd.google-apps.spreadsheet", modifiedAt: "2026-11-05T09:00:00.000Z" },
      { ...files[1]!, id: "f4", name: "Plano cocina.dwg", mimeType: "application/acad", modifiedAt: "2026-10-01T09:00:00.000Z" },
    ];
    const rows = recentFileRows([...files, ...extra], now, 3)!;
    expect(rows.map((r) => r.id)).toEqual(["f3", "f1", "f2"]);
    expect(rows.map((r) => r.ext)).toEqual(["XLSX", "PDF", "JPG"]);
    expect(rows[1]!.href).toBe("https://drive.google.com/file/d/f1/view");
    expect(rows[1]!.when).toBe(relativeWhen("2026-11-03T09:00:00.000Z", now));
    expect(recentFileRows(null, now, 3)).toBeNull();
    expect(recentFileRows([files[0]!], now, 3)).toEqual([]);
  });
});

describe("teamLine", () => {
  it("responsable and singular persona", () => {
    const team = teamLine(fixtureProject());
    expect(team.avatars.map((a) => a.initials)).toEqual(["PL", "AR", "AL"]);
    expect(team.overflow).toBe(0);
    expect(team.text).toBe("Responsable: Paul Langarica · 3 personas");

    const solo = teamLine(fixtureProject({ coordinator: null, members: [] }));
    expect(solo.text).toBe("Responsable: Paul Langarica · 1 persona");

    const none = teamLine(fixtureProject({ manager: null, coordinator: null }));
    expect(none.text).toBe("Sin responsable · 2 personas");
  });

  it("shows five avatars and the overflow", () => {
    const members = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `Persona ${i}`, role: null, active: true }));
    const team = teamLine(fixtureProject({ members }));
    expect(team.avatars).toHaveLength(5);
    expect(team.overflow).toBe(3);
  });
});

// ── Analítico (#997) ─────────────────────────────────────────────────────────

describe("Resumen Analítico", () => {
  const TODAY = "2026-11-06";
  const [, DISENO, CONSTRUCCION] = TRAMOS;
  const OBRA = { id: "f-obra-negra", name: "Obra negra", sortOrder: 2 };
  const ACABADOS = { id: "f-acabados", name: "Acabados", sortOrder: 3 };
  const EJECUTIVO = { id: "f-ejecutivo", name: "Proyecto ejecutivo", sortOrder: 2 };
  const ANA = { id: "s3", name: "Ana López" };

  const tasks: TaskListRow[] = [
    fixtureTaskRow("a", { phaseId: OBRA.id, phase: OBRA, status: "en_proceso", commitmentDate: "2026-10-27", createdAt: "2026-07-01T10:00:00.000Z" }),
    fixtureTaskRow("b", {
      phaseId: OBRA.id,
      phase: OBRA,
      status: "completado",
      commitmentDate: "2026-10-01",
      closedAt: "2026-10-02T10:00:00.000Z",
      createdAt: "2026-07-03T10:00:00.000Z",
    }),
    fixtureTaskRow("c", { phaseId: ACABADOS.id, phase: ACABADOS, commitmentDate: "2026-11-20", createdAt: "2026-08-15T10:00:00.000Z" }),
    fixtureTaskRow("d", { status: "bloqueado", title: "Permiso" }),
    fixtureTaskRow("e", {
      workflowId: DISENO!.id,
      workflow: DISENO!,
      phaseId: EJECUTIVO.id,
      phase: EJECUTIVO,
      commitmentDate: "2026-11-01",
      managerId: ANA.id,
      manager: ANA,
    }),
    fixtureTaskRow("archived", { archived: true, commitmentDate: "2026-01-01" }),
    fixtureTaskRow("sub", { parentTaskId: "a", commitmentDate: "2026-01-01" }),
  ];
  const project = fixtureProject();

  describe("tramoPhaseGroups", () => {
    it("counts, pct and current flags per fase; catalog fases with 0 tasks listed", () => {
      const { groups, totals } = tramoPhaseGroups(tasks, TRAMOS, PHASES_BY_TRAMO, project, TODAY);
      // Only the started tramos: Decoración (never started) is left out.
      expect(groups.map((g) => g.id)).toEqual(["w-presale", "w-diseno", "w-construccion"]);
      const construccion = groups.find((g) => g.id === CONSTRUCCION!.id)!;
      expect(construccion.rows!.map((r) => [r.name, r.tasks, r.open, r.overdue, r.pct, r.current])).toEqual([
        ["Preliminares", 0, 0, 0, 0, false],
        ["Obra negra", 2, 1, 1, 50, true],
        ["Acabados", 1, 1, 0, 0, false],
        ["Sin fase", 1, 1, 0, 0, false],
      ]);
      expect(construccion.caption).toBe("4 fases");
      expect(construccion.metrics.map((m) => m.value)).toEqual(["actual", "en curso 25 %", "4 tareas", "1 vencida", "1 bloqueada"]);
      expect(construccion.metrics.find((m) => m.key === "vencidas")?.tone).toBe("destructive");
      expect(totals).toEqual({
        name: "Total · 7 fases",
        tasks: "5",
        open: "4",
        overdue: "2",
        pct: "20 %",
        start: "1 jul",
        endPlan: "20 nov",
        deviationDays: "+10 máx.",
      });
    });

    it("start/end/deviation from task dates; null when undated", () => {
      const { groups } = tramoPhaseGroups(tasks, TRAMOS, PHASES_BY_TRAMO, project, TODAY);
      const rows = groups.find((g) => g.id === CONSTRUCCION!.id)!.rows!;
      const obra = rows.find((r) => r.phaseId === OBRA.id)!;
      expect([obra.start, obra.endPlan, obra.deviationDays]).toEqual(["2026-07-01", "2026-10-27", 10]);
      const acabados = rows.find((r) => r.phaseId === ACABADOS.id)!;
      expect([acabados.start, acabados.endPlan, acabados.deviationDays]).toEqual(["2026-08-15", "2026-11-20", 0]);
      const sinFase = rows.find((r) => r.phaseId === null)!;
      expect([sinFase.start, sinFase.endPlan, sinFase.deviationDays]).toEqual([null, null, null]);

      // A finished fase: the last close against the latest commitment date.
      const done = tramoPhaseGroups(
        [
          fixtureTaskRow("x", {
            phaseId: OBRA.id,
            phase: OBRA,
            status: "completado",
            commitmentDate: "2026-09-01",
            closedAt: "2026-09-04T12:00:00.000Z",
          }),
        ],
        TRAMOS,
        PHASES_BY_TRAMO,
        project,
        TODAY,
      ).groups.find((g) => g.id === CONSTRUCCION!.id)!.rows!;
      expect(done.find((r) => r.phaseId === OBRA.id)!.deviationDays).toBe(3);
    });

    it("no started etapa: no groups; started in Diseño: only Diseño's fases", () => {
      expect(tramoPhaseGroups(tasks, TRAMOS, PHASES_BY_TRAMO, noTramoProject(), TODAY).groups).toEqual([]);
      const { groups } = tramoPhaseGroups(tasks, TRAMOS, PHASES_BY_TRAMO, disenoProject(), TODAY);
      expect(groups.map((g) => g.id)).toEqual(["w-diseno"]);
      expect(groups[0]!.rows!.map((r) => r.name)).toEqual(
        (PHASES_BY_TRAMO["w-diseno"] ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.name),
      );
    });

    it("closed etapa with open tasks says cerrado con n pendiente", () => {
      const { groups } = tramoPhaseGroups(tasks, TRAMOS, PHASES_BY_TRAMO, project, TODAY);
      const diseno = groups.find((g) => g.id === DISENO!.id)!;
      const estado = diseno.metrics.find((m) => m.key === "estado")!;
      expect(estado.value).toBe("cerrado con 1 pendiente");
      expect(estado.tone).toBe("warning");
      expect(diseno.rows!.find((r) => r.phaseId === EJECUTIVO.id)!.deviationDays).toBe(5);
      expect(groups.find((g) => g.id === "w-presale")!.metrics.find((m) => m.key === "estado")!.value).toBe("cerrado 0 %");
    });
  });

  describe("taskGroupsByTramo", () => {
    it("ordering of groups and rows; Sin fase bucket", () => {
      const { groups, totals } = taskGroupsByTramo(tasks, TRAMOS, project, TODAY);
      // Overdue groups first by days late (10 > 5), then catalog order; Decoración
      // (never started, no tasks) gets no group.
      expect(groups.map((g) => g.id)).toEqual(["w-construccion", "w-diseno", "w-presale"]);
      const construccion = groups[0]!;
      expect(construccion.rows!.map((r) => r.id)).toEqual(["a", "c", "d", "b"]);
      expect(construccion.rows!.find((r) => r.id === "d")!.phase).toBeNull();
      expect(construccion.rows!.find((r) => r.id === "a")!.daysLate).toBe(10);
      expect(construccion.rows!.find((r) => r.id === "b")!.done).toBe(true);
      expect(construccion.caption).toBe("4 tareas");
      expect(construccion.metrics.map((m) => m.value)).toEqual(["1 vencida · 10 d", "bloqueada"]);
      expect(groups[2]!.rows).toEqual([]);
      expect(totals).toEqual({ title: "Total · 5 tareas", daysLate: "15" });
    });

    it("puts tasks without a etapa in Administración", () => {
      const { groups } = taskGroupsByTramo(
        [fixtureTaskRow("adm", { kind: "admin", workflowId: null, workflow: null })],
        TRAMOS,
        project,
        TODAY,
      );
      expect(groups[groups.length - 1]!.label).toBe("Administración");
    });

    it("only started etapas get a group when empty; a etapa not started shows only with tasks", () => {
      expect(taskGroupsByTramo([], TRAMOS, noTramoProject(), TODAY).groups).toEqual([]);
      const { groups } = taskGroupsByTramo(
        [fixtureTaskRow("dec", { workflowId: "w-decoracion", workflow: TRAMOS.find((t) => t.id === "w-decoracion")! })],
        TRAMOS,
        disenoProject(),
        TODAY,
      );
      expect(groups.map((g) => g.id)).toEqual(["w-diseno", "w-decoracion"]);
    });
  });

  describe("resumenKpis", () => {
    it("deltas and the 4-column variant without budget", () => {
      const input = fixtureSummaryInput({ today: TODAY });
      const items = resumenKpis(input, tasks);
      expect(items.map((i) => i.key)).toEqual(["avance", "abiertas", "vencidas", "retraso", "presupuesto"]);
      const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
      expect(byKey.avance).toMatchObject({ value: "82 %", delta: { label: "-3 pts vs plan (85 %)", tone: "bad" } });
      expect(byKey.abiertas).toMatchObject({ value: 4, secondary: "de 5", delta: { label: "-3 esta semana" } });
      expect(byKey.vencidas).toMatchObject({
        value: 2,
        secondary: "· 50 %",
        tone: "destructive",
        delta: { label: "+2 vs semana pasada", tone: "bad" },
      });
      expect(byKey.retraso).toMatchObject({ value: "7.5 d", delta: { label: "sin cambio" } });
      expect(byKey.presupuesto).toMatchObject({ value: "64 %", delta: { label: "18 pts bajo el avance", tone: "good" } });

      const restricted = resumenKpis(fixtureSummaryInput({ today: TODAY, showBudget: false }), tasks);
      expect(restricted.map((i) => i.key)).toEqual(["avance", "abiertas", "vencidas", "retraso"]);

      const withDelay = resumenKpis(
        fixtureSummaryInput({ today: TODAY, portfolio: { ...PORTFOLIO, avgDelayDays: 6.3, avgDelayWeekAgo: 4.1 } }),
        tasks,
      );
      expect(withDelay.find((i) => i.key === "retraso")).toMatchObject({ value: "6.3 d", delta: { label: "+2.2 d", tone: "bad" } });

      const noSchedule = resumenKpis(fixtureSummaryInput({ today: TODAY, schedule: null }), tasks);
      expect(noSchedule[0]!.delta).toBeUndefined();
    });
  });

  describe("teamLoadRows", () => {
    it("tone thresholds from OCCUPANCY_HEAT, sorted by load", () => {
      expect([59, 60, 89, 90].map(loadToneOf)).toEqual(["ok", "warn", "warn", "critical"]);
      const rows = teamLoadRows(fixtureSummaryInput({ today: TODAY }), tasks);
      expect(rows.map((r) => [r.staffId, r.loadPct, r.tone, r.here, r.overdueHere])).toEqual([
        ["s1", 92, "critical", 3, 1],
        ["s2", 60, "warn", 0, 0],
        ["s3", 40, "ok", 1, 1],
      ]);
      expect(rows[0]!.context).toBe("Construcción · responsable");
      expect(rows[1]!.context).toBe("coordinación");
      expect(rows[2]!.context).toBe("Diseño");
    });
  });

  describe("sCurveGapStart", () => {
    it("first week with gap ≥ 3 pts, null when never", () => {
      const points = [
        { weekStart: "2026-07-06", planned: 10, real: 9, pagos: 0 },
        { weekStart: "2026-07-13", planned: 20, real: 17, pagos: 0 },
        { weekStart: "2026-07-20", planned: 30, real: null, pagos: 0 },
      ];
      expect(sCurveGapStart(points)).toBe("2026-07-13");
      expect(sCurveGapStart(points, 5)).toBeNull();
      expect(sCurveGapStart([])).toBeNull();
    });
  });

  it("names the CSV after the project and the day", () => {
    expect(tareasCsvFilename("Local Espiñopapa · CDMX", TODAY)).toBe("local-espinopapa-cdmx-tareas-2026-11-06.csv");
  });
});

// ── Visual Resumen derivations (#995) ───────────────────────────────────────

describe("statusCounts", () => {
  it("counts parents only in fixed order", () => {
    expect(statusCounts(TASK_ROWS)).toEqual([
      { status: "en_proceso", label: "En proceso", count: 1 },
      { status: "pendiente", label: "Pendiente", count: 3 },
      { status: "bloqueado", label: "Bloqueado", count: 1 },
      { status: "completado", label: "Completado", count: 3 },
    ]);
    const archived = fixtureTaskRow("t-archived", { archived: true, status: "pendiente" });
    expect(statusCounts([archived]).every((c) => c.count === 0)).toBe(true);
  });
});

describe("tramoProgress", () => {
  it("done/total per etapa, states from project.tramos, startsOn from the earliest commitment date", () => {
    const rows = visualTramoProgress(TASK_ROWS, TRAMOS, fixtureProject(), "2026-11-06");
    expect(rows.map((r) => [r.key, r.state, r.pct, r.open, r.overdue, r.total, r.startsOn])).toEqual([
      ["presale", "done", 100, 0, 0, 1, "2026-04-06"],
      ["diseno", "done", 50, 1, 0, 2, "2026-06-01"],
      ["construccion", "current", 25, 3, 1, 4, "2026-07-01"],
    ]);
  });

  it("0 % for a etapa without tasks; started etapas only, with or without a catalog", () => {
    const rows = visualTramoProgress([], TRAMOS, fixtureProject(), "2026-11-06");
    expect(rows.map((r) => r.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(rows.at(-1)).toMatchObject({ key: "construccion", state: "current", pct: 0, total: 0 });
    expect(visualTramoProgress(TASK_ROWS, TRAMOS, noTramoProject(), "2026-11-06")).toEqual([]);
    expect(visualTramoProgress([], [], fixtureProject(), "2026-11-06").map((r) => r.key)).toEqual([
      "presale",
      "diseno",
      "construccion",
    ]);
  });
});

describe("nextTasks", () => {
  it("blocked and overdue first by days late, then by date; limit", () => {
    const next = nextTasks(TASK_ROWS, "2026-11-06", 4);
    expect(next.map((t) => t.id)).toEqual(["t-obra-1", "t-obra-2", "t-obra-3", "t-diseno-2"]);
    expect(next[0]).toMatchObject({ daysLate: 10, blocked: false, tramoKey: "construccion", subtasks: { done: 2, total: 4 } });
    expect(next[1]).toMatchObject({ daysLate: 0, blocked: true, responsable: { id: "s2", name: "Alejandro Riofrio" } });
    expect(nextTasks(TASK_ROWS, "2026-11-06", 10)).toHaveLength(5);
    // Undated tasks go last among the non-urgent ones.
    const undated = fixtureTaskRow("t-undated", { status: "pendiente" });
    expect(nextTasks([undated, ...TASK_ROWS], "2026-11-06", 10).at(-1)?.id).toBe("t-undated");
  });
});

describe("activityItems", () => {
  const now = new Date("2026-11-06T18:00:00.000Z");
  const base: HistoryEvent = { ...HISTORY_EVENTS[0]!, kind: "cambio", comment: null };

  it("maps comentario, status change, completion and etapa move to verbs", () => {
    const items = activityItems(
      [
        HISTORY_EVENTS[0]!,
        { ...base, id: "s-blocked", field: "status", beforeValue: "activo", afterValue: "bloqueado" },
        { ...base, id: "s-done", field: "status", beforeValue: "activo", afterValue: "completado" },
        HISTORY_EVENTS[1]!,
        { ...base, id: "start", field: "tramo_started", afterValue: "decoracion: 3" },
      ],
      TRAMOS,
      now,
      10,
    );
    expect(items.map((i) => [i.verb, i.object, i.objectTone])).toEqual([
      ["comentó en", "el proyecto", "default"],
      ["marcó el proyecto como", "Bloqueado", "destructive"],
      ["completó", "el proyecto", "default"],
      ["movió el proyecto a", "Construcción", "tramo"],
      ["inició", "Decoración", "tramo"],
    ]);
    expect(items[0]).toMatchObject({ actor: { name: "Paul Langarica" }, when: "hace 2 h" });
    expect(items[3]).toMatchObject({ tramoKey: "construccion", tramoLabel: null });
    expect(items[4]).toMatchObject({ tramoKey: "decoracion", tramoLabel: "Decoración" });
    expect(activityItems(HISTORY_EVENTS, TRAMOS, now, 1)).toHaveLength(1);
  });
});

describe("relativeWhen", () => {
  const now = new Date("2026-11-06T18:00:00.000Z"); // 12:00 in Mexico City

  it("hace n h, ayer, weekday date, short date", () => {
    expect(relativeWhen("2026-11-06T16:00:00.000Z", now)).toBe("hace 2 h");
    expect(relativeWhen("2026-11-06T17:50:00.000Z", now)).toBe("hace 1 h");
    expect(relativeWhen("2026-11-05T18:00:00.000Z", now)).toBe("ayer");
    // 21:00 of the 5th in Mexico City, though the 6th in UTC.
    expect(relativeWhen("2026-11-06T03:00:00.000Z", now)).toBe("ayer");
    expect(relativeWhen("2026-11-03T15:00:00.000Z", now)).toBe("mar 3 nov");
    expect(relativeWhen("2026-10-20T15:00:00.000Z", now)).toBe("20 oct");
    expect(relativeWhen("not a date", now)).toBe("");
  });
});

describe("teamLoadCards", () => {
  it("joins the team with its load and this project's overdue and blocked tasks", () => {
    const cards = teamLoadCards(fixtureSummaryInput(), TASK_ROWS);
    expect(cards.map((c) => [c.id, c.loadPct, c.overdueHere, c.blockedHere, c.tramoKey])).toEqual([
      ["s1", 92, 1, 0, "construccion"],
      ["s2", 60, 0, 1, "construccion"],
      ["s3", 40, 0, 0, "diseno"],
    ]);
    expect(cards[0]!.initials).toBe("PL");
    expect(teamLoadCards(fixtureSummaryInput({ teamLoad: {} }), [])[0]!.loadPct).toBe(0);
  });
});
