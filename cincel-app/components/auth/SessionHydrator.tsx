"use client";

import { useLayoutEffect, useRef } from "react";
import type { SessionAccess } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

/**
 * Pushes the server-resolved session access into the Zustand store, the one
 * client source of the session: `useSessionStore` selectors in components and
 * the synchronous `getCurrentAuthenticatedUser()` /
 * `resolveCurrentSessionAccess()` reads (`lib/auth/auth-service.ts`).
 *
 * Rendered by the root layout, before `AppRouteGuard`, with the value from
 * `getSessionAccess()`; the layout re-renders (and this re-runs) after every
 * login/logout Server Action because they call `revalidatePath("/", "layout")`.
 *
 * The store is set in a layout effect, so it holds the new value before the
 * browser paints and before any passive effect of the same commit (the
 * guard's redirect effect re-checks the store). An identity change also
 * resets the query cache and the UI stores (`lib/stores/session-store.ts`).
 *
 * When the identity actually changes it dispatches a synthetic `focus` event,
 * the signal that screens still loading on focus use to reload. It does NOT
 * fire on unchanged re-renders, to avoid triggering every page's focus-based
 * data refresh on unrelated revalidations.
 */
export default function SessionHydrator({ value }: { value: SessionAccess }) {
  const lastKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    const store = useSessionStore.getState();
    // The first run always seeds (it is the reset baseline). A revalidation
    // that resolves the same session keeps the stored object, so selectors
    // keep their references.
    if (lastKey.current === null || JSON.stringify(store.access) !== JSON.stringify(value)) store.setAccess(value);

    const key = `${value.status}:${value.user?.id ?? ""}`;
    if (lastKey.current !== null && lastKey.current !== key) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("focus"));
      }
    }
    lastKey.current = key;
  }, [value]);

  return null;
}
