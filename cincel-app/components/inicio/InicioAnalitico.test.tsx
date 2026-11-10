// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn() }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  analiticoKpis,
  attentionSummary,
  netHeat,
  paceTotals,
  saturatedCount,
  workloadTotals,
} from "@/lib/inicio/analitico";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { sliceToRange } from "@/lib/stores/dashboard-store";
import { useInicioDashboard } from "@/lib/stores/inicio-dashboard-store";
import type { InicioData } from "@/lib/types/redesign";
import { settle } from "@/tests/helpers/settle";

import { ANALITICO_DATA } from "./inicio-analitico-fixtures";
import { InicioAnalitico } from "./InicioAnalitico";
import { weekLabel } from "./WeeklyPaceChart";

// 09:00 on Monday 9 November 2026 in Mexico City.
const NOW = new Date("2026-11-09T15:00:00Z");

function renderAnalitico(data: InicioData = ANALITICO_DATA) {
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <InicioAnalitico data={data} firstName="Ana" now={NOW} />
    </StyleProvider>,
    { client: createTestQueryClient() },
  );
}

const section = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no section ${id}`);
  return el;
};
const text = (id: string) => section(id).textContent ?? "";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("InicioAnalitico", () => {
  it("KPI delta tones", () => {
    const items = analiticoKpis(ANALITICO_DATA.kpis, ANALITICO_DATA.projectsProgress, true);
    expect(items.map((k) => [k.label, k.value, k.delta?.label, k.delta?.tone])).toEqual([
      // Up is bad.
      ["Abiertas", "23", "+2 vs sem. pasada", "bad"],
      ["Vencidas", "7", "−1 vs sem. pasada", "good"],
      // Up is good.
      ["Completadas (sem.)", "11", "+1 vs sem. pasada", "good"],
      ["Proyectos activos", "4", "1 en riesgo", "neutral"],
      ["Retraso promedio", "6.3 d", "+0.8 d", "bad"],
    ]);
    expect(items.find((k) => k.key === "vencidas")?.tone).toBe("destructive");
    // Without showProjectRisk there is no "en riesgo" line.
    expect(analiticoKpis(ANALITICO_DATA.kpis, ANALITICO_DATA.projectsProgress, false)[3].delta).toBeUndefined();

    renderAnalitico();
    for (const label of ["Abiertas", "Completadas (sem.)", "Retraso promedio"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("6.3 d").length).toBeGreaterThan(0);
  });

  it("range switch slices weeks and updates description", () => {
    renderAnalitico();
    expect(screen.getByText("Lunes 9 de noviembre · resumen operativo de las últimas 8 semanas.")).toBeTruthy();
    const first12 = weekLabel(ANALITICO_DATA.weeklyPace[0].weekStart);
    const first8 = weekLabel(ANALITICO_DATA.weeklyPace[4].weekStart);
    expect(text("s-ritmo")).toContain(first8);
    expect(text("s-ritmo")).not.toContain(first12);
    const totals8 = paceTotals(sliceToRange(ANALITICO_DATA.weeklyPace, "8w"));
    expect(text("s-ritmo")).toMatch(new RegExp(`Creadas\\s*${totals8.created}`));

    const rango = screen.getByRole("radiogroup", { name: "Rango" });
    fireEvent.click(within(rango).getByRole("radio", { name: /12 sem/ }));
    expect(useInicioDashboard.getState().range).toBe("12w");
    expect(screen.getByText("Lunes 9 de noviembre · resumen operativo de las últimas 12 semanas.")).toBeTruthy();
    expect(text("s-ritmo")).toContain(first12);
    expect(text("s-ritmo")).toContain("12 semanas");
    const totals12 = paceTotals(ANALITICO_DATA.weeklyPace);
    expect(text("s-ritmo")).toMatch(new RegExp(`Creadas\\s*${totals12.created}`));
  });

  it("Atención grouping and tfoot", () => {
    const summary = attentionSummary(ANALITICO_DATA.attention, ANALITICO_DATA.projectsProgress, ANALITICO_DATA.tasksByTramo);
    // Vencidas and bloqueadas only, projects by overdue desc.
    expect(summary.projects.map((p) => [p.name, p.overdue, p.daysLate, p.overduePct])).toEqual([
      ["Oficina Polanco", 3, 24, 67],
      ["Depto Roma", 1, 4, 25],
    ]);
    // Tramos by days late desc, with their sums.
    expect(summary.projects[0].tramos.map((t) => [t.label, t.overdue, t.daysLate, t.tasks.map((x) => x.id)])).toEqual([
      ["Diseño", 2, 15, ["t-1", "t-3"]],
      ["Presale", 1, 9, ["t-2"]],
      ["Construcción", 0, 0, ["t-4"]],
    ]);
    expect([summary.overdue, summary.blocked, summary.daysLate]).toEqual([4, 1, 28]);

    renderAnalitico();
    const atencion = text("s-atencion");
    expect(atencion).toMatch(/Vencidas\s*4/);
    expect(atencion).toMatch(/Bloqueadas\s*1/);
    expect(atencion).toMatch(/Días de retraso\s*28/);
    expect(atencion).toContain("67 % vencidas");
    expect(atencion).toContain("3 vencidas · 24 d");
    expect(atencion).toContain("Total · 2 proyectos");
    expect(atencion).not.toContain("Sin responsable");
    // The first project is expanded: its tasks are links.
    expect(within(section("s-atencion")).getByRole("link", { name: "Planos de instalación eléctrica" }).getAttribute("href")).toBe(
      "/tareas?tarea=t-1",
    );
  });

  it("Saturadas count", () => {
    expect(saturatedCount(ANALITICO_DATA.workload)).toBe(1);
    expect(workloadTotals(ANALITICO_DATA.workload)).toMatchObject({ open: 23, inProgress: 8, overdue: 7, overduePct: 30, saturated: 1 });
    renderAnalitico();
    expect(text("s-carga")).toMatch(/Saturadas\s*1/);
    expect(text("s-carga")).toContain("Total · 3 personas");
  });

  it("Neto heat", () => {
    expect(netHeat(-4)).toBe("crit");
    expect(netHeat(-5)).toBe("crit");
    expect(netHeat(-3)).toBeNull();
    renderAnalitico();
    // The −5 week reads as a negative, destructive net.
    const cell = within(section("s-ritmo")).getByText("−5");
    expect(cell.closest(".text-destructive")).toBeTruthy();
  });

  it("Ir a focuses section", async () => {
    renderAnalitico();
    await settle();
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    fireEvent.click(within(nav).getByRole("link", { name: /Por tramo/ }));
    expect(section("s-tramos").contains(document.activeElement)).toBe(true);
    // A collapsed section opens when reached from "Ir a".
    act(() => useInicioDashboard.getState().setCollapsed("attention", true));
    fireEvent.click(within(nav).getByRole("link", { name: /Atención/ }));
    expect(useInicioDashboard.getState().collapsed.attention).toBe(false);
    expect(section("s-atencion").contains(document.activeElement)).toBe(true);
    await settle();
  });

  it("Carga hidden without showTeamWorkload", () => {
    renderAnalitico({ ...ANALITICO_DATA, sections: { showTeamWorkload: false, showProjectRisk: true } });
    expect(document.getElementById("s-carga")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    expect(within(nav).queryByRole("link", { name: /Carga por persona/ })).toBeNull();
  });

  it("filters the tables and the Ir a counts, not the KPIs", () => {
    useInicioDashboard.getState().setFilter("responsable", "s-3");
    renderAnalitico();
    expect(text("s-atencion")).not.toContain("Cotización de cancelería");
    expect(text("s-agenda")).toContain("Entrega de planos");
    expect(text("s-agenda")).not.toContain("Visita de obra");
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    expect(within(nav).getByRole("link", { name: /Agenda/ }).textContent).toContain("1");
    // KPIs keep the unfiltered values.
    expect(screen.getAllByText("23").length).toBeGreaterThan(0);
  });

  it("offers Quitar filtros when nothing matches", () => {
    useInicioDashboard.getState().setFilter("tramo", "decoracion");
    renderAnalitico();
    const buttons = screen.getAllByRole("button", { name: "Quitar filtros" });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: null, tramo: null });
  });

  it("shows each section's empty copy", () => {
    renderAnalitico({
      ...ANALITICO_DATA,
      attention: [],
      weeklyPace: ANALITICO_DATA.weeklyPace.map((w) => ({ ...w, created: 0, completed: 0 })),
      workload: [],
      tasksByTramo: [],
      todayAgenda: [],
    });
    for (const copy of ["Todo al día", "Sin movimiento en el rango", "Sin tareas asignadas", "Sin tareas abiertas", "Sin eventos ni entregas hoy"]) {
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    }
  });

  it("sorts the agenda by time with deliveries last", () => {
    renderAnalitico();
    const agenda = text("s-agenda");
    expect(agenda.indexOf("Junta de diseño")).toBeLessThan(agenda.indexOf("Visita de obra"));
    expect(agenda.indexOf("Visita de obra")).toBeLessThan(agenda.indexOf("Entrega de planos"));
  });
});
