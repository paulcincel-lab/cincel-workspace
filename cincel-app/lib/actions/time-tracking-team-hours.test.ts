// @vitest-environment node
/**
 * `fetchTeamHoursAction` guards (redesign BE §7.7, §9.10): `FORBIDDEN`
 * without `canViewTeamHours` (Administrador, Dirección), `INVALID` unless
 * `weekStart` is a Monday, otherwise the report of the stored settings. The
 * error codes surface through `actionErrorText`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: "Administrador" as string }));
const report = vi.hoisted(() => ({ teamHoursReport: vi.fn(async () => []) }));
const settings = vi.hoisted(() => ({ getTimeTrackingSettings: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
      role: state.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "ana@cincel.example",
    access: state.access,
  })),
}));
vi.mock("@/lib/time-tracking/report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/report")>()),
  teamHoursReport: report.teamHoursReport,
}));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/settings")>()),
  getTimeTrackingSettings: settings.getTimeTrackingSettings,
}));

import { fetchTeamHoursAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";

beforeEach(() => {
  state.access = "Administrador";
  report.teamHoursReport.mockClear();
  settings.getTimeTrackingSettings.mockResolvedValue({ ...DEFAULT_TIME_TRACKING_SETTINGS, enabled: true });
});

describe("fetchTeamHoursAction", () => {
  it("is flagged implemented", () => {
    expect(IMPLEMENTED.fetchTeamHoursAction).toBe(true);
  });

  it("FORBIDDEN without canViewTeamHours", async () => {
    state.access = "Colaborador";
    const error = await fetchTeamHoursAction({ weekStart: "2026-11-09" }).catch((err: unknown) => err);
    expect(String(error)).toMatch(/FORBIDDEN/);
    expect(actionErrorText(error)).toBe("No tienes permiso para realizar esta acción.");
    expect(report.teamHoursReport).not.toHaveBeenCalled();
  });

  it("INVALID when weekStart is not a Monday or not a date", async () => {
    for (const weekStart of ["2026-11-10", "2026-11-15", "9-11-2026", ""]) {
      const error = await fetchTeamHoursAction({ weekStart }).catch((err: unknown) => err);
      expect(String(error)).toMatch(/INVALID/);
      expect(actionErrorText(error)).toBe("Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.");
    }
    expect(report.teamHoursReport).not.toHaveBeenCalled();
  });

  it.each(["Administrador", "Dirección"])("%s gets the report of the stored settings", async (access) => {
    state.access = access;
    await expect(fetchTeamHoursAction({ weekStart: "2026-11-09" })).resolves.toEqual([]);
    expect(report.teamHoursReport).toHaveBeenCalledWith(
      expect.anything(),
      "2026-11-09",
      expect.objectContaining({ enabled: true }),
    );
  });
});
