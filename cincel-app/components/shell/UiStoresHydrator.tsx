"use client";

import { useEffect } from "react";

import { useRecentDocs } from "@/lib/stores/recent-docs-store";

/**
 * Mount point for the persisted UI stores (zustand.md §2.1): `skipHydration`
 * stores call `persist.rehydrate()` here, after the first client render, so
 * the server HTML and the first client render agree.
 */
export function UiStoresHydrator(): null {
  useEffect(() => {
    void useRecentDocs.persist.rehydrate();
  }, []);
  return null;
}
