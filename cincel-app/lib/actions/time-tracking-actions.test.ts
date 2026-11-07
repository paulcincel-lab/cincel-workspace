/**
 * Control de horario actions (redesign BE §7.7, §9.5, §16 Actions): auth and
 * error codes for allowed / denied roles, `DISABLED` for the disabled feature
 * and exempt roles, `INVALID` source, revalidation of the settings save, the
 * disabled `fetchMyTodayAction` shape, and the caller's Mon–Sun week.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimeEntryRow } from "@/lib/repositories/time-entries-repository";
import { DEFAULT_TIME_TRACKING_SETTINGS, serializeTimeTrackingSettings } from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

const ADMIN = { member: { id: "staff-admin", role: "Administrador" }, access: "Administrador" };
const COLLABORATOR = { member: { id: "staff-colab", role: "Arquitecto" }, access: "Colaborador" };
const DIRECTOR = { member: { id: "staff-dir", role: "Director" }, access: "Dirección" };

const currentUser = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => currentUser.value) }));
vi.mock("@/lib/auth/permissions", () => ({
  canManageTimeTracking: (user: { access?: string } | null) => user?.access === "Administrador",
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/db/client", () => ({ db: { marker: "db" } }));

/** In-memory `app_settings('time_tracking')`. */
const settingsRow = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/lib/repositories/app-settings-repository", () => ({
  getAppSetting: vi.fn(async () => settingsRow.value),
  setAppSetting: vi.fn(async (_key: string, value: string | null) => {
    settingsRow.value = value;
    return new Date();
  }),
}));

const clock = vi.hoisted(() => ({
  entries: [] as TimeEntryRow[],
  listDayEntries: vi.fn(async () => clock.entries),
  clockIn: vi.fn(async () => undefined),
  pauseWork: vi.fn(async () => undefined),
  resumeWork: vi.fn(async () => undefined),
  clockOut: vi.fn(async () => undefined),
}));
vi.mock("@/lib/time-tracking/clock", () => clock);

const weekHours = vi.hoisted(() => vi.fn());
vi.mock("@/lib/time-tracking/week-hours", () => ({ weekHours }));
const approvedAbsences = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vacations/approved-absences", () => ({ approvedAbsences }));

import {
  clockInAction,
  clockOutAction,
  fetchMyTodayAction,
  fetchMyWeekHoursAction,
  fetchTimeTrackingSettingsAction,
  pauseWorkAction,
  resumeWorkAction,
  saveTimeTrackingSettingsAction,
} from "./time-tracking-actions";
import { IMPLEMENTED } from "./time-tracking-actions.flags";

/** Monday 2026-11-09, 10:00 in America/Mexico_City. */
const NOW = new Date("2026-11-09T10:00:00-06:00");

function settings(patch: Partial<TimeTrackingSettings> = {}): TimeTrackingSettings {
  return { ...DEFAULT_TIME_TRACKING_SETTINGS, workDays: [1, 2, 3, 4, 5], exemptRoles: [], ...patch };
}

function store(value: TimeTrackingSettings | null) {
  settingsRow.value = value === null ? null : serializeTimeTrackingSettings(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  currentUser.value = COLLABORATOR;
  clock.entries = [];
  store(settings({ enabled: true, requiredFrom: "2026-11-01" }));
  weekHours.mockResolvedValue(new Map());
  approvedAbsences.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("flags", () => {
  it("flips every action this file implements", () => {
    expect(IMPLEMENTED).toMatchObject({
      fetchTimeTrackingSettingsAction: true,
      saveTimeTrackingSettingsAction: true,
      fetchMyTodayAction: true,
      clockInAction: true,
      pauseWorkAction: true,
      resumeWorkAction: true,
      clockOutAction: true,
      fetchMyWeekHoursAction: true,
    });
  });
});

describe("fetchTimeTrackingSettingsAction", () => {
  it("returns the seeded defaults when no row exists", async () => {
    store(null);
    await expect(fetchTimeTrackingSettingsAction()).resolves.toEqual(DEFAULT_TIME_TRACKING_SETTINGS);
  });

  it("returns the stored settings to any staff", async () => {
    await expect(fetchTimeTrackingSettingsAction()).resolves.toMatchObject({ enabled: true, requiredFrom: "2026-11-01" });
  });

  it("requires a session", async () => {
    const { requireCapabilityUser } = await import("@/lib/auth/session");
    vi.mocked(requireCapabilityUser).mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(fetchTimeTrackingSettingsAction()).rejects.toThrow(/^FORBIDDEN/);
  });
});

describe("saveTimeTrackingSettingsAction", () => {
  it("refuses non-managers with FORBIDDEN and writes nothing", async () => {
    for (const user of [COLLABORATOR, DIRECTOR]) {
      currentUser.value = user;
      await expect(saveTimeTrackingSettingsAction(settings({ hoursPerDay: 7 }))).rejects.toThrow(/^FORBIDDEN/);
    }
    const repo = await import("@/lib/repositories/app-settings-repository");
    expect(repo.setAppSetting).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves for an admin and revalidates the layout and /ajustes/horario", async () => {
    currentUser.value = ADMIN;
    const next = settings({ enabled: true, requiredFrom: "2026-11-01", hoursPerDay: 7, exemptRoles: ["Dirección"] });
    await expect(saveTimeTrackingSettingsAction(next)).resolves.toEqual(next);
    expect(JSON.parse(settingsRow.value!)).toEqual({ version: 1, data: next });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/ajustes/horario");
  });

  it("rejects every INVALID rule", async () => {
    currentUser.value = ADMIN;
    const bad: Partial<TimeTrackingSettings>[] = [
      { dayStart: "18:00", dayEnd: "09:00" },
      { hoursPerDay: 13 },
      { workDays: [] },
      { workDays: [8] },
      { exemptRoles: ["Cliente"] },
      { requiredFrom: "2026-11-09" },
    ];
    for (const patch of bad) {
      await expect(saveTimeTrackingSettingsAction(settings({ requiredFrom: "2026-11-01", ...patch }))).rejects.toThrow(
        /^INVALID/,
      );
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a requiredFrom of tomorrow", async () => {
    currentUser.value = ADMIN;
    await expect(saveTimeTrackingSettingsAction(settings({ requiredFrom: "2026-11-10" }))).resolves.toMatchObject({
      requiredFrom: "2026-11-10",
    });
  });
});

describe("fetchMyTodayAction", () => {
  it("returns the disabled shape and reads no entries when the feature is off", async () => {
    store(null);
    await expect(fetchMyTodayAction()).resolves.toEqual({
      state: "off",
      startedAt: null,
      workedSeconds: 0,
      required: false,
      promptAtLogin: false,
      enabled: false,
      requiredFrom: null,
      hoursPerDay: 8,
    });
    expect(clock.listDayEntries).not.toHaveBeenCalled();
  });

  it("returns the caller's own day with requiredFrom and hoursPerDay", async () => {
    await expect(fetchMyTodayAction()).resolves.toMatchObject({
      state: "off",
      enabled: true,
      required: true,
      promptAtLogin: true,
      requiredFrom: "2026-11-01",
      hoursPerDay: 8,
    });
    expect(clock.listDayEntries).toHaveBeenCalledWith({ marker: "db" }, "staff-colab", "2026-11-09");
  });

  it("is disabled for an exempt role", async () => {
    store(settings({ enabled: true, exemptRoles: ["Dirección"] }));
    currentUser.value = DIRECTOR;
    await expect(fetchMyTodayAction()).resolves.toMatchObject({ enabled: false, required: false, promptAtLogin: false });
  });
});

describe("clock writes", () => {
  const writes = [
    ["clockInAction", () => clockInAction({ source: "sidebar" }), clock.clockIn],
    ["pauseWorkAction", () => pauseWorkAction(), clock.pauseWork],
    ["resumeWorkAction", () => resumeWorkAction(), clock.resumeWork],
    ["clockOutAction", () => clockOutAction(), clock.clockOut],
  ] as const;

  for (const [name, call, impl] of writes) {
    it(`${name} throws DISABLED when the feature is off`, async () => {
      store(settings({ enabled: false }));
      await expect(call()).rejects.toThrow(/^DISABLED/);
      expect(impl).not.toHaveBeenCalled();
    });

    it(`${name} throws DISABLED for an exempt role`, async () => {
      store(settings({ enabled: true, exemptRoles: ["Dirección"] }));
      currentUser.value = DIRECTOR;
      await expect(call()).rejects.toThrow(/^DISABLED/);
      expect(impl).not.toHaveBeenCalled();
    });

    it(`${name} runs on the session's own staff id for any staff role`, async () => {
      for (const user of [COLLABORATOR, ADMIN, DIRECTOR]) {
        currentUser.value = user;
        await call();
        expect(impl).toHaveBeenLastCalledWith({ marker: "db" }, user.member.id, ...(name === "clockInAction" ? ["sidebar"] : []), NOW);
      }
    });
  }

  it("clockInAction rejects an unknown source with INVALID", async () => {
    await expect(clockInAction({ source: "email" as never })).rejects.toThrow(/^INVALID/);
    expect(clock.clockIn).not.toHaveBeenCalled();
  });

  it("passes ALREADY_ON / NOT_ON through", async () => {
    clock.clockIn.mockRejectedValueOnce(new Error("ALREADY_ON"));
    await expect(clockInAction({ source: "login" })).rejects.toThrow(/^ALREADY_ON/);
    clock.pauseWork.mockRejectedValueOnce(new Error("NOT_ON"));
    await expect(pauseWorkAction()).rejects.toThrow(/^NOT_ON/);
  });

  it("returns the new status from the caller's entries", async () => {
    clock.clockIn.mockImplementationOnce(async () => {
      clock.entries = [
        {
          id: "e1",
          staffId: "staff-colab",
          workDate: "2026-11-09",
          startedAt: new Date("2026-11-09T09:00:00-06:00"),
          endedAt: null,
          pauses: [],
          source: "sidebar",
          closedBy: null,
          flagged: false,
          note: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ];
    });
    await expect(clockInAction({ source: "sidebar" })).resolves.toMatchObject({
      state: "on",
      workedSeconds: 3600,
      promptAtLogin: false,
      enabled: true,
    });
  });
});

describe("fetchMyWeekHoursAction", () => {
  it("returns the caller's Mon–Sun week with the target minus approved vacations", async () => {
    weekHours.mockResolvedValue(
      new Map([
        [
          "staff-colab",
          {
            days: [
              { date: "2026-11-09", hours: 8 },
              { date: "2026-11-10", hours: 7.5 },
            ],
            total: 15.5,
          },
        ],
      ]),
    );
    approvedAbsences.mockResolvedValue([{ staffId: "staff-colab", from: "2026-11-12", to: "2026-11-16", kind: "vacaciones" }]);

    const week = await fetchMyWeekHoursAction();

    expect(weekHours).toHaveBeenCalledWith({ marker: "db" }, ["staff-colab"], "2026-11-09", expect.any(Object));
    expect(approvedAbsences).toHaveBeenCalledWith({ marker: "db" }, {
      from: "2026-11-09",
      to: "2026-11-15",
      staffIds: ["staff-colab"],
    });
    expect(week.days.map((day) => day.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(week.days.slice(0, 3).map((day) => day.hours)).toEqual([8, 7.5, 0]);
    expect(week.total).toBe(15.5);
    // Mon–Fri are work days; Thu and Fri are covered by the vacation.
    expect(week.target).toBe(24);
  });

  it("ignores another person's absences", async () => {
    approvedAbsences.mockResolvedValue([{ staffId: "someone-else", from: "2026-11-09", to: "2026-11-15", kind: "vacaciones" }]);
    await expect(fetchMyWeekHoursAction()).resolves.toMatchObject({ total: 0, target: 40 });
  });
});
