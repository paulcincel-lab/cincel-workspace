import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

import type { ProjectListItem } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

import {
  ALL_TRAMOS_KEY,
  DEFAULT_PORTFOLIO_FILTERS,
  NO_TRAMO_KEY,
  PORTFOLIO_HEAT,
  applyPortfolioFilters,
  esencialDescription,
  esencialProjectRows,
  parsePortfolioFilters,
  portfolioById,
  portfolioColumns,
  portfolioCsv,
  portfolioFilterGroups,
  portfolioFiltersSearch,
  portfolioGroups,
  portfolioHeat,
  portfolioHeatLegend,
  portfolioKpis,
  sortPortfolioRows,
  tramoPills,
  type PortfolioFilters,
  // Visual (#992)
  attentionProjects,
  deliveryTimeline,
  moveProjectToTramo,
  portfolioBoard,
  tramoSummaries,
  tramoTone,
  visualDescription,
} from "./projects-portfolio-data";
import { PORTFOLIO, PROJECTS, TRAMOS } from "./projects-portfolio.fixtures";

const [LOMAS, ANDARES, PAUSADO] = PROJECTS;

function row(patch: Partial<PortfolioRow> & Pick<PortfolioRow, "projectId">): PortfolioRow {
  return {
    real: 0,
    plan: null,
    deviation: null,
    budgetSpentPct: null,
    open: 0,
    overdue: 0,
    avgDelayDays: null,
    overdueWeekAgo: 0,
    avgDelayWeekAgo: null,
    daysToDelivery: null,
    nextDelivery: null,
    series7: [],
    ...patch,
  };
}

function named(base: ProjectListItem, id: string, name: string): ProjectListItem {
  return { ...base, id, name };
}

describe("tramoPills", () => {
  it("counts per tramo and hides empty ones", () => {
    const pills = tramoPills([LOMAS, ANDARES, named(ANDARES, "p-3", "Casa Norte"), PAUSADO], TRAMOS);
    expect(pills).toEqual([
      { key: ALL_TRAMOS_KEY, label: "Todos", count: 4 },
      { key: "presale", label: "Presale", count: 2 },
      { key: "diseno", label: "Diseño", count: 1 },
      { key: NO_TRAMO_KEY, label: "Sin tramo", count: 1 },
    ]);
    // Construcción has no project: no pill.
    expect(pills.some((p) => p.key === "construccion")).toBe(false);
  });

  it("keeps only Todos without projects and leaves Sin tramo out when every project has one", () => {
    expect(tramoPills([], TRAMOS)).toEqual([{ key: ALL_TRAMOS_KEY, label: "Todos", count: 0 }]);
    expect(tramoPills([LOMAS], TRAMOS).map((p) => p.key)).toEqual([ALL_TRAMOS_KEY, "diseno"]);
  });
});

describe("esencialProjectRows", () => {
  it("orders by overdue, then next delivery, then name", () => {
    const projects = [
      named(ANDARES, "a", "Zeta sin entrega"),
      named(ANDARES, "b", "Beta tarde"),
      named(ANDARES, "c", "Alfa tarde"),
      named(ANDARES, "d", "Gamma pronto"),
      named(ANDARES, "e", "Delta vencida"),
    ];
    const portfolio = portfolioById([
      row({ projectId: "a" }),
      row({ projectId: "b", nextDelivery: { title: "Planos", date: "2026-12-01" } }),
      row({ projectId: "c", nextDelivery: { title: "Planos", date: "2026-12-01" } }),
      row({ projectId: "d", nextDelivery: { title: "Render", date: "2026-11-20" } }),
      row({ projectId: "e", overdue: 3, nextDelivery: { title: "Obra", date: "2027-01-10" } }),
    ]);
    expect(esencialProjectRows(projects, portfolio, TRAMOS).map((r) => r.id)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("marks al-dia when there is no overdue task", () => {
    const [lomas, andares] = esencialProjectRows([LOMAS, ANDARES], portfolioById(PORTFOLIO), TRAMOS);
    expect(lomas).toMatchObject({ id: "p-lomas", overdue: 2, status: "vencidas", open: 4, tramoKey: "diseno" });
    expect(andares).toMatchObject({ id: "p-andares", overdue: 0, status: "al-dia", open: 8, nextDelivery: null });
    // Without a portfolio row the project's own open count is used and it is al día.
    expect(esencialProjectRows([ANDARES], new Map(), TRAMOS)[0]).toMatchObject({ open: 8, overdue: 0, status: "al-dia" });
  });

  it("builds the subtitle, steps and step labels", () => {
    const client = { id: "c1", name: "Familia Gómez", type: "cliente" as const };
    const [lomas] = esencialProjectRows([{ ...LOMAS, client }], portfolioById(PORTFOLIO), TRAMOS);
    expect(lomas.subtitle).toBe("Familia Gómez · Guadalajara, Jalisco");
    expect(lomas.steps.map((s) => s.state)).toEqual(["done", "current", "next"]);
    expect(lomas.stepLabels).toEqual([
      { key: "presale", label: "Presale", current: false },
      { key: "diseno", label: "Diseño", current: true },
      { key: "construccion", label: "Construcción", current: false },
    ]);
    const [pausado] = esencialProjectRows([PAUSADO], new Map(), TRAMOS);
    expect(pausado.subtitle).toBeNull();
    expect(pausado.tramoKey).toBeNull();
  });
});

describe("esencialDescription", () => {
  it("singular and plural", () => {
    expect(esencialDescription(1)).toBe("1 activo · en qué tramo va cada obra y qué sigue.");
    expect(esencialDescription(7)).toBe("7 activos · en qué tramo va cada obra y qué sigue.");
    expect(esencialDescription(0)).toBe("0 activos · en qué tramo va cada obra y qué sigue.");
  });
});

// ── Analítico (#994) ─────────────────────────────────────────────────────────

const filters = (patch: Partial<PortfolioFilters> = {}): PortfolioFilters => ({ ...DEFAULT_PORTFOLIO_FILTERS, ...patch });
const ids = (projects: ProjectListItem[]) => projects.map((p) => p.id);

/** A second Diseño project, created this month, behind plan with most tasks overdue. */
const BOSQUE: ProjectListItem = {
  ...named(LOMAS, "p-bosque", "Casa Bosque"),
  manager: null,
  coordinator: null,
  managerId: null,
  coordinatorId: null,
  members: [],
  createdAt: "2026-11-03T12:00:00.000Z",
};
const BOSQUE_ROW = row({
  projectId: "p-bosque",
  real: 40,
  deviation: -5,
  budgetSpentPct: 50,
  open: 6,
  overdue: 4,
  avgDelayDays: 7,
  overdueWeekAgo: 6,
  avgDelayWeekAgo: 5,
  series7: [],
});
const ADMIN_PORTFOLIO = portfolioById([...PORTFOLIO.map((r) => (r.projectId === "p-lomas" ? { ...r, budgetSpentPct: 54 } : r)), BOSQUE_ROW]);
const NOW = new Date("2026-11-10T18:00:00.000Z");

describe("parsePortfolioFilters", () => {
  it("defaults and unknown values", () => {
    expect(parsePortfolioFilters(new URLSearchParams(""))).toEqual(DEFAULT_PORTFOLIO_FILTERS);
    expect(
      parsePortfolioFilters(new URLSearchParams("mostrar=xyz&tramo=diseno,,DISEÑO,diseno,presale&mios=true&pausados=1&q=%20%20casa%20")),
    ).toEqual({ mostrar: "todos", tramos: ["diseno", "presale"], mios: false, pausados: true, q: "casa" });
    expect(parsePortfolioFilters(new URLSearchParams("mostrar=atrasados&mios=1")).mostrar).toBe("atrasados");
    expect(parsePortfolioFilters(new URLSearchParams("mostrar=vencidas&mios=1"))).toMatchObject({ mostrar: "vencidas", mios: true });
  });

  it("writes only the non-default filters and keeps other params", () => {
    expect(portfolioFiltersSearch(filters(), new URLSearchParams("estilo=analitico&mostrar=vencidas"))).toBe("estilo=analitico");
    const search = portfolioFiltersSearch(
      filters({ mostrar: "atrasados", tramos: ["presale", "diseno"], mios: true, pausados: true, q: " casa " }),
      new URLSearchParams(),
    );
    expect(parsePortfolioFilters(new URLSearchParams(search))).toEqual({
      mostrar: "atrasados",
      tramos: ["presale", "diseno"],
      mios: true,
      pausados: true,
      q: "casa",
    });
  });
});

describe("applyPortfolioFilters", () => {
  const portfolio = portfolioById(PORTFOLIO);

  it("vencidas, atrasados (≤ −3), tramo multi-select, mios via manager/coordinator/members, pausados", () => {
    // Default: active only (paused out unless asked, archived never).
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters(), "s1"))).toEqual(["p-lomas", "p-andares"]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ pausados: true }), "s1"))).toEqual([
      "p-lomas",
      "p-andares",
      "p-pausado",
    ]);

    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ mostrar: "vencidas" }), "s1"))).toEqual(["p-lomas"]);

    // The threshold is inclusive: −3 is behind, −2 is not.
    const atThreshold = portfolioById([row({ projectId: "p-lomas", deviation: -3 }), row({ projectId: "p-andares", deviation: -2 })]);
    expect(ids(applyPortfolioFilters(PROJECTS, atThreshold, filters({ mostrar: "atrasados" }), "s1"))).toEqual(["p-lomas"]);
    expect(ids(applyPortfolioFilters(PROJECTS, new Map(), filters({ mostrar: "atrasados" }), "s1"))).toEqual([]);

    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ tramos: ["presale"] }), "s1"))).toEqual(["p-andares"]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ tramos: ["presale", "diseno"] }), "s1"))).toEqual([
      "p-lomas",
      "p-andares",
    ]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ tramos: [NO_TRAMO_KEY], pausados: true }), "s1"))).toEqual([
      "p-pausado",
    ]);

    // Manager of both; coordinator of Lomas; member of Lomas; nobody.
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ mios: true }), "s1"))).toEqual(["p-lomas", "p-andares"]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ mios: true }), "s2"))).toEqual(["p-lomas"]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ mios: true }), "s3"))).toEqual(["p-lomas"]);
    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ mios: true }), "zz"))).toEqual([]);

    expect(ids(applyPortfolioFilters(PROJECTS, portfolio, filters({ q: "andares" }), "s1"))).toEqual(["p-andares"]);
  });
});

describe("portfolioFilterGroups", () => {
  const portfolio = portfolioById(PORTFOLIO);
  const counts = (groups: ReturnType<typeof portfolioFilterGroups>, id: string) =>
    Object.fromEntries(groups.find((g) => g.id === id)!.options.map((o) => [o.value, o.count]));

  it("counts are faceted over the other filters", () => {
    const vencidas = portfolioFilterGroups(PROJECTS, portfolio, filters({ mostrar: "vencidas" }), "s1");
    expect(vencidas.map((g) => g.id)).toEqual(["mostrar", "tramo", "mios", "pausados"]);
    // Mostrar ignores its own value.
    expect(counts(vencidas, "mostrar")).toEqual({ todos: 2, vencidas: 1, atrasados: 1 });
    expect(vencidas[0].value).toBe("vencidas");
    expect(vencidas[0].options[1]).toMatchObject({ label: "Con vencidas", tone: "destructive" });
    // Tramo counts follow Mostrar.
    expect(counts(vencidas, "tramo")).toEqual({ presale: 0, diseno: 1 });
    expect(counts(vencidas, "mios")).toEqual({ "1": 1 });
    expect(counts(vencidas, "pausados")).toEqual({ "1": 0 });

    const presale = portfolioFilterGroups(PROJECTS, portfolio, filters({ tramos: ["presale"] }), "s2");
    expect(counts(presale, "mostrar")).toEqual({ todos: 1, vencidas: 0, atrasados: 0 });
    // Tramo ignores its own selection; its value is the joined keys.
    expect(counts(presale, "tramo")).toEqual({ presale: 1, diseno: 1 });
    expect(presale[1].value).toBe("presale");
    // s2 coordinates Lomas only, which is out of the Presale selection.
    expect(counts(presale, "mios")).toEqual({ "1": 0 });
    expect(counts(presale, "pausados")).toEqual({ "1": 0 });
    expect(counts(portfolioFilterGroups(PROJECTS, portfolio, filters(), "s2"), "pausados")).toEqual({ "1": 1 });
  });
});

describe("portfolioGroups", () => {
  const projects = [LOMAS, ANDARES, BOSQUE];

  it("group metrics, footer totals and anchors", () => {
    const { groups, totals, anchors } = portfolioGroups(projects, ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    expect(groups.map((g) => g.id)).toEqual(["t-presale", "t-diseno"]);
    const diseno = groups[1];
    expect(diseno.label).toBe("Diseño");
    expect(diseno.caption).toBe("2 proyectos");
    // Rows by name inside the group.
    expect(diseno.rows!.map((r) => r.name)).toEqual(["Casa Bosque", "Casa Lomas"]);
    expect(diseno.metrics.map((m) => m.value)).toEqual(["avance 51 %", "10 abiertas", "6 vencidas", "60 %", "6.2 d"]);
    expect(diseno.metrics[2].tone).toBe("destructive");
    expect(groups[0].metrics.map((m) => m.value)).toEqual(["avance 15 %", "8 abiertas", "0 vencidas", "0 %", "—"]);
    expect(groups[0].metrics[2].tone).toBe("default");
    expect(diseno.rows![0]).toMatchObject({ id: "p-bosque", overduePct: 67, avgDelayDays: 7, budgetSpentPct: null });

    expect(totals).toEqual({
      name: "Total · 3 proyectos",
      real: "39 % prom.",
      deviation: "−3.3",
      open: "18",
      overdue: "6",
      overduePct: "33 %",
      avgDelayDays: "6.2 d",
      nextDelivery: "",
    });
    expect(anchors).toEqual([
      { id: "t-presale", label: "Presale", count: 0 },
      { id: "t-diseno", label: "Diseño", count: 6 },
    ]);

    // One project: one group, totals still there.
    const one = portfolioGroups([ANDARES], ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    expect(one.groups).toHaveLength(1);
    expect(one.totals.name).toBe("Total · 1 proyecto");
    // No rows: no groups, KPIs-style placeholders.
    const none = portfolioGroups([], ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    expect(none.groups).toEqual([]);
    expect(none.totals).toMatchObject({ name: "Total · 0 proyectos", real: "—", overduePct: "—", avgDelayDays: "—" });
  });

  it("omits the budget column without canSeeAdminData", () => {
    expect(portfolioColumns({ canSeeAdminData: false }).map((c) => c.key)).not.toContain("budgetSpentPct");
    const plain = portfolioGroups(projects, ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    expect(plain.totals.budgetSpentPct).toBeUndefined();
    expect(plain.groups.flatMap((g) => g.rows!).every((r) => r.budgetSpentPct === null)).toBe(true);
    expect(portfolioHeatLegend({ canSeeAdminData: false })).toBe(
      "Heat: % vencidas > 45 % ámbar, > 60 % rojo · Desv. plan ≤ −5 ámbar, ≤ −8 rojo.",
    );

    expect(portfolioColumns({ canSeeAdminData: true }).at(-1)).toMatchObject({ key: "budgetSpentPct", label: "Presup. ejercido" });
    const admin = portfolioGroups(projects, ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: true });
    expect(admin.totals.budgetSpentPct).toBe("52 %");
    expect(portfolioHeatLegend({ canSeeAdminData: true })).toBe(
      "Heat: % vencidas > 45 % ámbar, > 60 % rojo · Desv. plan ≤ −5 ámbar, ≤ −8 rojo · Presup. ejercido por encima del avance, ámbar. La columna de presupuesto solo la ven administradores.",
    );
  });

  it("heat follows PORTFOLIO_HEAT exactly", () => {
    const { groups } = portfolioGroups(projects, ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: true });
    const [bosque, lomas] = groups[1].rows!;
    const [andares] = groups[0].rows!;
    expect(PORTFOLIO_HEAT.overduePct).toEqual({ warnAbove: 45, critAbove: 60 });
    // 67 % → rojo, 50 % → ámbar, 0 % → none.
    expect(portfolioHeat("overduePct", bosque)).toBe("crit");
    expect(portfolioHeat("overduePct", lomas)).toBe("warn");
    expect(portfolioHeat("overduePct", andares)).toBeNull();
    expect(portfolioHeat("overduePct", { ...lomas, overduePct: 45 })).toBeNull();
    expect(portfolioHeat("overduePct", { ...lomas, overduePct: 60 })).toBe("warn");
    // −8 → rojo, −5 → ámbar, −4 and +3 → none.
    expect(portfolioHeat("deviation", lomas)).toBe("crit");
    expect(portfolioHeat("deviation", bosque)).toBe("warn");
    expect(portfolioHeat("deviation", { ...bosque, deviation: -4 })).toBeNull();
    expect(portfolioHeat("deviation", andares)).toBeNull();
    // Budget above the progress → ámbar.
    expect(portfolioHeat("budgetSpentPct", bosque)).toBe("warn");
    expect(portfolioHeat("budgetSpentPct", lomas)).toBeNull();
  });

  it("sorts numeric columns with nulls last", () => {
    const { groups } = portfolioGroups(projects, ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    const rows = groups.flatMap((g) => g.rows!);
    expect(sortPortfolioRows(rows, { key: "open", direction: "desc" }).map((r) => r.id)).toEqual(["p-andares", "p-bosque", "p-lomas"]);
    expect(sortPortfolioRows(rows, { key: "avgDelayDays", direction: "asc" }).map((r) => r.id)).toEqual([
      "p-lomas",
      "p-bosque",
      "p-andares",
    ]);
    expect(sortPortfolioRows(rows, null)).toBe(rows);
  });
});

describe("portfolioKpis", () => {
  it("deltas from series7[0], overdueWeekAgo, avgDelayWeekAgo; sin cambio at 0", () => {
    const items = portfolioKpis([LOMAS, ANDARES, BOSQUE], ADMIN_PORTFOLIO, NOW);
    expect(items.map((i) => i.label)).toEqual([
      "PROYECTOS ACTIVOS",
      "AVANCE PROMEDIO",
      "TAREAS ABIERTAS",
      "VENCIDAS",
      "RETRASO PROMEDIO",
    ]);
    const [activos, avance, abiertas, vencidas, retraso] = items;
    expect(activos).toMatchObject({ value: 3, delta: { label: "+1 este mes", tone: "good" } });
    expect(avance).toMatchObject({ value: "39 %", delta: { label: "−3.3 pts vs plan", tone: "bad" } });
    // 18 open now; 3 + 8 a week ago, and Bosque (no series) counts its current 6.
    expect(abiertas).toMatchObject({ value: 18, delta: { label: "+1 vs semana pasada", tone: "bad" } });
    expect(vencidas).toMatchObject({
      value: 6,
      tone: "destructive",
      secondary: " · 33 %",
      delta: { label: "−1 vs semana pasada", tone: "good" },
    });
    // (4.5·2 + 7·4) / 6 = 6.2 now; (3·1 + 5·6) / 7 = 4.7 a week ago.
    expect(retraso).toMatchObject({ value: "6.2 d", delta: { label: "+1.5 d", tone: "bad" } });

    const steady = portfolioKpis([ANDARES], ADMIN_PORTFOLIO, NOW);
    expect(steady.map((i) => i.delta?.label)).toEqual(["sin cambio", "+3 pts vs plan", "sin cambio", "sin cambio", "sin cambio"]);
    expect(steady.map((i) => i.delta?.tone)).toEqual(["neutral", "good", "neutral", "neutral", "neutral"]);
    expect(steady[3]).toMatchObject({ value: 0, tone: "default", secondary: " · 0 %" });
    expect(steady[4].value).toBe("—");

    const none = portfolioKpis([], ADMIN_PORTFOLIO, NOW);
    expect(none.map((i) => i.value)).toEqual([0, "—", 0, 0, "—"]);
  });
});

describe("portfolioCsv", () => {
  it("escapes separators and uses visible columns", () => {
    const tricky: ProjectListItem = {
      ...named(LOMAS, "p-lomas", 'Casa "Lomas"; fase 2'),
      client: { id: "c1", name: "=HYPERLINK(1)", type: "cliente" },
    };
    const { groups } = portfolioGroups([tricky, ANDARES], ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: false });
    const csv = portfolioCsv(groups, { canSeeAdminData: false });
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Tramo;Proyecto;Cliente;Avance;Desv. plan;Abiertas;Vencidas;% vencidas;Retraso prom.;Próxima entrega");
    expect(lines[1]).toBe("Presale;Depto Andares;;15;3;8;0;0;;");
    expect(lines[2]).toBe(`Diseño;"Casa ""Lomas""; fase 2";'=HYPERLINK(1);62;-8;4;2;50;4.5;Plano de acabados · 2026-11-12`);
    expect(lines.at(-1)).toBe("");

    const admin = portfolioCsv(portfolioGroups([LOMAS], ADMIN_PORTFOLIO, TRAMOS, { canSeeAdminData: true }).groups, { canSeeAdminData: true });
    const adminLines = admin.slice(1).split("\r\n");
    expect(adminLines[0].endsWith(";Presup. ejercido")).toBe(true);
    expect(adminLines[1].endsWith(";54")).toBe(true);
  });
});

// ── Visual (#992) ───────────────────────────────────────────────────────────

describe("tramoSummaries", () => {
  it("sums open and overdue and rounds the average per tramo", () => {
    const second = { ...LOMAS, id: "p-lomas-2", name: "Casa Lomas 2" };
    const rows = portfolioById([
      row({ projectId: LOMAS.id, real: 62, open: 4, overdue: 2 }),
      row({ projectId: second.id, real: 15, open: 3, overdue: 1 }),
      row({ projectId: ANDARES.id, real: 15, open: 8, overdue: 0 }),
    ]);
    const diseno = tramoSummaries([LOMAS, second, ANDARES], rows, TRAMOS).find((s) => s.key === "diseno");
    expect(diseno).toEqual({
      key: "diseno",
      tramoId: "w2",
      label: "Diseño",
      projectCount: 2,
      openTasks: 7,
      // (62 + 15) / 2 = 38.5
      avgProgress: 39,
      overdue: 3,
    });
  });

  it("keeps empty tramos with zeros", () => {
    const summaries = tramoSummaries([LOMAS], portfolioById(PORTFOLIO), TRAMOS);
    expect(summaries.map((s) => s.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(summaries[2]).toMatchObject({ projectCount: 0, openTasks: 0, avgProgress: 0, overdue: 0 });
  });

  it("matches the board's column counts", () => {
    const projects = [LOMAS, ANDARES, { ...PAUSADO, status: "activo" as const }];
    const rows = portfolioById(PORTFOLIO);
    const board = portfolioBoard(projects, rows, TRAMOS);
    const summaries = tramoSummaries(projects, rows, TRAMOS);
    expect(summaries.map((s) => [s.key, s.projectCount])).toEqual(board.map((c) => [c.key, c.cards.length]));
    expect(summaries.reduce((n, s) => n + s.openTasks, 0)).toBe(board.flatMap((c) => c.cards).reduce((n, c) => n + c.open, 0));
  });
});

describe("attentionProjects", () => {
  it("keeps only projects with overdue, sorted by overdue then deviation then name", () => {
    const a = named(LOMAS, "a", "Bravo");
    const b = named(LOMAS, "b", "Alfa");
    const c = named(LOMAS, "c", "Charlie");
    const d = named(LOMAS, "d", "Delta");
    const e = named(ANDARES, "e", "Eco");
    const rows = portfolioById([
      row({ projectId: "a", overdue: 2, deviation: -5 }),
      row({ projectId: "b", overdue: 2, deviation: -5 }),
      row({ projectId: "c", overdue: 2, deviation: null }),
      row({ projectId: "d", overdue: 4, deviation: 3 }),
      row({ projectId: "e", overdue: 0, deviation: -30 }),
    ]);
    const ids = attentionProjects([a, b, c, d, e], rows, TRAMOS, 10).map((p) => p.id);
    expect(ids).toEqual(["d", "b", "a", "c"]);
  });

  it("caps at the limit and counts team overflow", () => {
    const projects = ["a", "b", "c", "d"].map((id) =>
      named(
        {
          ...LOMAS,
          members: [
            { id: "s3", name: "Marta Ruiz" },
            { id: "s4", name: "Pedro Sola" },
            { id: "s1", name: "Ana López" },
          ],
        },
        id,
        `Proyecto ${id}`,
      ),
    );
    const rows = portfolioById(projects.map((p) => row({ projectId: p.id, overdue: 1 })));
    const list = attentionProjects(projects, rows, TRAMOS);
    expect(list).toHaveLength(3);
    // Ana López (encargada) and Luis Paz (coordinador) first, then the members without repeats.
    expect(list[0].team.map((p) => p.name)).toEqual(["Ana López", "Luis Paz", "Marta Ruiz"]);
    expect(list[0].team[0]).toMatchObject({ initials: "AL", tramoKey: "diseno" });
    expect(list[0].teamOverflow).toBe(1);
    expect(list[0].badge).toBe("Diseño");
    expect(list[0].subtitle).toBe("Guadalajara, Jalisco");
    expect(list[0].steps.map((s) => s.state)).toEqual(["done", "current", "next"]);
  });

  it("badges the tramo and the active fase", () => {
    const project = { ...LOMAS, activePhase: { id: "f1", name: "Proyecto ejecutivo", sortOrder: 1 } };
    const [first] = attentionProjects([project], portfolioById(PORTFOLIO), TRAMOS);
    expect(first.badge).toBe("Diseño · Proyecto ejecutivo");
    expect(first.nextDelivery).toEqual({ title: "Plano de acabados", date: "2026-11-12" });
  });
});

describe("portfolioBoard", () => {
  it("puts needsTramo projects in a leading Sin tramo column only when non-empty", () => {
    const rows = portfolioById(PORTFOLIO);
    const withoutTramo = portfolioBoard([LOMAS, ANDARES], rows, TRAMOS);
    expect(withoutTramo.map((c) => c.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(withoutTramo.every((c) => c.droppable)).toBe(true);

    const sinTramo = { ...PAUSADO, status: "activo" as const };
    const board = portfolioBoard([LOMAS, ANDARES, sinTramo], rows, TRAMOS);
    expect(board.map((c) => c.key)).toEqual([NO_TRAMO_KEY, "presale", "diseno", "construccion"]);
    expect(board[0]).toMatchObject({ label: "Sin tramo", tramoId: null, droppable: false });
    expect(board[0].cards.map((c) => c.id)).toEqual([PAUSADO.id]);
  });

  it("builds the card subtitle from the client and the next delivery", () => {
    const board = portfolioBoard([{ ...LOMAS, client: { id: "c1", name: "Familia Gómez", type: "cliente" } }], portfolioById(PORTFOLIO), TRAMOS);
    const card = board.find((c) => c.key === "diseno")!.cards[0];
    expect(card).toEqual({
      id: LOMAS.id,
      name: "Casa Lomas",
      subtitle: "Familia Gómez · Plano de acabados 12 nov",
      real: 62,
      open: 4,
      overdue: 2,
    });
  });
});

describe("moveProjectToTramo", () => {
  it("moves currentWorkflow and flips tramos[].current", () => {
    const data = { projects: [LOMAS, ANDARES], tramos: TRAMOS };
    const next = moveProjectToTramo(data, LOMAS.id, "w1");
    const moved = next.projects[0];
    expect(moved.currentWorkflow?.key).toBe("presale");
    expect(moved.currentWorkflowId).toBe("w1");
    expect(moved.tramos.map((t) => [t.key, t.current])).toEqual([
      ["presale", true],
      ["diseno", false],
    ]);
    expect(next.projects[1]).toBe(ANDARES);
    expect(moveProjectToTramo(data, LOMAS.id, "nope")).toBe(data);
  });
});

describe("deliveryTimeline", () => {
  it("places deliveries by day index and drops ones outside 11 days", () => {
    const projects = [named(LOMAS, "a", "Alfa"), named(LOMAS, "b", "Bravo"), named(LOMAS, "c", "Charlie"), named(LOMAS, "d", "Delta")];
    const rows = portfolioById([
      row({ projectId: "a", nextDelivery: { title: "Planos", date: "2026-11-10" } }),
      row({ projectId: "b", nextDelivery: { title: "Losa", date: "2026-11-20" } }),
      row({ projectId: "c", nextDelivery: { title: "Fuera", date: "2026-11-21" } }),
      row({ projectId: "d", nextDelivery: { title: "Antes", date: "2026-11-09" } }),
    ]);
    const { days, items, rangeLabel } = deliveryTimeline(projects, rows, "2026-11-10");
    expect(days).toHaveLength(11);
    expect(items.map((i) => [i.projectId, i.dayIndex])).toEqual([
      ["a", 0],
      ["b", 10],
    ]);
    expect(items[0]).toMatchObject({ projectName: "Alfa", title: "Planos", date: "2026-11-10", tramoKey: "diseno" });
    expect(rangeLabel).toBe("10 – 20 NOV");
  });

  it("labels days in es-MX uppercase and marks today", () => {
    const { days, rangeLabel } = deliveryTimeline([], new Map(), "2026-11-10");
    // 2026-11-10 is a Tuesday.
    expect(days[0]).toEqual({ iso: "2026-11-10", label: "MAR 10", isToday: true });
    expect(days[1]).toMatchObject({ iso: "2026-11-11", isToday: false });
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days.every((d) => d.label === d.label.toUpperCase() && !d.label.includes("."))).toBe(true);
    expect(deliveryTimeline([], new Map(), "2026-11-25").rangeLabel).toBe("25 NOV – 5 DIC");
    expect(rangeLabel).toBe("10 – 20 NOV");
  });
});

describe("visualDescription", () => {
  it("uses singular forms", () => {
    expect(visualDescription(1, 1, 1)).toBe("1 obra activa en 1 tramo · 1 entrega en los próximos 11 días.");
    expect(visualDescription(7, 4, 0)).toBe("7 obras activas en 4 tramos · 0 entregas en los próximos 11 días.");
  });
});

describe("tramoTone", () => {
  it("maps a tramo to its chart color, ink and tint; Sin tramo is neutral", () => {
    expect(tramoTone("diseno")).toEqual({ color: "var(--chart-2)", ink: "var(--chart-2-ink)", soft: "var(--tint-violet)" });
    expect(tramoTone(NO_TRAMO_KEY)).toEqual({ color: "var(--muted-foreground)", ink: "var(--foreground)", soft: "var(--muted)" });
    expect(tramoTone(null).color).toBe("var(--muted-foreground)");
  });
});
