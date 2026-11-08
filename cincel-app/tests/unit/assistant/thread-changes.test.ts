/**
 * `threadSnapshot` / `changedMessages` (Query Migration Phase 10, #944): the
 * chat route writes only the messages that are new or changed in a turn.
 */
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { changedMessages, threadSnapshot } from "@/lib/assistant/threads";

const text = (id: string, role: UIMessage["role"], value: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

describe("changedMessages", () => {
  const stored = [text("m1", "user", "Hola"), text("m2", "assistant", "¿Qué necesitas?")];

  it("keeps only the new messages of a turn", () => {
    const next = [...stored, text("m3", "user", "Un resumen")];
    expect(changedMessages(next, threadSnapshot(stored)).map((m) => m.id)).toEqual(["m3"]);
  });

  it("includes a stored message whose parts changed", () => {
    const edited = [stored[0], text("m2", "assistant", "¿Qué necesitas hoy?")];
    expect(changedMessages(edited, threadSnapshot(stored)).map((m) => m.id)).toEqual(["m2"]);
  });

  it("ignores the key order of a value read back from jsonb", () => {
    const reordered = stored.map((m) => ({
      role: m.role,
      id: m.id,
      parts: m.parts.map((p) => Object.fromEntries(Object.entries(p).reverse())),
    })) as UIMessage[];
    expect(changedMessages(stored, threadSnapshot(reordered))).toEqual([]);
  });

  it("is everything for an empty snapshot", () => {
    expect(changedMessages(stored, threadSnapshot([])).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
