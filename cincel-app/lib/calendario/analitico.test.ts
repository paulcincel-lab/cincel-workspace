import { describe, expect, it } from "vitest";

import { emptyDay } from "@/lib/calendario/empty";
import type { CalDay, CalEventItem, CalTaskItem } from "@/lib/types/calendario";

import {
  buildGroups,
  groupCaption,
  isoWeek,
  kpiItems,
  peopleOf,
  rangeCaption,
  remainingOf,
  rowsOfGroup,
  shortDate,
  timeOf,
} from "./analitico";

const day = (date: string, tasks = 0, events = 0): CalDay => ({ ...emptyDay(date), tasks, events });

const task = (date: string, manager: CalTaskItem["manager"] = null): CalTaskItem => ({
  kind: "task",
  id: `t:${date}`,
  taskId: date,
  title: "Ingenierías",
  date,
  dateField: "commitmentDate",
  project: null,
  tramo: null,
  phase: null,
  status: "pendiente",
  statusLabel: "Pendiente",
  priority: "media",
  manager,
  support: [],
  overdue: false,
  completed: false,
  blocked: false,
  hours: 1,
  hoursSource: "default",
  parentTaskId: null,
  canEdit: true,
});

const meeting = (date: string, patch: Partial<CalEventItem> = {}): CalEventItem => ({
  kind: "event",
  id: `e:${date}`,
  eventId: date,
  source: "cincel",
  title: "Revisión",
  date,
  start: `${date}T10:00:00-06:00`,
  end: `${date}T11:00:00-06:00`,
  allDay: false,
  project: null,
  tramo: null,
  location: null,
  meetUrl: null,
  attendees: [{ name: "Ana García", staffId: null, response: "pendiente" }],
  attendeeCount: 3,
  organizer: null,
  googleHtmlLink: null,
  syncedAt: null,
  syncError: null,
  minutes: "ninguna",
  canEdit: true,
  ...patch,
});

describe("analitico dates", () => {
  it("formats the short date and the ISO week", () => {
    expect(shortDate("2026-11-11")).toBe("mié 11");
    expect(isoWeek("2026-11-11")).toBe(46);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
  });

  it("writes the range caption per vista", () => {
    const input = { fecha: "2026-11-11", from: "2026-11-09", to: "2026-11-15", today: "2026-11-11" };
    expect(rangeCaption("dia", { ...input, from: "2026-11-11", to: "2026-11-11" })).toBe("Hoy, miércoles 11 nov · por hora");
    expect(rangeCaption("semana", input)).toBe("Semana 46, 9 – 15 nov · por día");
    expect(rangeCaption("mes", { ...input, from: "2026-10-26", to: "2026-12-06" })).toBe("Noviembre 2026 · agrupado por semana");
  });
});

describe("buildGroups", () => {
  const days = [day("2026-11-09", 2, 1), day("2026-11-10"), day("2026-11-11", 1, 0)];

  it("Día is one group with the day's total", () => {
    const groups = buildGroups("dia", [day("2026-11-11", 2, 1)], "asc", "2026-11-11");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "d:2026-11-11", label: "Hoy · miércoles 11 nov", count: 3, caption: "3 elementos" });
  });

  it("Semana is one group per day and desc reverses them", () => {
    expect(buildGroups("semana", days, "asc", "2026-11-11").map((g) => g.id)).toEqual(["d:2026-11-09", "d:2026-11-10", "d:2026-11-11"]);
    expect(buildGroups("semana", days, "desc", "2026-11-11").map((g) => g.id)).toEqual(["d:2026-11-11", "d:2026-11-10", "d:2026-11-09"]);
  });

  it("Mes is one group per ISO week with the summed count", () => {
    const month = [day("2026-11-08", 1), day("2026-11-09", 2), day("2026-11-10", 0, 1), day("2026-11-15", 4), day("2026-11-16", 1)];
    const groups = buildGroups("mes", month, "asc", "2026-11-11");
    expect(groups.map((g) => [g.id, g.label, g.count])).toEqual([
      ["w:2026-11-02", "Semana 45 · 8 nov", 1],
      ["w:2026-11-09", "Semana 46 · 9 – 15 nov", 7],
      ["w:2026-11-16", "Semana 47 · 16 nov", 1],
    ]);
  });

  it("places loaded rows by date and counts what is left", () => {
    const [group] = buildGroups("semana", [day("2026-11-09", 3)], "asc", "2026-11-11");
    const rows = rowsOfGroup(group, [task("2026-11-09"), task("2026-11-10"), meeting("2026-11-09")]);
    expect(rows.map((r) => r.id)).toEqual(["t:2026-11-09", "e:2026-11-09"]);
    expect(remainingOf(group, rows.length)).toBe(1);
    expect(remainingOf(group, 5)).toBe(0);
    expect(groupCaption(1)).toBe("1 elemento");
  });
});

describe("kpis and cells", () => {
  it("builds the four KPIs from the range", () => {
    const items = kpiItems({ tasks: 12, meetings: 3, meetingHours: 4.5, overdue: 2, overduePct: 17, unassigned: 1 });
    expect(items.map((i) => [i.label, i.value, i.secondary])).toEqual([
      ["TAREAS", 12, "en el rango"],
      ["REUNIONES", 3, "4.5 h en total"],
      ["VENCIDAS", 2, "17 % del rango"],
      ["SIN RESPONSABLE", 1, "asígnalas desde la celda"],
    ]);
    expect(items[2].tone).toBe("destructive");
  });

  it("shows time and people", () => {
    expect(timeOf(task("2026-11-11"))).toBe("—");
    expect(timeOf(meeting("2026-11-11"))).toBe("10:00");
    expect(timeOf(meeting("2026-11-11", { allDay: true }))).toBe("Todo el día");
    expect(peopleOf(meeting("2026-11-11"))).toBe("Ana García +2");
    expect(peopleOf(task("2026-11-11", { id: "s1", name: "Luis Martínez" }))).toBe("Luis Martínez");
    expect(peopleOf(task("2026-11-11"))).toBe("—");
  });
});
