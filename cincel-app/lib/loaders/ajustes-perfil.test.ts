// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  results: [] as Array<{ rows?: unknown[]; error?: Error }>,
  fetchMyWeekHoursAction: vi.fn(),
  getTimeTrackingSettings: vi.fn(),
  trackingEnabled: vi.fn(),
}));

/** A drizzle-like chain: every method returns the chain, awaiting it yields the next queued result. */
function chain(): unknown {
  const result = m.results.shift() ?? { rows: [] };
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          result.error ? reject(result.error) : resolve(result.rows ?? []);
      }
      if (prop === "catch") {
        return (onRejected: (e: unknown) => unknown) =>
          result.error ? Promise.resolve(onRejected(result.error)) : Promise.resolve(result.rows ?? []);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/lib/db/client", () => ({ db: { select: () => chain() } }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({ fetchMyWeekHoursAction: m.fetchMyWeekHoursAction }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({ IMPLEMENTED: { fetchMyWeekHoursAction: true } }));
vi.mock("@/lib/time-tracking/settings", () => ({ getTimeTrackingSettings: m.getTimeTrackingSettings }));
vi.mock("@/lib/time-tracking/state", () => ({ trackingEnabled: m.trackingEnabled }));
vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: {} }));
vi.mock("@/lib/auth/google-health", () => ({ loadGoogleHealth: vi.fn() }));
vi.mock("@/lib/gmail/access", () => ({ loadGmailAccess: vi.fn() }));
vi.mock("@/lib/google/group-stats", () => ({ withGroupStats: vi.fn() }));
vi.mock("@/lib/google/picker-drive", () => ({ getPickerDriveGrant: vi.fn(), isPickerDriveConfigured: vi.fn() }));
vi.mock("@/lib/notifications/preferences-server", () => ({ loadNotificationPreferences: vi.fn() }));
vi.mock("@/lib/repositories/positions-repository", () => ({ listPositions: vi.fn() }));
vi.mock("@/lib/repositories/workspace-group-mappings-repository", () => ({ listGroupMappings: vi.fn() }));
vi.mock("@/lib/time-tracking/report", () => ({ teamHoursReport: vi.fn() }));
vi.mock("@/lib/ui/preferences-server", () => ({ getStoredOrgAppearance: vi.fn(), withoutVersion: vi.fn() }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { loadAjustesPerfil } from "./ajustes";

const user = {
  member: { id: "00000000-0000-4000-8000-0000000000aa", name: "Ana Ruiz" },
  email: "ana@cincel.mx",
  access: "Administrador",
} as unknown as AuthenticatedUser;

const WEEK = { days: [{ date: "2026-11-09", hours: 8 }], total: 8, target: 40 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.getTimeTrackingSettings.mockResolvedValue({});
  m.trackingEnabled.mockReturnValue(true);
  m.fetchMyWeekHoursAction.mockResolvedValue(WEEK);
});

describe("loadAjustesPerfil", () => {
  it("returns plain, serializable data (it is dehydrated into the page)", async () => {
    m.results = [
      { rows: [{ name: "Ana R.", phone: "55", email: "a@b.c", emailSignature: "Ana" }] },
      { rows: [{ name: "Diseño" }, { name: "Obra" }] },
    ];
    const data = await loadAjustesPerfil(user);
    expect(data).toEqual({
      profile: { staffId: user.member.id, name: "Ana R.", phone: "55", email: "a@b.c", puesto: "Diseño, Obra", emailSignature: "Ana", week: WEEK },
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("falls back to the session identity when there is no staff row", async () => {
    m.results = [{ rows: [] }, { rows: [] }];
    const { profile } = await loadAjustesPerfil(user);
    expect(profile).toMatchObject({ name: "Ana Ruiz", email: "ana@cincel.mx", phone: "", puesto: "", emailSignature: "" });
  });

  it("a failed puestos read leaves the puesto empty instead of failing the page", async () => {
    m.results = [{ rows: [{ name: "Ana", phone: null, email: null, emailSignature: null }] }, { error: new Error("boom") }];
    const { profile } = await loadAjustesPerfil(user);
    expect(profile.puesto).toBe("");
    expect(profile.name).toBe("Ana");
  });

  it("a failed week-hours read leaves week null instead of failing the page", async () => {
    m.fetchMyWeekHoursAction.mockRejectedValue(new Error("boom"));
    m.results = [{ rows: [] }, { rows: [] }];
    const { profile } = await loadAjustesPerfil(user);
    expect(profile.week).toBeNull();
  });
});
