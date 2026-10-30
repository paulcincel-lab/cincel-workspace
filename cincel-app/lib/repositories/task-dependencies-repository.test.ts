import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  DEPENDENCY_CYCLE_MAX_DEPTH,
  type DependsOnLookup,
  wouldCreateCycle,
} from "./task-dependencies-repository";

/** `edges[a]` = tasks `a` depends on. */
function lookupFrom(
  edges: Record<string, string[]>,
): DependsOnLookup & { calls: number } {
  const fn = Object.assign(
    async (ids: string[]) => {
      fn.calls++;
      return ids.flatMap((id) => edges[id] ?? []);
    },
    { calls: 0 },
  );
  return fn;
}

/** t0 → t1 → … → t{length}. */
function chain(length: number): Record<string, string[]> {
  const edges: Record<string, string[]> = {};
  for (let i = 0; i < length; i++) edges[`t${i}`] = [`t${i + 1}`];
  return edges;
}

describe("wouldCreateCycle", () => {
  it("allows an edge with no path back", async () => {
    await expect(
      wouldCreateCycle("a", "b", lookupFrom({ b: ["c"], c: [] })),
    ).resolves.toBe(false);
  });

  it("detects a direct cycle (b already depends on a)", async () => {
    await expect(
      wouldCreateCycle("a", "b", lookupFrom({ b: ["a"] })),
    ).resolves.toBe(true);
  });

  it("detects an indirect cycle through several tasks", async () => {
    const edges = { b: ["c"], c: ["d", "x"], d: ["a"] };
    await expect(wouldCreateCycle("a", "b", lookupFrom(edges))).resolves.toBe(
      true,
    );
  });

  it("treats self as a cycle without a lookup", async () => {
    const lookup = lookupFrom({});
    await expect(wouldCreateCycle("a", "a", lookup)).resolves.toBe(true);
    expect(lookup.calls).toBe(0);
  });

  it("visits shared ancestors once and terminates on existing loops", async () => {
    const lookup = lookupFrom({ b: ["c", "d"], c: ["e"], d: ["e"], e: ["c"] });
    await expect(wouldCreateCycle("a", "b", lookup)).resolves.toBe(false);
    expect(lookup.calls).toBeLessThanOrEqual(4);
  });

  it("walks up to the depth limit and refuses past it", async () => {
    const within = lookupFrom(chain(DEPENDENCY_CYCLE_MAX_DEPTH - 1));
    await expect(wouldCreateCycle("a", "t0", within)).resolves.toBe(false);
    expect(within.calls).toBe(DEPENDENCY_CYCLE_MAX_DEPTH);

    const beyond = lookupFrom(chain(DEPENDENCY_CYCLE_MAX_DEPTH + 5));
    await expect(wouldCreateCycle("a", "t0", beyond)).resolves.toBe(true);
    expect(beyond.calls).toBe(DEPENDENCY_CYCLE_MAX_DEPTH);
  });

  it("finds a cycle closing at the last level within the limit", async () => {
    const edges = chain(DEPENDENCY_CYCLE_MAX_DEPTH - 1);
    edges[`t${DEPENDENCY_CYCLE_MAX_DEPTH - 1}`] = ["a"];
    await expect(wouldCreateCycle("a", "t0", lookupFrom(edges))).resolves.toBe(
      true,
    );
  });

  it("honors a custom max depth", async () => {
    await expect(
      wouldCreateCycle("a", "t0", lookupFrom(chain(5)), 3),
    ).resolves.toBe(true);
    await expect(
      wouldCreateCycle("a", "t0", lookupFrom(chain(2)), 3),
    ).resolves.toBe(false);
  });
});
