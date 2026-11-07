// @vitest-environment node
/**
 * Reminder repeat advancement and helpers (redesign BE §8.5, §9.3, §16):
 * daily, weekly and monthly on the 31st (clamped to month end, back on the
 * 31st when the month allows) until the next `dueAt` is in the future.
 * America/Mexico_City is UTC−6 all year, so local 09:00 is 15:00Z.
 */
import { describe, expect, it } from "vitest";

import { nextOccurrence, reminderDedupeKey, reminderUrl, toReminder } from "./reminders";

const d = (iso: string) => new Date(iso);

describe("nextOccurrence", () => {
  it("daily: one day later at the same local time", () => {
    expect(nextOccurrence(d("2026-11-06T15:00:00Z"), "daily", d("2026-11-06T15:00:30Z")).toISOString()).toBe(
      "2026-11-07T15:00:00.000Z",
    );
  });

  it("daily: skips every missed day until it is in the future", () => {
    expect(nextOccurrence(d("2026-11-06T15:00:00Z"), "daily", d("2026-11-09T16:00:00Z")).toISOString()).toBe(
      "2026-11-10T15:00:00.000Z",
    );
  });

  it("weekly: seven days later, same weekday and time", () => {
    expect(nextOccurrence(d("2026-11-13T23:00:00Z"), "weekly", d("2026-11-13T23:00:10Z")).toISOString()).toBe(
      "2026-11-20T23:00:00.000Z",
    );
    expect(nextOccurrence(d("2026-11-13T23:00:00Z"), "weekly", d("2026-12-01T00:00:00Z")).toISOString()).toBe(
      "2026-12-04T23:00:00.000Z",
    );
  });

  it("monthly on the 31st clamps to the month end", () => {
    expect(nextOccurrence(d("2027-01-31T15:00:00Z"), "monthly", d("2027-01-31T15:00:30Z")).toISOString()).toBe(
      "2027-02-28T15:00:00.000Z",
    );
    expect(nextOccurrence(d("2026-10-31T15:00:00Z"), "monthly", d("2026-10-31T15:01:00Z")).toISOString()).toBe(
      "2026-11-30T15:00:00.000Z",
    );
    expect(nextOccurrence(d("2028-01-31T15:00:00Z"), "monthly", d("2028-01-31T16:00:00Z")).toISOString()).toBe(
      "2028-02-29T15:00:00.000Z",
    );
  });

  it("monthly on the 31st returns to the 31st when the month allows", () => {
    expect(nextOccurrence(d("2027-01-31T15:00:00Z"), "monthly", d("2027-03-01T00:00:00Z")).toISOString()).toBe(
      "2027-03-31T15:00:00.000Z",
    );
    expect(nextOccurrence(d("2026-10-31T15:00:00Z"), "monthly", d("2026-12-01T00:00:00Z")).toISOString()).toBe(
      "2026-12-31T15:00:00.000Z",
    );
  });

  it("monthly across the year end", () => {
    expect(nextOccurrence(d("2026-12-15T15:00:00Z"), "monthly", d("2026-12-15T15:00:01Z")).toISOString()).toBe(
      "2027-01-15T15:00:00.000Z",
    );
  });

  it("is strictly after now", () => {
    expect(nextOccurrence(d("2026-11-06T15:00:00Z"), "daily", d("2026-11-07T15:00:00Z")).toISOString()).toBe(
      "2026-11-08T15:00:00.000Z",
    );
  });

  it("keeps the local time of day when dueAt is late in the local evening", () => {
    // 23:30 local on Nov 6 is 05:30Z on Nov 7.
    expect(nextOccurrence(d("2026-11-07T05:30:00Z"), "daily", d("2026-11-07T05:31:00Z")).toISOString()).toBe(
      "2026-11-08T05:30:00.000Z",
    );
  });
});

describe("reminder helpers", () => {
  it("dedupe key is recordatorio:<id>:<dueAt ISO>", () => {
    expect(reminderDedupeKey("r1", d("2026-11-07T15:00:00Z"))).toBe("recordatorio:r1:2026-11-07T15:00:00.000Z");
  });

  it("url opens the linked task, else the project, else Mi espacio", () => {
    expect(reminderUrl({ taskId: "t1", projectId: "p1" })).toBe("/tareas/t1");
    expect(reminderUrl({ taskId: null, projectId: "p1" })).toBe("/proyectos/p1");
    expect(reminderUrl({ taskId: null, projectId: null })).toBe("/mi-espacio");
  });

  it("maps a row to the Reminder DTO", () => {
    const now = d("2026-11-06T20:14:00Z");
    expect(
      toReminder({
        id: "r1",
        staffId: "s1",
        text: "llamar",
        dueAt: d("2026-11-07T15:00:00Z"),
        repeat: "weekly",
        channels: ["app", "email"],
        taskId: null,
        projectId: "p1",
        firedAt: null,
        cancelledAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    ).toEqual({
      id: "r1",
      text: "llamar",
      dueAt: "2026-11-07T15:00:00.000Z",
      repeat: "weekly",
      channels: ["app", "email"],
      taskId: null,
      projectId: "p1",
      firedAt: null,
      cancelledAt: "2026-11-06T20:14:00.000Z",
    });
  });
});
