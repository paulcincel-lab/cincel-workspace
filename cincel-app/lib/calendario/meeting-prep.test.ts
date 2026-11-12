// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  buildAgenda,
  daysBetween,
  formatMeetingWhen,
  formatShortDate,
  planDelta,
  prepSummary,
} from "./meeting-prep";

describe("planDelta", () => {
  it("is the canvas -8 against a linear plan", () => {
    // 14 of 20 days elapsed = 70 % expected; the project is at 62 %.
    expect(planDelta({ progress: 62, startDate: "2026-11-01", endDate: "2026-11-21", today: "2026-11-15" })).toBe(-8);
  });

  it("is positive when ahead and zero on the plan", () => {
    expect(planDelta({ progress: 80, startDate: "2026-11-01", endDate: "2026-11-21", today: "2026-11-15" })).toBe(10);
    expect(planDelta({ progress: 50, startDate: "2026-11-01", endDate: "2026-11-21", today: "2026-11-11" })).toBe(0);
  });

  it("clamps the plan before the start and after the end", () => {
    expect(planDelta({ progress: 10, startDate: "2026-12-01", endDate: "2026-12-31", today: "2026-11-11" })).toBe(10);
    expect(planDelta({ progress: 90, startDate: "2026-10-01", endDate: "2026-10-31", today: "2026-11-11" })).toBe(-10);
  });

  it("is null without both dates", () => {
    expect(planDelta({ progress: 50, startDate: null, endDate: "2026-11-21", today: "2026-11-11" })).toBeNull();
    expect(planDelta({ progress: 50, startDate: "2026-11-01", endDate: null, today: "2026-11-11" })).toBeNull();
  });

  it("handles a one-day project", () => {
    expect(planDelta({ progress: 100, startDate: "2026-11-11", endDate: "2026-11-11", today: "2026-11-11" })).toBe(0);
  });
});

describe("dates", () => {
  it("formats short dates and day math", () => {
    expect(formatShortDate("2026-10-28")).toBe("28 oct");
    expect(daysBetween("2026-11-09", "2026-11-11")).toBe(2);
    expect(addDaysIso("2026-11-28", 14)).toBe("2026-12-12");
  });

  it("formats the meeting time", () => {
    expect(
      formatMeetingWhen({ start: { date: "2026-11-12", time: "10:00" }, end: { date: "2026-11-12", time: "11:00" } }),
    ).toBe("jueves 12 nov, 10:00 – 11:00");
  });
});

describe("buildAgenda", () => {
  it("gives the canvas agenda: overdue, open point of the last minutes, deliveries", () => {
    const agenda = buildAgenda({
      overdue: [{ taskId: "t1", title: "Ingenierías" }],
      openPoints: [{ text: "Decisión de acabado de cocina", date: "2026-10-28" }],
      deliveries: [{ taskId: "t3", title: "Proyecto ejecutivo" }],
    });
    expect(agenda).toEqual([
      "Avance y nueva fecha de Ingenierías",
      "Decisión de acabado de cocina (pendiente del 28 oct)",
      "Fechas de entrega de proyecto ejecutivo",
    ]);
  });

  it("does not repeat a delivery that is already an overdue item", () => {
    const agenda = buildAgenda({
      overdue: [{ taskId: "t1", title: "Ingenierías" }],
      openPoints: [],
      deliveries: [{ taskId: "t1", title: "Ingenierías" }],
    });
    expect(agenda).toEqual(["Avance y nueva fecha de Ingenierías"]);
  });

  it("deduplicates ignoring case and accents", () => {
    const agenda = buildAgenda({
      overdue: [],
      openPoints: [
        { text: "Decisión de acabado", date: "2026-10-28" },
        { text: "decision de ACABADO", date: "2026-10-28" },
      ],
      deliveries: [],
    });
    expect(agenda).toHaveLength(1);
  });

  it("keeps at most 8 items of at most 200 characters", () => {
    const overdue = Array.from({ length: 12 }, (_, i) => ({ taskId: `t${i}`, title: `Tarea ${i} ${"x".repeat(300)}` }));
    const agenda = buildAgenda({ overdue, openPoints: [], deliveries: [] });
    expect(agenda).toHaveLength(8);
    expect(agenda.every((item) => item.length <= 200)).toBe(true);
  });

  it("is empty with nothing to discuss", () => {
    expect(buildAgenda({ overdue: [], openPoints: [], deliveries: [] })).toEqual([]);
  });
});

describe("prepSummary", () => {
  it("says how far behind the plan, why and what stayed open", () => {
    const text = prepSummary({
      hasProject: true,
      delta: -8,
      overdue: [{ title: "Ingenierías", daysLate: 2 }],
      overdueCount: 1,
      lastMeeting: { date: "2026-10-28", openPoints: ["Acabado de la cocina"] },
    });
    expect(text).toBe(
      "El proyecto va 8 puntos atrás del plan por Ingenierías (vencida 2 días). En la junta del 28 oct quedó abierto: acabado de la cocina.",
    );
  });

  it("counts overdue tasks when the plan is not behind", () => {
    const text = prepSummary({ hasProject: true, delta: 3, overdue: [{ title: "A", daysLate: 1 }], overdueCount: 1, lastMeeting: null });
    expect(text).toBe("El proyecto va 3 puntos adelante del plan. Hay 1 tarea vencida antes de la reunión.");
  });

  it("covers a meeting without a project and a clean one", () => {
    expect(prepSummary({ hasProject: false, delta: null, overdue: [], overdueCount: 0, lastMeeting: null })).toBe(
      "Esta reunión no tiene proyecto. No hay tareas vencidas.",
    );
    expect(prepSummary({ hasProject: true, delta: 0, overdue: [], overdueCount: 0, lastMeeting: null })).toBe(
      "El proyecto va al día con el plan. No hay tareas vencidas.",
    );
  });
});
