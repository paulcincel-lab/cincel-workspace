import { describe, expect, it } from "vitest";
import { djb2 } from "./hash";
import hashFixture from "./__fixtures__/hash-fixture.json";

describe("djb2", () => {
  it.each(hashFixture as Array<{ tarea: string; expected: string }>)(
    "matches the reference hash for %j",
    ({ tarea, expected }) => {
      expect(djb2(tarea)).toBe(expected);
    }
  );
});
