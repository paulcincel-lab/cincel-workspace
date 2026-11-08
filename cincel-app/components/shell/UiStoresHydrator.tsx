"use client";

/**
 * Mount point for the persisted UI stores (zustand.md §2.1): `skipHydration`
 * stores call `persist.rehydrate()` here, after the first client render, so
 * the server HTML and the first client render agree. Empty until a phase
 * adds a persisted store.
 */
export function UiStoresHydrator(): null {
  return null;
}
