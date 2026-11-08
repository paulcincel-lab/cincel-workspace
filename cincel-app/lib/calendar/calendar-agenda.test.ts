import { describe, expect, it } from "vitest";

import {
  calendarFetchRange,
  calendarTitle,
  eventHref,
  eventIdFromHref,
  navLabels,
  shiftCursor,
  shortDayLabel,
  toAgendaItem,
  tramoColorVarFor,
  visibleRange,
  weekDailySummary,
} from "./calendar-agenda";
import type { CalendarEvent } from "@/lib/types/calendar";
import type { WorkflowRef } from "@/lib/types/core";

const TRAMOS: WorkflowRef[] = [
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
];

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "c-diseno-t1-2026-11-06",
    taskId: "t1",
    date: "2026-11-06",
    time: "09:30",
    title: "Planos ejecutivos",
    project: "Residencia Valle Alto",
    responsible: "Ana Ruiz",
    tramo: "diseno",
    tramoLabel: "Diseño",
    phaseId: null,
    phaseLabel: "",
    type: "Compromiso",
    href: "/actividades/diseno",
    ...overrides,
  };
}

const FRIDAY = new Date(2026, 10, 6);

describe("calendar titles and navigation", () => {
  it("formats lowercase es-MX titles per mode", () => {
    expect(calendarTitle("mes", FRIDAY)).toBe("noviembre de 2026");
    expect(calendarTitle("semana", FRIDAY)).toBe("2 – 8 de noviembre de 2026");
    expect(calendarTitle("semana", new Date(2026, 11, 1))).toBe("30 de noviembre – 6 de diciembre de 2026");
    expect(calendarTitle("dia", FRIDAY)).toBe("viernes, 6 de noviembre de 2026");
    expect(shortDayLabel(FRIDAY)).toBe("viernes 6");
  });

  it("labels prev / next per mode", () => {
    expect(navLabels("mes")).toEqual({ prev: "Mes anterior", next: "Mes siguiente" });
    expect(navLabels("semana").prev).toBe("Semana anterior");
    expect(navLabels("dia").next).toBe("Día siguiente");
  });

  it("computes the visible range and steps the cursor", () => {
    expect(visibleRange("mes", FRIDAY)).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect(visibleRange("semana", FRIDAY)).toEqual({ from: "2026-10-26", to: "2026-11-08" });
    expect(visibleRange("dia", FRIDAY)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(shiftCursor("mes", FRIDAY, 1)).toEqual(new Date(2026, 11, 1));
    expect(shiftCursor("semana", FRIDAY, -1)).toEqual(new Date(2026, 9, 26));
    expect(shiftCursor("dia", FRIDAY, 1)).toEqual(new Date(2026, 10, 7));
  });
});

describe("agenda items", () => {
  it("round-trips the event id through the href", () => {
    const e = event({});
    expect(eventHref(e)).toBe("/tareas?tarea=t1#evento-c-diseno-t1-2026-11-06");
    expect(eventIdFromHref(eventHref(e))).toBe(e.id);
    expect(eventIdFromHref("/tareas?tarea=t1")).toBeNull();
  });

  it("maps deliveries to all-day items and keeps other times estimated", () => {
    expect(toAgendaItem(event({}), TRAMOS)).toMatchObject({ start: "2026-11-06T09:30:00", estimated: true, allDay: false, tramo: "diseno" });
    expect(toAgendaItem(event({ type: "Fecha de entrega" }), TRAMOS)).toMatchObject({ start: "2026-11-06", allDay: true, estimated: false });
    expect(toAgendaItem(event({ tramo: "admin" }), TRAMOS).tramo).toBeNull();
    expect(toAgendaItem(event({}), TRAMOS).meetingUrl).toBeUndefined();
  });

  it("colors tramos by catalog order and leaves others neutral", () => {
    expect(tramoColorVarFor("presale", TRAMOS)).toBe("var(--chart-1)");
    expect(tramoColorVarFor("construccion", TRAMOS)).toBe("var(--chart-3)");
    expect(tramoColorVarFor("sin-tramo", TRAMOS)).toBe("var(--muted-foreground)");
  });
});

describe("weekDailySummary", () => {
  it("counts events per day with Δ vs the same weekday of last week", () => {
    const table = weekDailySummary(
      [
        event({ id: "a" }),
        event({ id: "b", type: "Fecha de entrega" }),
        event({ id: "c", date: "2026-10-30" }),
        event({ id: "d", date: "2026-11-02" }),
      ],
      FRIDAY
    );
    const friday = table.rows[4];
    expect(friday).toMatchObject({ eventos: 2, entregas: 1, delta: 1, carga: 67 });
    expect(table.rows[0]).toMatchObject({ eventos: 1, delta: 1, carga: 33 });
    expect(table.totals).toBe("auto");
  });
});

describe("calendarFetchRange", () => {
  it("is the month grid for Mes and for every Día of the month", () => {
    const grid = { from: "2026-10-26", to: "2026-12-06" };
    expect(calendarFetchRange("mes", new Date(2026, 10, 6))).toEqual(grid);
    expect(calendarFetchRange("dia", new Date(2026, 10, 1))).toEqual(grid);
    expect(calendarFetchRange("dia", new Date(2026, 10, 30))).toEqual(grid);
  });

  it("adds Semana's previous week when it starts before the grid", () => {
    // Week of Nov 2: the previous week (Oct 26) is the grid's first week.
    expect(calendarFetchRange("semana", new Date(2026, 10, 2))).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    // Week of Dec 1 (Monday Nov 30) in December's grid (Nov 30 – Jan 3): the previous week starts Nov 23.
    expect(calendarFetchRange("semana", new Date(2026, 11, 1))).toEqual({ from: "2026-11-23", to: "2027-01-03" });
  });

  it("never exceeds 62 days", () => {
    const span = ({ from, to }: { from: string; to: string }) =>
      Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    for (let m = 0; m < 24; m += 1) {
      for (const mode of ["mes", "semana", "dia"] as const) {
        expect(span(calendarFetchRange(mode, new Date(2026, m, 1)))).toBeLessThanOrEqual(62);
      }
    }
  });
});
