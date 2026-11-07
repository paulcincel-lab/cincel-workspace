/**
 * Control de horario state machine (redesign BE §8.7, §9.5, §16): the state
 * table, `workedSeconds` with pauses, and the `enabled` / `required` /
 * `promptAtLogin` table for the disabled, trial, required, non-work day and
 * exempt cases. Times are America/Mexico_City (UTC−6).
 */
import { describe, expect, it } from "vitest";

import type { TimeEntryRow } from "@/lib/repositories/time-entries-repository";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import { clockState, entryWorkedSeconds, todayStatus, workedSeconds } from "@/lib/time-tracking/state";
import { dayOfWeek, localDate, localHourMinute, mondayOf } from "@/lib/time-tracking/local-time";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

/** Monday 2026-11-09 at a local `HH:MM`. */
function at(hm: string, date = "2026-11-09"): Date {
  return new Date(`${date}T${hm}:00-06:00`);
}

function entry(partial: Partial<TimeEntryRow> & { startedAt: Date }): TimeEntryRow {
  return {
    id: crypto.randomUUID(),
    staffId: "s1",
    workDate: localDate(partial.startedAt),
    endedAt: null,
    pauses: [],
    source: "sidebar",
    closedBy: null,
    flagged: false,
    note: null,
    createdAt: partial.startedAt,
    updatedAt: partial.startedAt,
    ...partial,
  };
}

const ON: TimeTrackingSettings = { ...DEFAULT_TIME_TRACKING_SETTINGS, enabled: true, requiredFrom: "2026-11-01" };

describe("local time", () => {
  it("uses America/Mexico_City for the day, the time and the week", () => {
    const lateNight = new Date("2026-11-10T03:30:00Z"); // 21:30 on Monday the 9th
    expect(localDate(lateNight)).toBe("2026-11-09");
    expect(localHourMinute(lateNight)).toBe("21:30");
    expect(dayOfWeek("2026-11-09")).toBe(1);
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
  });
});

describe("clockState", () => {
  it("no entry → off", () => {
    expect(clockState([])).toBe("off");
  });
  it("open entry without pauses → on", () => {
    expect(clockState([entry({ startedAt: at("09:00") })])).toBe("on");
  });
  it("open entry with an open last pause → pausa", () => {
    const e = entry({ startedAt: at("09:00"), pauses: [{ from: at("11:00").toISOString(), to: null }] });
    expect(clockState([e])).toBe("pausa");
  });
  it("open entry whose pauses are all closed → on", () => {
    const e = entry({
      startedAt: at("09:00"),
      pauses: [{ from: at("11:00").toISOString(), to: at("11:15").toISOString() }],
    });
    expect(clockState([e])).toBe("on");
  });
  it("entries but none open → done", () => {
    const e = entry({ startedAt: at("09:00"), endedAt: at("13:00"), closedBy: "user" });
    expect(clockState([e])).toBe("done");
  });
  it("a closed entry and a new open one → on", () => {
    const closed = entry({ startedAt: at("08:00"), endedAt: at("09:00"), closedBy: "user" });
    expect(clockState([closed, entry({ startedAt: at("10:00") })])).toBe("on");
  });
});

describe("workedSeconds", () => {
  it("counts an open entry up to now", () => {
    expect(entryWorkedSeconds(entry({ startedAt: at("09:00") }), at("10:30"))).toBe(5400);
  });
  it("deducts closed pauses", () => {
    const e = entry({
      startedAt: at("09:00"),
      endedAt: at("13:00"),
      pauses: [
        { from: at("10:00").toISOString(), to: at("10:15").toISOString() },
        { from: at("11:00").toISOString(), to: at("11:30").toISOString() },
      ],
    });
    expect(entryWorkedSeconds(e, at("18:00"))).toBe(4 * 3600 - 45 * 60);
  });
  it("deducts an open pause up to now", () => {
    const e = entry({ startedAt: at("09:00"), pauses: [{ from: at("10:00").toISOString(), to: null }] });
    expect(entryWorkedSeconds(e, at("10:20"))).toBe(3600);
  });
  it("sums every entry of the day", () => {
    const first = entry({ startedAt: at("08:00"), endedAt: at("09:00"), closedBy: "user" });
    const second = entry({ startedAt: at("10:00") });
    expect(workedSeconds([first, second], at("10:30"))).toBe(5400);
  });
  it("is never negative", () => {
    expect(entryWorkedSeconds(entry({ startedAt: at("10:00") }), at("09:00"))).toBe(0);
  });
});

describe("todayStatus", () => {
  const monday = at("10:00");
  const saturday = at("10:00", "2026-11-14");

  it("disabled → off, not enabled, not required, no prompt", () => {
    const status = todayStatus({
      entries: [entry({ startedAt: at("09:00") })],
      settings: { ...ON, enabled: false },
      role: "Colaborador",
      now: monday,
    });
    expect(status).toEqual({
      state: "off",
      startedAt: null,
      workedSeconds: 0,
      required: false,
      promptAtLogin: false,
      enabled: false,
      requiredFrom: "2026-11-01",
      hoursPerDay: 8,
    });
  });

  it("exempt role → reported like disabled", () => {
    const status = todayStatus({
      entries: [],
      settings: { ...ON, exemptRoles: ["Dirección"] },
      role: "Dirección",
      now: monday,
    });
    expect(status.enabled).toBe(false);
    expect(status.required).toBe(false);
    expect(status.promptAtLogin).toBe(false);
    expect(status.state).toBe("off");
  });

  it("an exempt list that doesn't hold the role leaves it enabled", () => {
    const status = todayStatus({ entries: [], settings: { ...ON, exemptRoles: ["Dirección"] }, role: "Colaborador", now: monday });
    expect(status.enabled).toBe(true);
  });

  it("trial (before requiredFrom) → enabled, not required, prompt shown", () => {
    const status = todayStatus({ entries: [], settings: { ...ON, requiredFrom: "2026-12-01" }, role: "Colaborador", now: monday });
    expect(status).toMatchObject({ enabled: true, required: false, promptAtLogin: true, requiredFrom: "2026-12-01" });
  });

  it("no requiredFrom → never required", () => {
    const status = todayStatus({ entries: [], settings: { ...ON, requiredFrom: null }, role: "Colaborador", now: monday });
    expect(status).toMatchObject({ enabled: true, required: false });
  });

  it("from requiredFrom on a work day → required", () => {
    expect(todayStatus({ entries: [], settings: ON, role: "Colaborador", now: monday }).required).toBe(true);
    const onTheDay = todayStatus({ entries: [], settings: { ...ON, requiredFrom: "2026-11-09" }, role: "Colaborador", now: monday });
    expect(onTheDay.required).toBe(true);
  });

  it("non-work day → not required, no prompt", () => {
    const status = todayStatus({ entries: [], settings: ON, role: "Colaborador", now: saturday });
    expect(status).toMatchObject({ enabled: true, required: false, promptAtLogin: false, state: "off" });
  });

  it("prompt only while off, before dayEnd and with the org prompt on", () => {
    const open = entry({ startedAt: at("09:00") });
    expect(todayStatus({ entries: [open], settings: ON, role: "Colaborador", now: monday }).promptAtLogin).toBe(false);
    expect(todayStatus({ entries: [], settings: ON, role: "Colaborador", now: at("18:00") }).promptAtLogin).toBe(false);
    expect(todayStatus({ entries: [], settings: ON, role: "Colaborador", now: at("17:59") }).promptAtLogin).toBe(true);
    expect(
      todayStatus({ entries: [], settings: { ...ON, promptAtLogin: false }, role: "Colaborador", now: monday }).promptAtLogin,
    ).toBe(false);
    const closed = entry({ startedAt: at("08:00"), endedAt: at("09:00"), closedBy: "user" });
    expect(todayStatus({ entries: [closed], settings: ON, role: "Colaborador", now: monday }).promptAtLogin).toBe(false);
  });

  it("reports the first entrada, the worked seconds and hoursPerDay", () => {
    const first = entry({ startedAt: at("08:00"), endedAt: at("09:00"), closedBy: "user" });
    const second = entry({ startedAt: at("09:30"), pauses: [{ from: at("09:45").toISOString(), to: null }] });
    const status = todayStatus({ entries: [second, first], settings: { ...ON, hoursPerDay: 6 }, role: "Colaborador", now: monday });
    expect(status).toMatchObject({
      state: "pausa",
      startedAt: at("08:00").toISOString(),
      workedSeconds: 3600 + 15 * 60,
      hoursPerDay: 6,
      enabled: true,
    });
  });
});
