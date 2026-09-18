import { describe, expect, it } from "vitest";
import { parseLegacyState } from "./parse-json";

describe("parseLegacyState", () => {
  it("normalizes done/progress/boolean-true status values", () => {
    const result = parseLegacyState({
      done: { "PB-1": "done", "PB-2": "progress", "PB-3": true, "PB-4": "pending", "PB-5": false },
      flags: {},
      imprevistos: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.statusByKey).toEqual({ "PB-1": "done", "PB-2": "progress", "PB-3": "done" });
  });

  it("collects only truthy flags", () => {
    const result = parseLegacyState({ done: {}, flags: { "PB-1": true, "PB-2": false }, imprevistos: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.flagByKey).toEqual({ "PB-1": true });
  });

  it("parses well-formed imprevistos and drops malformed entries", () => {
    const result = parseLegacyState({
      done: {},
      flags: {},
      imprevistos: [{ fecha: "2026-07-28", texto: "Trabajo imprevisto" }, { fecha: "2026-07-29" }, "not-an-object"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.imprevistos).toEqual([{ fecha: "2026-07-28", texto: "Trabajo imprevisto" }]);
  });

  it("parses a JSON string input", () => {
    const result = parseLegacyState(JSON.stringify({ done: { "PB-1": "done" }, flags: {}, imprevistos: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.statusByKey).toEqual({ "PB-1": "done" });
  });

  it("rejects invalid JSON strings", () => {
    const result = parseLegacyState("{not valid json");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object payload", () => {
    const result = parseLegacyState(42);
    expect(result.ok).toBe(false);
  });

  it("tolerates missing done/flags/imprevistos keys entirely", () => {
    const result = parseLegacyState({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toEqual({ statusByKey: {}, flagByKey: {}, imprevistos: [] });
  });
});
