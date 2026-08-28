"use client";

import { useEffect, useRef } from "react";
import type { SessionAccess } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

/**
 * Pushes the server-resolved session access into the Zustand store so the many
 * non-hook call sites of `getCurrentAuthenticatedUser()` /
 * `resolveCurrentSessionAccess()` (legacy `lib/auth/auth-service.ts`) can read
 * it synchronously.
 *
 * Rendered by the root layout with the value from `getSessionAccess()`; the
 * layout re-renders (and this re-runs) after every login/logout Server Action
 * because they call `revalidatePath("/", "layout")`.
 *
 * When the identity actually changes it dispatches a synthetic `focus` event —
 * the same signal the legacy Supabase client used — so feature components that
 * cached `useState(() => getCurrentAuthenticatedUser())` re-read it. It does
 * NOT fire on unchanged re-renders, to avoid triggering every page's
 * focus-based data refresh on unrelated revalidations.
 */
export default function SessionHydrator({ value }: { value: SessionAccess }) {
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    useSessionStore.getState().setAccess(value);

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
