// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECENT_DOCS_LIMIT, RECENT_DOCS_STORAGE_KEY } from "@/components/recursos/resources-model";

import { RECENT_DOCS_INITIAL, recentDocsStorage, resetRecentDocs, useRecentDocs } from "./recent-docs-store";

function doc(i: number) {
  return {
    id: `doc-${i}`,
    title: `Documento ${i}`,
    url: `https://docs.google.com/document/d/doc${i}/edit`,
    section: "formatos-obra" as const,
  };
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(RECENT_DOCS_STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  // The reset writes the empty list through the persist storage; clear the key after it.
  resetRecentDocs();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useRecentDocs", () => {
  it("starts empty and does not read storage before rehydration (skipHydration)", () => {
    window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, JSON.stringify([{ ...doc(1), openedAt: "2026-11-01T00:00:00.000Z" }]));
    expect(useRecentDocs.getState().docs).toEqual(RECENT_DOCS_INITIAL.docs);
  });

  it("reads the legacy bare-array value on rehydrate", async () => {
    window.localStorage.setItem(
      RECENT_DOCS_STORAGE_KEY,
      JSON.stringify([
        { ...doc(1), openedAt: "2026-11-01T00:00:00.000Z" },
        // An older entry kept its URL in `href`.
        { id: "doc-2", title: "Documento 2", href: "https://drive.google.com/file/d/doc2/view", openedAt: "2026-10-01T00:00:00.000Z", section: "empresa" },
        // No URL at all (neither `url` nor `href`): dropped, as before.
        { id: "web", title: "Web", openedAt: "2026-09-01T00:00:00.000Z", section: "formacion" },
      ]),
    );
    await useRecentDocs.persist.rehydrate();
    expect(useRecentDocs.getState().docs.map((d) => d.id)).toEqual(["doc-1", "doc-2"]);
    expect(useRecentDocs.getState().docs[1].url).toBe("https://drive.google.com/file/d/doc2/view");
  });

  it("writes the bare array back (partialize: docs only, no zustand envelope)", async () => {
    await useRecentDocs.persist.rehydrate();
    useRecentDocs.getState().remember(doc(1), { href: "/biblioteca/empresa/rfc?parte=doc-1" });
    const value = stored();
    expect(Array.isArray(value)).toBe(true);
    expect(value).toEqual([
      expect.objectContaining({ id: "doc-1", title: "Documento 1", href: "/biblioteca/empresa/rfc?parte=doc-1", section: "formatos-obra" }),
    ]);
    expect(Object.keys((value as Record<string, unknown>[])[0]).sort()).toEqual(["href", "id", "openedAt", "section", "title", "url"]);
  });

  it("keeps the newest first, moves a reopened document to the top and caps the list", async () => {
    await useRecentDocs.persist.rehydrate();
    for (let i = 1; i <= RECENT_DOCS_LIMIT + 2; i += 1) useRecentDocs.getState().remember(doc(i));
    useRecentDocs.getState().remember(doc(5));
    const ids = useRecentDocs.getState().docs.map((d) => d.id);
    expect(ids).toHaveLength(RECENT_DOCS_LIMIT);
    expect(ids[0]).toBe("doc-5");
    expect(ids.filter((id) => id === "doc-5")).toHaveLength(1);
    expect((stored() as unknown[]).length).toBe(RECENT_DOCS_LIMIT);
  });

  it("does not drop the stored list when a document is remembered before the hydrator ran", async () => {
    window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, JSON.stringify([{ ...doc(1), openedAt: "2026-11-01T00:00:00.000Z" }]));
    // A fresh module: this store instance has never rehydrated.
    vi.resetModules();
    const fresh = await import("./recent-docs-store");
    expect(fresh.useRecentDocs.persist.hasHydrated()).toBe(false);
    fresh.useRecentDocs.getState().remember(doc(2));
    expect(fresh.useRecentDocs.getState().docs.map((d) => d.id)).toEqual(["doc-2", "doc-1"]);
    expect((stored() as { id: string }[]).map((d) => d.id)).toEqual(["doc-2", "doc-1"]);
  });

  it("follows another tab through the storage event", async () => {
    await useRecentDocs.persist.rehydrate();
    window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, JSON.stringify([{ ...doc(7), openedAt: "2026-11-07T00:00:00.000Z" }]));
    window.dispatchEvent(new StorageEvent("storage", { key: RECENT_DOCS_STORAGE_KEY }));
    await Promise.resolve();
    expect(useRecentDocs.getState().docs.map((d) => d.id)).toEqual(["doc-7"]);
  });

  it("ignores storage events of other keys", async () => {
    await useRecentDocs.persist.rehydrate();
    window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, JSON.stringify([{ ...doc(8), openedAt: "2026-11-07T00:00:00.000Z" }]));
    window.dispatchEvent(new StorageEvent("storage", { key: "cincel.other" }));
    await Promise.resolve();
    expect(useRecentDocs.getState().docs).toEqual([]);
  });

  it("clear() and resetRecentDocs() empty the list and the stored value", async () => {
    await useRecentDocs.persist.rehydrate();
    useRecentDocs.getState().remember(doc(1));
    useRecentDocs.getState().clear();
    expect(useRecentDocs.getState().docs).toEqual([]);
    expect(stored()).toEqual([]);
    useRecentDocs.getState().remember(doc(2));
    resetRecentDocs();
    expect(useRecentDocs.getState().docs).toEqual([]);
    expect(stored()).toEqual([]);
  });
});

describe("recentDocsStorage", () => {
  it("reads a zustand-wrapped value too, and drops an unreadable one", () => {
    window.localStorage.setItem(
      RECENT_DOCS_STORAGE_KEY,
      JSON.stringify({ state: { docs: [{ ...doc(3), openedAt: "2026-11-03T00:00:00.000Z" }] }, version: 0 }),
    );
    expect(recentDocsStorage.getItem(RECENT_DOCS_STORAGE_KEY)).toMatchObject({ state: { docs: [{ id: "doc-3" }] } });

    window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, "{not json");
    expect(recentDocsStorage.getItem(RECENT_DOCS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(RECENT_DOCS_STORAGE_KEY)).toBeNull();
  });

  it("reads nothing when the key is empty", () => {
    expect(recentDocsStorage.getItem(RECENT_DOCS_STORAGE_KEY)).toBeNull();
  });
});
