// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/widgets/RecordTable", () => import("@/tests/unit/fixtures/horario"));

import { buildTeamHoursTable, CUMPLIMIENTO_HEAT, TeamHoursTable, TRIAL_NOTE } from "./TeamHoursTable";
import { TEAM_ROWS, WEEK } from "@/tests/unit/fixtures/horario";
import type { PresentationStyle } from "@/lib/types/redesign";

afterEach(() => {
  cleanup();
});

function headers(): string[] {
  return screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
}

function rowOf(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
}

describe("buildTeamHoursTable", () => {
  it("builds one row per person with the status labels", () => {
    const data = buildTeamHoursTable(TEAM_ROWS, "2027-01-04");
    expect(data.rows.map((row) => row.estado)).toEqual(["Completo", "Incompleto", "Sin registro"]);
    expect(data.rows.map((row) => row.id)).toEqual(["s-paul", "s-juanma", "s-maria"]);
  });

  it("formats hours, the difference and % cumplimiento", () => {
    const [paul, juanma, maria] = buildTeamHoursTable(TEAM_ROWS, "2027-01-04").rows;
    expect(paul?.horas).toBe("41.5 h de 40 h");
    expect(paul?.diferencia).toBe("+1.5 h");
    expect(paul?.cumplimiento).toBe(104);
    expect(juanma?.diferencia).toBe("−4.8 h");
    expect(juanma?.cumplimiento).toBe(88);
    expect(maria?.resumen).toBe("Sin registros esta semana");
    expect(maria?.["d_2026-11-02"]).toBe("—");
  });

  it("averages only the people with records and heats % cumplimiento", () => {
    const data = buildTeamHoursTable(TEAM_ROWS, "2027-01-04");
    expect(data.heat).toEqual([CUMPLIMIENTO_HEAT]);
    expect(data.totals).toMatchObject({
      persona: "Promedio (con registro)",
      total: 38.4,
      meta: 40,
      retardos: 2,
      cumplimiento: 96,
    });
  });

  it("marks the trial days of a week that is only partly trial", () => {
    const data = buildTeamHoursTable(TEAM_ROWS, "2026-11-05");
    const dayLabels = data.columns.filter((c) => c.key.startsWith("d_")).map((c) => c.label);
    expect(dayLabels).toEqual(["lun · prueba", "mar · prueba", "mié · prueba", "jue", "vie"]);
    expect(data.rows[0]?.resumen).toBe("8.5 h (prueba) · 8.2 h (prueba) · 9 h (prueba) · 8 h · 7.8 h");
  });

  it("does not mark single days when the whole week is trial or required", () => {
    for (const requiredFrom of ["2027-01-04", "2026-10-01", null]) {
      const labels = buildTeamHoursTable(TEAM_ROWS, requiredFrom).columns.map((c) => c.label);
      expect(labels.some((label) => label.includes("prueba"))).toBe(false);
    }
  });

  it("has no totals row without anyone on record", () => {
    expect(buildTeamHoursTable([TEAM_ROWS[2]!], null).totals).toBeUndefined();
    expect(buildTeamHoursTable([], null).rows).toEqual([]);
  });
});

describe("TeamHoursTable in three styles", () => {
  function renderIn(style: PresentationStyle, requiredFrom: string | null = "2027-01-04") {
    return render(<TeamHoursTable weekStart={WEEK} rows={TEAM_ROWS} style={style} requiredFrom={requiredFrom} />);
  }

  it("Visual: per-day columns, total of meta and estado", () => {
    renderIn("visual");
    expect(screen.getByRole("table").getAttribute("data-style")).toBe("visual");
    expect(headers()).toEqual(["Persona", "lun", "mar", "mié", "jue", "vie", "Total", "Estado"]);
    const paul = within(rowOf("Paul Langarica"));
    expect(paul.getByText("41.5 h de 40 h")).toBeTruthy();
    expect(paul.getByText("Completo")).toBeTruthy();
    expect(within(rowOf("María González")).getByText("Sin registro")).toBeTruthy();
    expect(screen.queryByTestId("totals")).toBeNull();
  });

  it("Esencial: one line per person", () => {
    renderIn("esencial");
    expect(headers()).toEqual(["Persona", "Horas por día", "Total", "Estado"]);
    expect(within(rowOf("Paul Langarica")).getByText("8.5 h · 8.2 h · 9 h · 8 h · 7.8 h")).toBeTruthy();
    expect(within(rowOf("Juanma")).getByText("Incompleto")).toBeTruthy();
    expect(within(rowOf("María González")).getByText("Sin registros esta semana")).toBeTruthy();
  });

  it("Analítico: total, meta, diferencia, retardos, % cumplimiento and the averages row", () => {
    renderIn("analitico");
    expect(headers()).toEqual([
      "Persona",
      "lun",
      "mar",
      "mié",
      "jue",
      "vie",
      "Total",
      "Meta",
      "Diferencia",
      "Retardos",
      "% cumplimiento",
      "Estado",
    ]);
    const juanma = within(rowOf("Juanma"));
    expect(juanma.getByText("−4.8 h")).toBeTruthy();
    expect(juanma.getByText("88%")).toBeTruthy();
    expect(within(screen.getByTestId("totals")).getByText("Promedio (con registro)")).toBeTruthy();
  });

  it("re-renders when the style prop changes", () => {
    const { rerender } = renderIn("visual");
    rerender(<TeamHoursTable weekStart={WEEK} rows={TEAM_ROWS} style="analitico" requiredFrom="2027-01-04" />);
    expect(screen.getByRole("table").getAttribute("data-style")).toBe("analitico");
  });

  it("shows the trial note while any day is a trial day", () => {
    renderIn("visual", "2027-01-04");
    expect(screen.getByText(TRIAL_NOTE)).toBeTruthy();
    cleanup();
    renderIn("visual", "2026-10-01");
    expect(screen.queryByText(TRIAL_NOTE)).toBeNull();
  });
});
