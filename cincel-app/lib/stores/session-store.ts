"use client";

import { create } from "zustand";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SessionAccess, SessionAccessStatus } from "@/lib/auth/session";
import { getBrowserQueryClient, resetClientState } from "@/lib/query/reset-client-state";

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

export const SESSION_INITIAL: Pick<SessionState, "access"> = { access: { status: "guest", user: null } };

export const useSessionStore = create<SessionState>((set) => ({
  ...SESSION_INITIAL,
  setAccess: (access) => set({ access }),
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSessionStatus = (state: Pick<SessionState, "access">): SessionAccessStatus => state.access.status;

let lastAccess: SessionAccess | null = null;
let lastUser: AuthenticatedUser | null = null;

/**
 * The signed-in user as `AuthenticatedUser` (the shape `toAuthenticatedUser`
 * in `lib/auth/auth-service.ts` builds), or null for a guest. Memoized on the
 * `access` object, so `useSessionStore(selectAuthenticatedUser)` returns the
 * same reference until the session changes.
 */
export function selectAuthenticatedUser(state: Pick<SessionState, "access">): AuthenticatedUser | null {
  const { access } = state;
  if (access === lastAccess) return lastUser;
  lastAccess = access;
  lastUser = buildAuthenticatedUser(access);
  return lastUser;
}

/**
 * The signed-in user only while the session is `active` (what
 * `getCurrentAuthenticatedUser()` returns), else null. The reactive read for
 * components: `useSessionStore(selectCurrentUser)`.
 */
export function selectCurrentUser(state: Pick<SessionState, "access">): AuthenticatedUser | null {
  return state.access.status === "active" ? selectAuthenticatedUser(state) : null;
}

function buildAuthenticatedUser(access: SessionAccess): AuthenticatedUser | null {
  if (!access.user) return null;
  const u = access.user;
  return {
    member: {
      id: u.id,
      name: u.name,
      role: u.role ?? "",
      area: u.area ?? "",
      capacity: 0,
      availability: "",
      active: u.active,
      institutionalEmail: u.email ?? "",
      phone: "",
    },
    email: (u.email ?? "").trim().toLowerCase(),
    access: u.access,
    ...(u.permissionOverrides ? { permissionOverrides: u.permissionOverrides } : {}),
  };
}

// ── Identity changes reset the client caches (plan §4.8 rule 1) ─────────────

/**
 * What the capabilities derive from: the user id, the access status, the
 * system access role and the saved permission overrides of that role (#971),
 * so a matrix change that reaches this viewer clears the caches it gated. A
 * name change keeps the key.
 */
export function sessionIdentityKey(access: SessionAccess): string {
  const overrides = access.user?.permissionOverrides;
  return `${access.status}:${access.user?.id ?? ""}:${access.user?.access ?? ""}${overrides ? `:${JSON.stringify(overrides)}` : ""}`;
}

/**
 * The identity of the last `setAccess`, or null before the first one. The
 * first value (the hydrator seeding the store) is the baseline: the cache
 * already holds that viewer's hydrated data, so it is not cleared.
 */
let seededIdentity: string | null = null;

useSessionStore.subscribe((state, previous) => {
  if (state.access === previous.access) return;
  const next = sessionIdentityKey(state.access);
  const before = seededIdentity;
  seededIdentity = next;
  if (before !== null && before !== next) resetClientState(getBrowserQueryClient());
});

/** Test-only: back to the initial guest state with no baseline identity. */
export function resetSessionStoreForTests(): void {
  useSessionStore.setState(SESSION_INITIAL);
  seededIdentity = null;
}
