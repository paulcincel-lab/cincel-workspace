"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  RECENT_DOCS_STORAGE_KEY,
  loadRecentDocuments,
  type RecentDocument,
} from "@/components/recursos/resources-model";

const RECENT_CHANGED = "cincel:recent-docs-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(RECENT_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RECENT_CHANGED, onChange);
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(RECENT_DOCS_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Tells mounted readers that this tab changed the recent list. */
export function notifyRecentDocumentsChanged(): void {
  window.dispatchEvent(new Event(RECENT_CHANGED));
}

/**
 * The "Abiertos recientemente" list from `cincel.resources.recent-docs.v1`
 * (same key and shape as the Recursos workspace). Empty on the server render
 * and when storage is unavailable.
 */
export function useRecentDocuments(): RecentDocument[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => {
    if (!raw) return [];
    try {
      return loadRecentDocuments();
    } catch {
      return [];
    }
  }, [raw]);
}
