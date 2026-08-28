"use client";

import { create } from "zustand";

/**
 * Client-side view of the authenticated user. Hydrated from the server session
 * (see `lib/auth/session.ts`) by a provider near the app root. This holds only
 * UI/session state — never server business data (that lives in TanStack Query).
 */
export type CurrentUser = {
  id: string;
  legacyId: number | null;
  name: string;
  email: string | null;
  role: string | null;
  area: string | null;
};

type SessionState = {
  user: CurrentUser | null;
  setUser: (user: CurrentUser | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
