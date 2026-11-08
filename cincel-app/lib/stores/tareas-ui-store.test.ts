// @vitest-environment node
/**
 * `useTareasUi` (zustand.md §2.4): select and clear the calendar day, the
 * reset (store action, `resetTareasUi` and the identity-change reset), and
 * clearing a day that falls outside the visible range.
 */
import { describe, expect, it } from "vitest";

import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import {
  TAREAS_UI_INITIAL,
  clearSelectedDayOutside,
  resetTareasUi,
  selectSelectedDay,
  useTareasUi,
} from "@/lib/stores/tareas-ui-store";

const state = () => useTareasUi.getState();

describe("useTareasUi", () => {
  it("starts with no selected day", () => {
    expect(TAREAS_UI_INITIAL).toEqual({ calendar: { selectedDay: null } });
    expect(selectSelectedDay(state())).toBeNull();
  });

  it("selectCalendarDay sets and clears the day", () => {
    state().selectCalendarDay("2026-11-06");
    expect(selectSelectedDay(state())).toBe("2026-11-06");
    state().selectCalendarDay(null);
    expect(selectSelectedDay(state())).toBeNull();
  });

  it("reset, resetTareasUi and resetClientState go back to the initial state", () => {
    state().selectCalendarDay("2026-11-06");
    state().reset();
    expect(state().calendar).toEqual(TAREAS_UI_INITIAL.calendar);

    state().selectCalendarDay("2026-11-07");
    resetTareasUi();
    expect(selectSelectedDay(state())).toBeNull();

    state().selectCalendarDay("2026-11-08");
    resetClientState(createTestQueryClient());
    expect(selectSelectedDay(state())).toBeNull();
  });

  it("clears the day only when it is outside the visible range", () => {
    state().selectCalendarDay("2026-11-06");
    expect(clearSelectedDayOutside({ from: "2026-10-26", to: "2026-12-06" })).toBe(false);
    expect(selectSelectedDay(state())).toBe("2026-11-06");
    // Bounds are inclusive.
    expect(clearSelectedDayOutside({ from: "2026-11-06", to: "2026-11-06" })).toBe(false);

    expect(clearSelectedDayOutside({ from: "2026-11-30", to: "2027-01-03" })).toBe(true);
    expect(selectSelectedDay(state())).toBeNull();
    // Nothing selected: nothing to clear.
    expect(clearSelectedDayOutside({ from: "2026-11-30", to: "2027-01-03" })).toBe(false);
  });
});
