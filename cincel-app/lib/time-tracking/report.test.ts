// @vitest-environment node
/**
 * Weekly hours report and payroll CSV rules (redesign BE §7.7, §8.7):
 * 2-decimal day hours, the lunch rule, target minus approved absences,
 * statuses, late count, trial days left out of the CSV, formula escaping
 * and the BOM.
 */
import { describe, expect, it } from "vitest";

import { localInstant } from "@/lib/time-tracking/auto-close";
import {
  buildHoursCsvRows,
  buildTeamHoursRows,
  dayHours,
  HOURS_CSV_COLUMNS,
  type ReportEntry,
} from "@/lib/time-tracking/report";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";
import { buildCsv, CSV_BOM, csvCell, escapeCsvFormula } from "@/lib/utils/export-service";

const settings: TimeTrackingSettings = {
  ...DEFAULT_TIME_TRACKING_SETTINGS,
  enabled: true,
  requiredFrom: "2026-11-01",
  dayStart: "09:00",
  dayEnd: "18:00",
  hoursPerDay: 8,
  lateToleranceMin: 15,
  workDays: [1, 2, 3, 4, 5],
  lunchMinutes: 60,
};

const WEEK = "2026-11-09"; // Monday
const NOW = localInstant("2026-11-20", "12:00");

function entry(
  staffId: string,
  date: string,
  from: string,
  to: string | null,
  pauses: [string, string | null][] = [],
  extra: Partial<ReportEntry> = {},
): ReportEntry {
  return {
    staffId,
    workDate: date,
    startedAt: localInstant(date, from),
    endedAt: to === null ? null : localInstant(date, to),
    pauses: pauses.map(([a, b]) => ({
      from: localInstant(date, a).toISOString(),
      to: b === null ? null : localInstant(date, b).toISOString(),
    })),
    source: "sidebar",
    flagged: false,
    ...extra,
  };
}

describe("dayHours", () => {
  it("keeps 2 decimals", () => {
    expect(dayHours([entry("a", WEEK, "09:00", "09:20")], settings, NOW)).toBe(0.33);
  });

  it("deducts lunch on a day of ≥ 5 worked hours without a pause of ≥ 30 min", () => {
    expect(dayHours([entry("a", WEEK, "09:00", "15:00")], settings, NOW)).toBe(5);
    expect(dayHours([entry("a", WEEK, "09:00", "15:00", [["12:00", "12:15"]])], settings, NOW)).toBe(4.75);
  });

  it("keeps the hours when a pause of ≥ 30 min exists or the day is under 5 h", () => {
    expect(dayHours([entry("a", WEEK, "09:00", "18:00", [["13:00", "14:00"]])], settings, NOW)).toBe(8);
    expect(dayHours([entry("a", WEEK, "09:00", "18:00", [["13:00", "13:30"]])], settings, NOW)).toBe(8.5);
    expect(dayHours([entry("a", WEEK, "09:00", "13:30")], settings, NOW)).toBe(4.5);
  });

  it("counts an open entry until now", () => {
    const now = localInstant(WEEK, "11:30");
    expect(dayHours([entry("a", WEEK, "09:00", null)], settings, now)).toBe(2.5);
  });
});

describe("buildTeamHoursRows", () => {
  const people = [
    { id: "a", name: "Ana", lastName: "Ruiz" },
    { id: "b", name: "Beto", lastName: null },
    { id: "c", name: "Carla", lastName: "Paz" },
  ];
  const entries: ReportEntry[] = [
    entry("a", "2026-11-09", "09:00", "18:00", [["13:00", "14:00"]]), // 8
    entry("a", "2026-11-10", "09:10", "15:00"), // 5.83 − 1 = 4.83, not late (tolerance 15)
    entry("a", "2026-11-12", "09:20", "10:20"), // 1, late
    entry("a", "2026-11-14", "10:00", "11:00"), // Saturday: 1, never late
    entry("c", "2026-11-09", "09:00", "18:00", [["13:00", "14:00"]]),
    entry("c", "2026-11-10", "09:00", "18:00", [["13:00", "14:00"]]),
  ];
  const absences = [{ staffId: "c", from: "2026-11-11", to: "2026-11-14" }];
  const rows = buildTeamHoursRows({ weekStart: WEEK, settings, people, entries, absences, now: NOW });
  const byId = new Map(rows.map((row) => [row.staffId, row]));

  it("returns Mon–Sun days and the totals", () => {
    const ana = byId.get("a")!;
    expect(ana.name).toBe("Ana Ruiz");
    expect(ana.days.map((day) => day.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(ana.days.map((day) => day.hours)).toEqual([8, 4.83, 0, 1, 0, 1, 0]);
    expect(ana.total).toBe(14.83);
    expect(ana.target).toBe(40);
    expect(ana.lateCount).toBe(1);
    expect(ana.status).toBe("incompleto");
  });

  it("sin_registro without entries", () => {
    expect(byId.get("b")).toMatchObject({ total: 0, target: 40, lateCount: 0, status: "sin_registro" });
  });

  it("subtracts approved absence work days from the target", () => {
    expect(byId.get("c")).toMatchObject({ total: 16, target: 16, status: "completo" });
  });

  it("sorts rows by name", () => {
    expect(rows.map((row) => row.name)).toEqual(["Ana Ruiz", "Beto", "Carla Paz"]);
  });
});

describe("buildHoursCsvRows", () => {
  const people = [{ id: "a", name: "=Ana", lastName: null }];
  const entries = [
    entry("a", "2026-11-09", "09:00", "18:00", [["13:00", "14:00"]]),
    entry("a", "2026-11-11", "09:00", "18:00", [["13:00", "14:00"]]),
    entry("a", "2026-11-12", "09:00", "20:00", [["19:30", "20:00"]], { flagged: true }),
    entry("b", "2026-11-12", "09:00", "10:00"),
  ];

  it("leaves out the days before requiredFrom and counts them", () => {
    const { rows, trialDays } = buildHoursCsvRows({
      settings: { ...settings, requiredFrom: "2026-11-11" },
      people,
      entries,
      now: NOW,
    });
    expect(trialDays).toBe(1);
    expect(rows).toEqual([
      ["=Ana", "2026-11-11", "09:00", "18:00", "60", "8.00", "sidebar", "no"],
      ["=Ana", "2026-11-12", "09:00", "20:00", "30", "10.50", "sidebar", "sí"],
    ]);
  });

  it("exports nothing while there is no requiredFrom (everything is trial)", () => {
    const { rows, trialDays } = buildHoursCsvRows({ settings: { ...settings, requiredFrom: null }, people, entries, now: NOW });
    expect(rows).toEqual([]);
    expect(trialDays).toBe(3);
  });
});

describe("CSV builder", () => {
  it("prefixes formula-leading cells with an apostrophe", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(escapeCsvFormula(`${lead}1`)).toBe(`'${lead}1`);
    }
    expect(escapeCsvFormula("Ana")).toBe("Ana");
    expect(escapeCsvFormula("1-2")).toBe("1-2");
  });

  it("quotes commas, quotes and line breaks after escaping", () => {
    expect(csvCell('Ruiz, "Ana"')).toBe('"Ruiz, ""Ana"""');
    expect(csvCell("\rx")).toBe("\"'\rx\"");
    expect(csvCell(null)).toBe("");
  });

  it("starts with the BOM, the header and uses CRLF", () => {
    const csv = buildCsv(HOURS_CSV_COLUMNS, [["=SUM(A1)", "2026-11-11", "09:00", "", "0", "1.00", "login", "no"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe(
      "persona,fecha,entrada,salida,pausas_min,horas,origen,marcada\r\n'=SUM(A1),2026-11-11,09:00,,0,1.00,login,no\r\n",
    );
  });
});
