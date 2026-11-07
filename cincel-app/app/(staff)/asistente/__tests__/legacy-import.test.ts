import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

import {
  LEGACY_IMPORT_MAX_MESSAGES,
  LEGACY_THREAD_KEY,
  importLegacyThreadOnce,
  readLegacyThread,
} from "@/lib/assistant/legacy-import";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] } as UIMessage;
}

const SAVED = [textMessage("m1", "user", "¿Qué entregas vencen?"), textMessage("m2", "assistant", "Tres esta semana.")];

describe("importLegacyThreadOnce", () => {
  it("calls the import once, even when called twice at the same time", async () => {
    const storage = memoryStorage({ [LEGACY_THREAD_KEY]: JSON.stringify(SAVED) });
    const importThread = vi.fn(async () => ({ id: "t-legacy" }));

    const [first, second] = await Promise.all([
      importLegacyThreadOnce({ storage, importThread }),
      importLegacyThreadOnce({ storage, importThread }),
    ]);

    expect(importThread).toHaveBeenCalledTimes(1);
    expect(importThread).toHaveBeenCalledWith(SAVED);
    expect(first).toEqual({ status: "imported", id: "t-legacy" });
    expect(second).toEqual({ status: "imported", id: "t-legacy" });

    // After the success there is nothing left to import.
    expect(await importLegacyThreadOnce({ storage, importThread })).toEqual({ status: "none" });
    expect(importThread).toHaveBeenCalledTimes(1);
  });

  it("deletes the key after a successful import", async () => {
    const storage = memoryStorage({ [LEGACY_THREAD_KEY]: JSON.stringify(SAVED) });

    await importLegacyThreadOnce({ storage, importThread: async () => ({ id: "t1" }) });

    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_THREAD_KEY);
    expect(storage.data.has(LEGACY_THREAD_KEY)).toBe(false);
  });

  it("keeps the key when the import fails", async () => {
    const storage = memoryStorage({ [LEGACY_THREAD_KEY]: JSON.stringify(SAVED) });
    const error = new Error("INVALID");

    const result = await importLegacyThreadOnce({
      storage,
      importThread: async () => {
        throw error;
      },
    });

    expect(result).toEqual({ status: "failed", error });
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.data.get(LEGACY_THREAD_KEY)).toBe(JSON.stringify(SAVED));
  });

  it("does nothing without a saved thread, with an empty one or with unreadable data", async () => {
    const importThread = vi.fn(async () => ({ id: "x" }));

    expect(await importLegacyThreadOnce({ storage: memoryStorage(), importThread })).toEqual({ status: "none" });
    expect(
      await importLegacyThreadOnce({ storage: memoryStorage({ [LEGACY_THREAD_KEY]: "[]" }), importThread }),
    ).toEqual({ status: "none" });
    expect(
      await importLegacyThreadOnce({ storage: memoryStorage({ [LEGACY_THREAD_KEY]: "{no es json" }), importThread }),
    ).toEqual({ status: "none" });
    expect(await importLegacyThreadOnce({ storage: null, importThread })).toEqual({ status: "none" });
    expect(importThread).not.toHaveBeenCalled();
  });
});

describe("readLegacyThread", () => {
  it("keeps only message-shaped entries and at most the last 200", () => {
    const many = Array.from({ length: LEGACY_IMPORT_MAX_MESSAGES + 5 }, (_, i) =>
      textMessage(`m${i}`, i % 2 === 0 ? "user" : "assistant", `mensaje ${i}`),
    );
    const storage = memoryStorage({ [LEGACY_THREAD_KEY]: JSON.stringify([{ foo: 1 }, ...many]) });

    const messages = readLegacyThread(storage);

    expect(messages).toHaveLength(LEGACY_IMPORT_MAX_MESSAGES);
    expect(messages?.[0].id).toBe("m5");
    expect(messages?.at(-1)?.id).toBe(`m${LEGACY_IMPORT_MAX_MESSAGES + 4}`);
  });
});
