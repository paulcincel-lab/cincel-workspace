// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamHoursTable } from "./TeamHoursTable";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { AVERAGE_LABEL, TEAM_HOURS_EMPTY, teamHoursModel } from "@/components/widgets/TeamHoursWidget";
import { NEEDS_REVIEW_LABEL, reportDays, teamHoursStatus } from "@/lib/time-tracking/horario-copy";
import type { PresentationStyle, TeamHoursRow } from "@/lib/types/redesign";
import { SETTINGS, TEAM_ROWS, WEEK } from "@/tests/unit/fixtures/horario";

afterEach(() => {
  cleanup();
});

function renderTable(style: PresentationStyle, rows: TeamHoursRow[] = TEAM_ROWS) {
  return render(
    <StyleProvider style={style} scope="staff">
      <TeamHoursTable weekStart={WEEK} rows={rows} workDays={SETTINGS.workDays} />
    </StyleProvider>,
  );
}

function headers(): string[] {
  return screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole("rowheader", { name }).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
}

describe("teamHoursModel", () => {
  const dates = reportDays(WEEK, SETTINGS.workDays, TEAM_ROWS);

  it("shows the work days Lun…Vie with one decimal and — without a record", () => {
    const model = teamHoursModel(TEAM_ROWS, dates);
    expect(model.dayLabels).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
    expect(model.rows[0]?.cells).toEqual(["8.5", "8.2", "9.0", "8.0", "7.8"]);
    expect(model.rows[2]?.cells).toEqual(["—", "—", "—", "—", "—"]);
  });

  it("diferencia sign and color", () => {
    const [paul, juanma] = teamHoursModel(TEAM_ROWS, dates).rows;
    expect(paul).toMatchObject({ total: "41.5", target: "40.0", diff: "+1.5", onTarget: true });
    expect(juanma).toMatchObject({ total: "35.2", target: "40.0", diff: "−4.8", onTarget: false });
    expect(teamHoursModel([{ ...TEAM_ROWS[0]!, total: 40 }], dates).rows[0]).toMatchObject({ diff: "0.0", onTarget: true });
  });

  it("averages only the people with a record", () => {
    const { average } = teamHoursModel(TEAM_ROWS, dates);
    expect(average).toMatchObject({ total: "38.4", target: "40.0", diff: "−1.6", onTarget: false, late: "1.0" });
    expect(teamHoursModel([TEAM_ROWS[2]!], dates).average).toBeNull();
  });

  it("maps the three status labels, with an auto-closed day first", () => {
    expect(teamHoursStatus({ status: "completo", needsReview: false })).toEqual({ label: "Al día", tone: "success" });
    expect(teamHoursStatus({ status: "incompleto", needsReview: false })).toEqual({ label: "Revisar", tone: "warning" });
    expect(teamHoursStatus({ status: "completo", needsReview: true })).toEqual({ label: NEEDS_REVIEW_LABEL, tone: "destructive" });
    expect(teamHoursStatus({ status: "sin_registro", needsReview: false })).toEqual({ label: "Sin registro", tone: "neutral" });
  });
});

describe("TeamHoursTable", () => {
  it.each(["visual", "analitico"] as const)("%s: days, total, meta, diferencia, retardos and estado", (style) => {
    renderTable(style);
    expect(headers()).toEqual(["Persona", "Lun", "Mar", "Mié", "Jue", "Vie", "Total", "Meta", "Diferencia", "Retardos", "Estado"]);
    const paul = within(rowOf("Paul Langarica"));
    expect(paul.getByText("+1.5").className).toContain("text-success");
    expect(paul.getByText("Al día").getAttribute("data-tone")).toBe("success");
    const juanma = within(rowOf("Juanma"));
    expect(juanma.getByText("−4.8").className).toContain("text-destructive");
    expect(juanma.getByText("Revisar").getAttribute("data-tone")).toBe("warning");
    expect(within(screen.getByTestId("team-hours-average")).getByText(AVERAGE_LABEL)).toBeTruthy();
  });

  it("needsReview shows Salida sin registrar", () => {
    renderTable("visual", [{ ...TEAM_ROWS[0]!, needsReview: true }, TEAM_ROWS[1]!]);
    const pill = within(rowOf("Paul Langarica")).getByText(NEEDS_REVIEW_LABEL);
    expect(pill.getAttribute("data-tone")).toBe("destructive");
    expect(within(rowOf("Juanma")).queryByText(NEEDS_REVIEW_LABEL)).toBeNull();
  });

  it("esencial branch shows totals only", () => {
    renderTable("esencial");
    expect(headers()).toEqual(["Persona", "Total / meta", "Estado"]);
    expect(within(rowOf("Paul Langarica")).getByText("41.5 / 40.0 h")).toBeTruthy();
    expect(within(rowOf("Juanma")).getByText("Revisar")).toBeTruthy();
    expect(screen.queryByText("+1.5")).toBeNull();
    expect(screen.queryByTestId("team-hours-average")).toBeNull();
  });

  it("shows the empty copy without rows", () => {
    renderTable("visual", []);
    expect(screen.getByText(TEAM_HOURS_EMPTY)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
