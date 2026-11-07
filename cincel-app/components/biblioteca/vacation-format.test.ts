import { describe, expect, it } from "vitest";

import {
  balanceKpis,
  canCancelRequest,
  formatMonthYear,
  formatRange,
  historyTable,
  todayIso,
  workDaysBetween,
} from "./vacation-format";
import { APPROVED_FUTURE, APPROVED_PAST, BALANCE, PENDING_FUTURE, REJECTED } from "./vacaciones.fixtures";

describe("vacation-format", () => {
  it("formats es-MX ranges in lowercase", () => {
    expect(formatRange("2026-12-16", "2026-12-20")).toBe("16 – 20 dic");
    expect(formatRange("2026-11-28", "2026-12-02")).toBe("28 nov – 2 dic");
    expect(formatRange("2026-10-22", "2026-10-22")).toBe("22 oct");
    expect(formatMonthYear("2026-11")).toBe("noviembre de 2026");
  });

  it("counts Monday–Friday days and rejects inverted or invalid ranges", () => {
    expect(workDaysBetween("2026-12-14", "2026-12-20")).toBe(5);
    expect(workDaysBetween("2026-12-19", "2026-12-20")).toBe(0);
    expect(workDaysBetween("2026-12-20", "2026-12-14")).toBe(0);
    expect(workDaysBetween("2026-02-30", "2026-03-02")).toBe(0);
  });

  it("allows cancel for pending and future approved requests only", () => {
    const today = "2026-11-07";
    expect(canCancelRequest(PENDING_FUTURE, today)).toBe(true);
    expect(canCancelRequest(APPROVED_FUTURE, today)).toBe(true);
    expect(canCancelRequest(APPROVED_PAST, today)).toBe(false);
    expect(canCancelRequest(REJECTED, today)).toBe(false);
    expect(canCancelRequest({ ...APPROVED_FUTURE, from: today }, today)).toBe(false);
  });

  it("uses the Mexico City day", () => {
    expect(todayIso(new Date("2026-11-08T04:00:00.000Z"))).toBe("2026-11-07");
  });

  it("shapes the balance and the history for the widgets", () => {
    expect(balanceKpis(BALANCE).map((k) => [k.label, k.display ?? k.value])).toEqual([
      ["Disponibles", "9 de 20"],
      ["Tomados", 6],
      ["Pendientes", 5],
    ]);
    const table = historyTable([PENDING_FUTURE], { withActions: false });
    expect(table.columns.map((c) => c.key)).not.toContain("acciones");
    expect(table.rows[0]).toMatchObject({ fechas: "14 – 18 dic", dias: 5, tipo: "Vacaciones", estado: "Pendiente" });
  });
});
