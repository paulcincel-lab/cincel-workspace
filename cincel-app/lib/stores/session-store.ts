"use client";

import { create } from "zustand";
import type { SessionAccess } from "@/lib/auth/session";

/**
 * Client mirror of the server-resolved session access decision. Hydrated by
 * `SessionHydrator` from the value the root layout computed via
 * `getSessionAccess()`, and refreshed whenever `revalidatePath` re-renders the
 * layout after a login/logout Server Action.
 *
 * This holds only session/identity state — never server business data (that
 * lives in TanStack Query).
 */
type SessionState = {
  access: SessionAccess;
  setAccess: (access: SessionAccess) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  access: { status: "guest", user: null },
  setAccess: (access) => set({ access }),
}));
