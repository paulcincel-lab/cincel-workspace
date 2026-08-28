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
 * After updating the store it dispatches a synthetic `focus` event — the same
 * signal the legacy Supabase client used — so feature components that cached
 * `useState(() => getCurrentAuthenticatedUser())` re-read the new value.
 */
export default function SessionHydrator({ value }: { value: SessionAccess }) {
  const first = useRef(true);

  useEffect(() => {
    useSessionStore.getState().setAccess(value);
    if (first.current) {
      first.current = false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("focus"));
    }
  }, [value]);

  return null;
}
