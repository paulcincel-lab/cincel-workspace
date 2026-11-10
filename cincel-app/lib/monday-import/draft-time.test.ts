// @vitest-environment node
import { describe, expect, it } from "vitest";

import { draftHeaderLine, draftSavedAgo } from "./draft-time";

const NOW = Date.parse("2026-11-09T18:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("draftSavedAgo", () => {
  it("relative draft time", () => {
    expect(draftSavedAgo(ago(20_000), NOW)).toBe("hace un momento");
    expect(draftSavedAgo(ago(60_000), NOW)).toBe("hace 1 min");
    expect(draftSavedAgo(ago(59 * 60_000), NOW)).toBe("hace 59 min");
    expect(draftSavedAgo(ago(2 * 3_600_000), NOW)).toBe("hace 2 h");
    expect(draftSavedAgo(ago(30 * 3_600_000), NOW)).toBe("ayer");
    expect(draftSavedAgo(ago(3 * 86_400_000), NOW)).toBe("hace 3 días");
  });

  it("is empty for a missing or unreadable date", () => {
    expect(draftSavedAgo(null, NOW)).toBe("");
    expect(draftSavedAgo("no es fecha", NOW)).toBe("");
  });

  it("builds the header line", () => {
    expect(draftHeaderLine(3, 7, ago(60_000), NOW)).toBe("Paso 3 de 7 · borrador guardado hace 1 min");
    expect(draftHeaderLine(1, 7, null, NOW)).toBe("Paso 1 de 7");
  });
});
