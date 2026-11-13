import { describe, expect, it } from "vitest";

import { SIN_ETAPA_KEY } from "@/lib/tareas/summary";

import {
  EMPTY_MY_TASKS_COUNTS,
  EMPTY_MY_TASKS_SUMMARY,
  ME_BOARD_FIRST_PAGE,
  ME_ESENCIAL_LIMITS,
  ME_TASKS_PAGE_SIZE,
  meTasksBucketFilters,
  meTasksCommitmentWindow,
  meTasksFirstPageSize,
  meTasksGroupFilters,
  meTasksProjectFilters,
  myTasksSummaryGroups,
  myTasksSummaryInput,
  rowFitsMeList,
  shownMetrics,
  type MyTasksSummary,
} from "./my-tasks-summary";

/** Monday. */
const MONDAY = "2026-11-09";

describe("Mi espacio task filters (#1051)", () => {
  it("summary input: trimmed search, retraso only when on", () => {
    expect(myTasksSummaryInput({ etapa: null, q: "  ", retraso: false })).toEqual({ etapa: null, q: null });
    expect(myTasksSummaryInput({ etapa: "diseno", q: " planos ", retraso: true })).toEqual({ etapa: "diseno", q: "planos", retraso: true });
  });

  it("board columns by commitment date: Hoy holds the overdue ones, Después the undated ones", () => {
    expect(meTasksCommitmentWindow(meTasksBucketFilters("hoy"), MONDAY)).toEqual({ to: MONDAY });
    expect(meTasksCommitmentWindow(meTasksBucketFilters("semana"), MONDAY)).toEqual({ from: "2026-11-10", to: "2026-11-15" });
    expect(meTasksCommitmentWindow(meTasksBucketFilters("despues"), MONDAY)).toEqual({ from: "2026-11-16", orUndated: true });
    // Sunday: Esta semana is empty.
    expect(meTasksCommitmentWindow(meTasksBucketFilters("semana"), "2026-11-15")).toEqual({ from: "2026-11-16", to: "2026-11-15" });
    expect(meTasksCommitmentWindow({ retraso: true }, MONDAY)).toEqual({ to: "2026-11-08" });
    expect(meTasksCommitmentWindow({}, MONDAY)).toBeUndefined();
  });

  it("first page: 5 cards per column, 4 rows per Esencial card, 30 elsewhere", () => {
    expect(meTasksFirstPageSize(meTasksBucketFilters("hoy"))).toBe(ME_BOARD_FIRST_PAGE);
    expect(meTasksFirstPageSize(meTasksProjectFilters("p1"))).toBe(ME_ESENCIAL_LIMITS.perProject);
    expect(meTasksFirstPageSize(meTasksGroupFilters({ etapa: null, q: null }, "p1", "diseno", false))).toBe(ME_TASKS_PAGE_SIZE);
  });

  it("group filters: project, etapa (Sin etapa key), search, closed only outside En retraso", () => {
    expect(meTasksGroupFilters({ etapa: null, q: "x" }, "p1", null, true)).toEqual({
      proyecto: "p1",
      etapa: SIN_ETAPA_KEY,
      q: "x",
      cerradas: true,
      orderBy: "retraso",
    });
    expect(meTasksGroupFilters({ etapa: null, q: null, retraso: true }, "p1", "diseno", true)).toEqual({
      proyecto: "p1",
      etapa: "diseno",
      retraso: true,
      orderBy: "retraso",
    });
  });

  it("rowFitsMeList: project, etapa and column; search and En retraso wait for the refetch", () => {
    const row = { projectId: "p1", workflow: { key: "diseno" }, commitmentDate: "2026-11-12" };
    expect(rowFitsMeList(meTasksBucketFilters("semana"), row, MONDAY)).toBe(true);
    expect(rowFitsMeList(meTasksBucketFilters("hoy"), row, MONDAY)).toBe(false);
    expect(rowFitsMeList(meTasksBucketFilters("despues"), { ...row, commitmentDate: null }, MONDAY)).toBe(true);
    expect(rowFitsMeList(meTasksProjectFilters("p1"), row, MONDAY)).toBe(true);
    expect(rowFitsMeList(meTasksProjectFilters("p2"), row, MONDAY)).toBe(false);
    expect(rowFitsMeList({ proyecto: "p1", etapa: SIN_ETAPA_KEY }, row, MONDAY)).toBe(false);
    expect(rowFitsMeList({ proyecto: "p1", etapa: "diseno", q: "x" }, row, MONDAY)).toBe(false);
  });
});

describe("Analítico groups from the summary", () => {
  const counts = (over: Partial<typeof EMPTY_MY_TASKS_COUNTS>) => ({ ...EMPTY_MY_TASKS_COUNTS, ...over });
  const SUMMARY: MyTasksSummary = {
    ...EMPTY_MY_TASKS_SUMMARY,
    today: MONDAY,
    projects: [
      {
        project: { id: "p1", name: "Casa Lomas" },
        ...counts({ open: 3, overdue: 1, blocked: 1, daysLateSum: 5, maxDaysLate: 5, closed: 2 }),
        etapas: [
          { etapa: { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 }, ...counts({ open: 1 }) },
          {
            etapa: { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 },
            ...counts({ open: 2, overdue: 1, blocked: 1, daysLateSum: 5, maxDaysLate: 5, closed: 2 }),
          },
        ],
      },
      {
        project: { id: "p2", name: "Torre Sur" },
        ...counts({ closed: 1 }),
        etapas: [{ etapa: { id: null, key: null, name: "Sin etapa", sortOrder: 2147483647 }, ...counts({ closed: 1 }) }],
      },
    ],
  };

  it("captions and metrics count every task, the rows are what loaded", () => {
    const groups = myTasksSummaryGroups(SUMMARY, { withClosed: false, rowsOf: () => undefined });
    expect(groups.map((g) => g.label)).toEqual(["Casa Lomas"]);
    const [lomas] = groups;
    expect(lomas!.caption).toBe("3 tareas");
    expect(lomas!.metrics[0]).toMatchObject({ value: "1 vencida · 5 d", tone: "destructive" });
    expect(lomas!.children!.map((c) => c.label)).toEqual(["Presale", "Diseño"]);
    const diseno = lomas!.children![1]!;
    expect(diseno.caption).toBe("2 · 1 vencida · bloqueada");
    expect(diseno).toMatchObject({ loading: true, rows: [], remaining: undefined });
  });

  it("closed tasks shown: groups grow, a project with only closed ones appears", () => {
    const rows = [{ id: "a" }, { id: "b" }] as never[];
    const groups = myTasksSummaryGroups(SUMMARY, { withClosed: true, rowsOf: (id) => (id === "p1:w-dis" ? rows : undefined) });
    expect(groups.map((g) => g.label)).toEqual(["Casa Lomas", "Torre Sur"]);
    expect(groups[0]!.caption).toBe("5 tareas");
    expect(groups[0]!.children![1]).toMatchObject({ caption: "4 · 1 vencida · bloqueada", loading: false, remaining: 2 });
    expect(groups[1]!.children![0]!.label).toBe("Sin etapa");
    expect(groups[1]!.metrics[0]!.value).toBe("0 vencidas");
  });

  it("shownMetrics: overdue percent and average days late", () => {
    expect(shownMetrics({ ...counts({ open: 5, overdue: 2, daysLateSum: 7 }), projects: 2 })).toEqual({ overduePct: 40, avgDaysLate: 3.5 });
    expect(shownMetrics({ ...EMPTY_MY_TASKS_COUNTS, projects: 0 })).toEqual({ overduePct: 0, avgDaysLate: 0 });
  });
});
