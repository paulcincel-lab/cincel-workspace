"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Tells the components under `app/(staff)/layout.tsx` whether the new
 * `AppShell` is mounted (redesign FE §2.3). `LegacyFrame` reads it so a page
 * never shows the old sidebar inside the new shell. Deleted in Phase 9.
 */
const NewShellContext = createContext(false);

export function NewShellProvider({ children }: { children: ReactNode }) {
  return <NewShellContext.Provider value>{children}</NewShellContext.Provider>;
}

/** True inside the new `AppShell`. */
export function useInNewShell(): boolean {
  return useContext(NewShellContext);
}
