"use client";

import { createContext, useContext } from "react";
import type { SessionAccess } from "@/lib/auth/session";

const SessionAccessContext = createContext<SessionAccess>({
  status: "guest",
  user: null,
});

export function SessionAccessProvider({
  value,
  children,
}: {
  value: SessionAccess;
  children: React.ReactNode;
}) {
  return (
    <SessionAccessContext.Provider value={value}>
      {children}
    </SessionAccessContext.Provider>
  );
}

/**
 * Client-side view of the server-resolved session access decision. Hydrated by
 * the root layout from `getSessionAccess()`; refreshed via `revalidatePath`
 * after login/logout Server Actions.
 */
export function useSessionAccess(): SessionAccess {
  return useContext(SessionAccessContext);
}
