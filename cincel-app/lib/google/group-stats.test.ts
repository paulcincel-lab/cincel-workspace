// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryClient } from "@/lib/google/directory";
import { DirectoryError } from "@/lib/google/directory";
import type { GroupMapping } from "@/lib/types/workspace-access";

import { clearGroupStatsCache, withGroupStats } from "./group-stats";

function mapping(groupEmail: string, id = groupEmail): GroupMapping {
  return { id, groupEmail, kind: "role", role: "Colaborador", positionId: null, positionName: null, rank: 0, memberCount: null, exists: null };
}

function directory(overrides: Partial<DirectoryClient> = {}): DirectoryClient {
  return {
    getUserStatus: vi.fn(),
    hasMember: vi.fn(),
    getGroup: vi.fn(async (email: string) => (email === "externos@cincel.mx" ? null : { id: `id-${email}`, email, name: email })),
    countMembers: vi.fn(async () => 7),
    ...overrides,
  };
}

beforeEach(() => {
  clearGroupStatsCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("withGroupStats", () => {
  it("fills the member count and flags a group that no longer exists", async () => {
    const result = await withGroupStats([mapping("equipo@cincel.mx"), mapping("externos@cincel.mx")], {
      directory: directory(),
    });
    expect(result.map(({ groupEmail, memberCount, exists }) => ({ groupEmail, memberCount, exists }))).toEqual([
      { groupEmail: "equipo@cincel.mx", memberCount: 7, exists: true },
      { groupEmail: "externos@cincel.mx", memberCount: null, exists: false },
    ]);
  });

  it("leaves every mapping unchecked without a Directory client", async () => {
    const [row] = await withGroupStats([mapping("equipo@cincel.mx")], { directory: null });
    expect(row).toMatchObject({ memberCount: null, exists: null });
  });

  it("a lookup error leaves both facts null and is not cached", async () => {
    const failing = directory({
      countMembers: vi.fn(async () => {
        throw new DirectoryError("simulada", "http", 403);
      }),
    });
    const [row] = await withGroupStats([mapping("equipo@cincel.mx")], { directory: failing });
    expect(row).toMatchObject({ memberCount: null, exists: null });

    const healthy = directory();
    const [again] = await withGroupStats([mapping("equipo@cincel.mx")], { directory: healthy });
    expect(again).toMatchObject({ memberCount: 7, exists: true });
    expect(healthy.getGroup).toHaveBeenCalledTimes(1);
  });

  it("caches per group email for the TTL, then asks again", async () => {
    let now = 1_000;
    const client = directory();
    const options = { directory: client, now: () => now, ttlMs: 30_000 };

    await withGroupStats([mapping("equipo@cincel.mx", "a"), mapping("Equipo@cincel.mx", "b")], options);
    expect(client.getGroup).toHaveBeenCalledTimes(1);

    now += 10_000;
    await withGroupStats([mapping("equipo@cincel.mx")], options);
    expect(client.getGroup).toHaveBeenCalledTimes(1);

    now += 30_000;
    await withGroupStats([mapping("equipo@cincel.mx")], options);
    expect(client.getGroup).toHaveBeenCalledTimes(2);
  });
});
