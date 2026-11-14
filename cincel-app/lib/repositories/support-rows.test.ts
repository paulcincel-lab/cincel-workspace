// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { decodeCursor, encodeCursor } from "@/lib/repositories/support-rows";

describe("ticket cursor", () => {
  it("round-trips", () => {
    const row = { createdAt: new Date("2026-11-13T10:00:00.123Z"), id: "22222222-2222-4222-8222-222222222222" };
    expect(decodeCursor(encodeCursor(row))).toEqual({ createdAt: "2026-11-13T10:00:00.123Z", id: row.id });
  });

  it("ignores a malformed cursor", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(Buffer.from("not-a-date|22222222-2222-4222-8222-222222222222").toString("base64url"))).toBeNull();
  });
});
