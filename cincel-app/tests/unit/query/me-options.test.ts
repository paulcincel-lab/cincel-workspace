// @vitest-environment node
/**
 * `me.today` / `me.profile` options and the own-profile action (#954, S2).
 */
import { describe, expect, expectTypeOf, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMyTodayAction: vi.fn(),
  requireCapabilityUser: vi.fn(),
  getStaffPhotoUrl: vi.fn(),
}));

vi.mock("@/lib/actions/time-tracking-actions", () => ({ fetchMyTodayAction: mocks.fetchMyTodayAction }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: mocks.requireCapabilityUser }));
vi.mock("@/lib/profile-photo/photo-url", () => ({ getStaffPhotoUrl: mocks.getStaffPhotoUrl }));

import { fetchMyProfileAction } from "@/lib/actions/page-data/me-actions";
import { qk, STALE } from "@/lib/query/keys";
import { ME_TODAY_REFETCH_MS, meProfileOptions, meTodayOptions } from "@/lib/query/options/me";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { TodayStatus } from "@/lib/types/redesign";
import type { MyProfile, ShellBadges } from "@/lib/types/shell";
import type { BandejaBadgeData } from "@/lib/shell/sidebar-slots/bandeja-badge-view";

const TODAY: TodayStatus = {
  state: "on",
  startedAt: "2026-11-08T15:00:00Z",
  workedSeconds: 600,
  required: true,
  promptAtLogin: false,
  enabled: true,
  requiredFrom: null,
  hoursPerDay: 8,
};

const SELF = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

function asUser(id: string, name: string) {
  mocks.requireCapabilityUser.mockResolvedValue({ member: { id, name }, access: "Colaborador" });
}

describe("meTodayOptions", () => {
  it("uses qk.me.today(), 60 s stale, a 5 min background refetch and focus refetch", () => {
    const options = meTodayOptions();
    expect(options.queryKey).toEqual(qk.me.today());
    expect(options.staleTime).toBe(STALE.meToday);
    expect(options.staleTime).toBe(60_000);
    expect(options.refetchInterval).toBe(ME_TODAY_REFETCH_MS);
    expect(ME_TODAY_REFETCH_MS).toBe(5 * 60_000);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.initialData).toBeUndefined();
  });

  it("seeds the layout's status as initialData", () => {
    expect(meTodayOptions(TODAY).initialData).toEqual(TODAY);
  });

  it("loads through fetchMyTodayAction", async () => {
    mocks.fetchMyTodayAction.mockResolvedValue(TODAY);
    const client = createTestQueryClient();
    await expect(client.fetchQuery(meTodayOptions())).resolves.toEqual(TODAY);
    expect(mocks.fetchMyTodayAction).toHaveBeenCalledTimes(1);
  });
});

describe("meProfileOptions", () => {
  it("uses qk.me.profile() and 5 min stale", () => {
    const options = meProfileOptions();
    expect(options.queryKey).toEqual(qk.me.profile());
    expect(options.staleTime).toBe(STALE.meProfile);
    expect(options.initialData).toBeUndefined();
  });

  it("seeds the cache without a request", () => {
    const seed: MyProfile = { id: SELF, name: "Ana", photoUrl: null };
    const client = createTestQueryClient();
    const { queryKey, initialData } = meProfileOptions(seed);
    client.getQueryCache().build(client, { queryKey, initialData });
    expect(client.getQueryData(qk.me.profile())).toEqual(seed);
    expect(mocks.requireCapabilityUser).not.toHaveBeenCalled();
  });

  it("loads the caller's own { id, name, photoUrl }", async () => {
    asUser(SELF, "Ana López");
    mocks.getStaffPhotoUrl.mockResolvedValue(`/api/staff/${SELF}/photo?v=abcd1234`);
    const client = createTestQueryClient();
    await expect(client.fetchQuery(meProfileOptions())).resolves.toEqual({
      id: SELF,
      name: "Ana López",
      photoUrl: `/api/staff/${SELF}/photo?v=abcd1234`,
    });
  });
});

describe("fetchMyProfileAction", () => {
  it("returns exactly id, name and photoUrl", async () => {
    asUser(SELF, "Ana López");
    mocks.getStaffPhotoUrl.mockResolvedValue(null);
    const profile = await fetchMyProfileAction();
    expect(Object.keys(profile).sort()).toEqual(["id", "name", "photoUrl"]);
    expect(profile).toEqual({ id: SELF, name: "Ana López", photoUrl: null });
  });

  it("only ever reads the session's own profile, whatever the caller sends", async () => {
    asUser(SELF, "Ana López");
    mocks.getStaffPhotoUrl.mockResolvedValue(null);
    mocks.getStaffPhotoUrl.mockClear();
    const call = fetchMyProfileAction as unknown as (input: unknown) => Promise<MyProfile>;
    const profile = await call({ id: OTHER, staffId: OTHER });
    expect(profile.id).toBe(SELF);
    expect(mocks.getStaffPhotoUrl).toHaveBeenCalledTimes(1);
    expect(mocks.getStaffPhotoUrl).toHaveBeenCalledWith(SELF);
  });

  it("rejects without a session", async () => {
    mocks.requireCapabilityUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    mocks.getStaffPhotoUrl.mockClear();
    await expect(fetchMyProfileAction()).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.getStaffPhotoUrl).not.toHaveBeenCalled();
  });
});

describe("shell types", () => {
  it("freezes ShellBadges as { tareasOpen, bandeja }", () => {
    expectTypeOf<ShellBadges>().toEqualTypeOf<{ tareasOpen: number; bandeja: BandejaBadgeData }>();
    expectTypeOf<MyProfile>().toEqualTypeOf<{ id: string; name: string; photoUrl: string | null }>();
  });
});
