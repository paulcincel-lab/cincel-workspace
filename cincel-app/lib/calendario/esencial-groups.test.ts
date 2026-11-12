import { describe, expect, it } from "vitest";

import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { esencialGroups, lineLabel, VENCIDAS_CAP, whenLabel } from "@/lib/calendario/esencial-groups";
import type { CalEventItem, CalTaskItem } from "@/lib/types/calendario";

const TODAY = "2026-11-11";

function task(id: string, date: string, extra: Partial<CalTaskItem> = {}): CalTaskItem {
  return {
    kind: "task", id: `t:${id}`, taskId: id, title: `Tarea ${id}`, date, dateField: "commitmentDate",
    project: { id: "p", name: "Madrid 22" }, tramo: { id: "w", key: "diseno", name: "Diseño", colorSlot: 2 }, phase: null,
    status: "pendiente", statusLabel: "Pendiente", priority: "media", manager: null, support: [],
    overdue: false, completed: false, blocked: false, hours: 1, hoursSource: "default", parentTaskId: null, canEdit: true, ...extra,
  };
}
function meeting(id: string, date: string, start: string): CalEventItem {
  return {
    kind: "event", id: `e:${id}`, eventId: id, source: "cincel", title: `Reunión ${id}`, date, start, end: start, allDay: false,
    project: { id: "p", name: "Madrid 22" }, tramo: null, location: null, meetUrl: null, attendees: [], attendeeCount: 0,
    organizer: null, googleHtmlLink: null, syncedAt: null, syncError: null, minutes: "ninguna", canEdit: true,
  };
}
function rangeWith(items: (CalTaskItem | CalEventItem)[], from = "2026-11-01", to = "2026-12-12") {
  return { ...emptyCalendarioRange({ from, to }, TODAY), items };
}

describe("esencialGroups", () => {
  const items = [
    task("o1", "2026-11-09", { overdue: true }),
    task("o2", "2026-11-05", { overdue: true }),
    task("h", TODAY),
    meeting("m", TODAY, "2026-11-11T10:00:00-06:00"),
    task("mañ", "2026-11-12"),
    task("sem", "2026-11-13"),
    task("fin", "2026-11-15"),
    task("mes", "2026-11-20"),
    task("dic", "2026-12-03"),
  ];

  it("Día: Vencidas and Hoy only, Vencidas first", () => {
    const groups = esencialGroups(rangeWith(items), "dia");
    expect(groups.map((g) => g.key)).toEqual(["vencidas", "hoy"]);
    expect(groups[0].sub).toBe("2 tareas");
    expect(groups[1].items.map((i) => i.id)).toEqual(["e:m", "t:h"]);
    expect(groups[1].sub).toBe("mié 11 nov");
  });

  it("Semana: adds Mañana and Esta semana", () => {
    const groups = esencialGroups(rangeWith(items), "semana");
    expect(groups.map((g) => g.key)).toEqual(["vencidas", "hoy", "manana", "semana"]);
    expect(groups[3].sub).toBe("vie 13 – dom 15");
    expect(groups[3].items).toHaveLength(2);
  });

  it("Mes: adds Resto de noviembre and hides empty groups", () => {
    const groups = esencialGroups(rangeWith(items), "mes");
    const rest = groups.find((g) => g.key === "mes");
    expect(rest?.title).toBe("Resto de noviembre");
    expect(rest?.sub).toBe("16 – 30 nov");
    expect(rest?.items.map((i) => i.id)).toEqual(["t:mes"]);
    expect(esencialGroups(rangeWith([]), "mes")).toEqual([]);
  });

  it("caps Vencidas at 20 and keeps the total", () => {
    const many = Array.from({ length: 25 }, (_, i) => task(`v${i}`, "2026-11-02", { overdue: true }));
    const [vencidas] = esencialGroups(rangeWith(many), "mes");
    expect(vencidas.items).toHaveLength(VENCIDAS_CAP);
    expect(vencidas.total).toBe(25);
  });

  it("a completed overdue task is not under Vencidas", () => {
    const groups = esencialGroups(rangeWith([task("c", TODAY, { overdue: true, completed: true })]), "dia");
    expect(groups.map((g) => g.key)).toEqual(["hoy"]);
  });
});

describe("row labels", () => {
  it("builds the line and the when", () => {
    expect(lineLabel(meeting("m", TODAY, "2026-11-11T10:00:00-06:00"))).toBe("Reunión · Madrid 22");
    expect(lineLabel(task("a", TODAY))).toBe("Madrid 22 · Diseño");
    expect(whenLabel(task("a", TODAY), "hoy", TODAY)).toBe("hoy");
    expect(whenLabel(task("a", "2026-11-12"), "manana", TODAY)).toBe("12 nov");
  });
});
