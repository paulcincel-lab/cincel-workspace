import { describe, expect, it } from "vitest";

import {
  esencialTramoLine,
  nextTasks,
  resumenKpis,
  resumenTasks,
  statusCounts,
  taskGroupsByTramo,
  teamLoadCards,
  teamLoadRows,
  tramoPhaseGroups,
  tramoProgress,
} from "@/lib/proyectos/project-summary";
import {
  resumenAvatarTramo,
  resumenGroupListFilters,
  resumenGroupLists,
  resumenHeroCounts,
  resumenKpisOf,
  resumenNextCards,
  resumenPhaseGroups,
  resumenStatusCounts,
  resumenTaskGroups,
  resumenTeamLoadCards,
  resumenTeamLoadRows,
  resumenTramoProgress,
} from "@/lib/proyectos/resumen-summary";
import { dominantTramo } from "@/lib/people/aggregates";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { TaskListRow } from "@/lib/types/core";
import { PHASES_BY_TRAMO, TASK_ROWS, TRAMOS, fixtureSummaryInput, fixtureTaskRow } from "@/tests/unit/fixtures/project-summary";
import { resumenSummaryOfRows } from "@/tests/unit/fixtures/resumen-summary";

const TODAY = "2026-11-06";
const [presale, diseno, construccion] = TRAMOS;
const phase = (tramoId: string, i: number) => PHASES_BY_TRAMO[tramoId]![i]!;

/** The Resumen fixture plus fases, a custom closed status, an admin task, a fase off the catalog and overdue closes. */
const ROWS: TaskListRow[] = [
  ...TASK_ROWS.map((t) =>
    t.id === "t-obra-1"
      ? { ...t, phaseId: "f-obra-negra", phase: phase(construccion!.id, 1) }
      : t.id === "t-obra-3"
        ? { ...t, phaseId: "f-acabados", phase: phase(construccion!.id, 2), createdAt: "2026-08-02T05:00:00.000Z" }
        : t.id === "t-diseno-1"
          ? { ...t, phaseId: "f-ejecutivo", phase: phase(diseno!.id, 1), commitmentDate: "2026-06-20", closedAt: "2026-06-25T10:00:00.000Z" }
          : t,
  ),
  fixtureTaskRow("t-obra-5", {
    status: "pendiente",
    title: "Impermeabilización",
    phaseId: "f-obra-negra",
    phase: phase(construccion!.id, 1),
    commitmentDate: "2026-10-01",
    customStatusId: "cs-cancel",
    customStatus: { id: "cs-cancel", name: "Cancelada", closes: true, countsAsCompleted: false },
    managerId: "s3",
    manager: { id: "s3", name: "Ana López" },
  }),
  fixtureTaskRow("t-obra-6", {
    status: "bloqueado",
    title: "Muro colindante",
    phaseId: "f-old",
    phase: { id: "f-old", name: "Fase retirada", sortOrder: 9 },
    commitmentDate: "2026-11-01",
    managerId: "s2",
    manager: { id: "s2", name: "Alejandro Riofrio" },
  }),
  fixtureTaskRow("t-presale-2", {
    workflowId: presale!.id,
    workflow: presale!,
    phaseId: "f-levantamiento",
    phase: phase(presale!.id, 0),
    status: "en_proceso",
    title: "Visita al sitio",
    commitmentDate: "2026-05-01",
  }),
  fixtureTaskRow("t-admin", { kind: "admin", workflowId: null, workflow: null, status: "pendiente", title: "Pago de licencia", commitmentDate: "2026-10-30" }),
  fixtureTaskRow("t-admin-2", { kind: "admin", workflowId: null, workflow: null, status: "completado", title: "Alta en el SAT", managerId: null, manager: null }),
];

const data = fixtureSummaryInput({ phasesByTramo: PHASES_BY_TRAMO, today: TODAY });
const summary = resumenSummaryOfRows(ROWS, TODAY, { includeAdmin: true });
const strip = <T extends { rows?: unknown }>(groups: T[]) => groups.map(({ rows: _rows, ...g }) => (void _rows, g));

describe("Resumen numbers from the summary match the ones derived from the task rows (#1051)", () => {
  it("Visual: tramo progress, status donut, hero chips, team cards", () => {
    expect(resumenTramoProgress(summary, data.tramoCatalog, data.project)).toEqual(tramoProgress(ROWS, data.tramoCatalog, data.project, TODAY));
    expect(resumenStatusCounts(summary)).toEqual(statusCounts(ROWS));
    const open = nextTasks(ROWS, TODAY, Number.POSITIVE_INFINITY);
    expect(resumenHeroCounts(summary)).toEqual({
      open: open.length,
      overdue: open.filter((t) => t.daysLate > 0).length,
      blocked: statusCounts(ROWS).find((c) => c.status === "bloqueado")!.count,
    });
    expect(resumenTeamLoadCards(data, summary)).toEqual(teamLoadCards(data, ROWS));
  });

  it("Visual: next cards, just-created tasks first", () => {
    expect(resumenNextCards(summary, [], 4)).toEqual(nextTasks(ROWS, TODAY, 4));
    const created = fixtureTaskRow("t-new", { title: "Revisar planos", createdAt: "2026-11-06T17:00:00.000Z" });
    const rows = [...ROWS, created];
    const all = nextTasks(rows, TODAY, Number.POSITIVE_INFINITY);
    const recent = new Set(["t-new"]);
    const expected = [...all.filter((t) => recent.has(t.id)), ...all.filter((t) => !recent.has(t.id))].slice(0, 4);
    expect(resumenNextCards(resumenSummaryOfRows(rows, TODAY), ["t-new"], 4)).toEqual(expected);
  });

  it("Esencial: tramo line and avatar tint", () => {
    expect(esencialTramoLine(data, resumenTramoProgress(summary, data.tramoCatalog, data.project))).toEqual(
      esencialTramoLine(data, tramoProgress(ROWS, data.tramoCatalog, data.project, TODAY)),
    );
    for (const id of ["s1", "s2", "s3"]) {
      expect(resumenAvatarTramo(summary, id)).toBe(dominantTramo(ROWS.filter((t) => t.manager?.id === id).map((t) => t.workflow?.key ?? null)));
    }
  });

  it("Analítico: KPIs, tramos y fases, carga del equipo", () => {
    expect(resumenKpisOf(data, summary)).toEqual(resumenKpis(data, ROWS));
    const noPortfolio = { ...data, portfolio: null };
    expect(resumenKpisOf(noPortfolio, summary)).toEqual(resumenKpis(noPortfolio, ROWS));
    expect(resumenPhaseGroups(summary, data.tramoCatalog, data.phasesByTramo, data.project, TODAY)).toEqual(
      tramoPhaseGroups(ROWS, data.tramoCatalog, data.phasesByTramo, data.project, TODAY),
    );
    expect(resumenTeamLoadRows(data, summary)).toEqual(teamLoadRows(data, ROWS));
  });

  it("Analítico: «Tareas por tramo» groups, with and without «Ocultar completadas»", () => {
    for (const hide of [false, true]) {
      const shownRows = hide ? ROWS.filter((t) => !isTaskClosed(t)) : ROWS;
      const old = taskGroupsByTramo(shownRows, data.tramoCatalog, data.project, TODAY);
      const next = resumenTaskGroups(summary, data.tramoCatalog, data.project, hide);
      expect(next.groups.map(({ id, label, caption, metrics }) => ({ id, label, caption, metrics }))).toEqual(strip(old.groups));
      expect(next.groups.map((g) => g.count)).toEqual(old.groups.map((g) => g.rows!.length));
      expect(next.totals).toEqual(old.totals);
      const live = resumenTasks(shownRows);
      expect(next.shown).toBe(live.length);
      expect(next.open).toBe(live.filter((t) => t.status !== "completado").length);
      expect(next.overdue).toBe(live.filter((t) => t.status !== "completado" && t.commitmentDate !== null && t.commitmentDate < TODAY).length);
      const hidden = Object.fromEntries(next.groups.map((g) => [g.id, g.hidden]));
      for (const g of next.groups) {
        const closed = resumenTasks(ROWS).filter((t) => (t.workflowId ?? "admin") === g.id && isTaskClosed(t)).length;
        expect(hidden[g.id]).toBe(hide ? closed : 0);
      }
    }
  });

  it("group lists: the tramo key, «Sin tramo» with the admin tasks, closed ones left out on the server", () => {
    expect(resumenGroupListFilters("p1", "construccion", { hideCompleted: false, includeAdmin: true })).toEqual({
      tramo: "construccion",
      proyecto: "p1",
      responsable: null,
      estado: null,
      q: null,
      orderBy: "retraso",
    });
    expect(resumenGroupListFilters("p1", null, { hideCompleted: true, includeAdmin: true })).toEqual({
      tramo: "__sin_tramo",
      proyecto: "p1",
      responsable: null,
      estado: null,
      q: null,
      mostrar: "abiertas",
      orderBy: "retraso",
      incluirAdmin: true,
    });
    const lists = resumenGroupLists(data, summary, false);
    // Every group with tasks (Decoración not started still has one), never an empty one.
    expect(lists.map((l) => l.id).sort()).toEqual(["admin", "w-construccion", "w-decoracion", "w-diseno", "w-presale"]);
    expect(resumenGroupLists(data, { ...summary, canViewTasks: false }, false)).toEqual([]);
  });
});
