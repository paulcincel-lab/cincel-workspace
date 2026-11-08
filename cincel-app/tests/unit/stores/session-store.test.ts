/**
 * Session store selectors and the identity-change reset (plan §4.8 rule 1):
 * log in as A, fill the cache and a UI store, log out, log in as B → the
 * cache is empty and the store is back at its initial state.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

vi.mock("@/lib/auth/auth-actions", () => ({ logoutAction: vi.fn(async () => undefined) }));

import type { SessionAccess } from "@/lib/auth/session";
import { registerUiStoreReset, setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import {
  resetSessionStoreForTests,
  selectAuthenticatedUser,
  selectCurrentUser,
  selectSessionStatus,
  sessionIdentityKey,
  useSessionStore,
} from "@/lib/stores/session-store";

function access(id: string, role: "Administrador" | "Arquitecto Senior" = "Arquitecto Senior", name = `User ${id}`): SessionAccess {
  return {
    status: "active",
    user: {
      id,
      name,
      email: ` ${id.toUpperCase()}@Cincel.MX `,
      role: "Arquitecto",
      area: null,
      active: true,
      mustChangePassword: false,
      googleLinked: false,
      access: role,
    },
  };
}

const GUEST: SessionAccess = { status: "guest", user: null };

/** A UI store like the ones later phases add, registered for the reset. */
const INITIAL = { open: false, draft: "" };
const useDemoUi = create<typeof INITIAL>(() => ({ ...INITIAL }));
const offDemo = registerUiStoreReset(() => useDemoUi.setState({ ...INITIAL }));

let qc = createTestQueryClient();

beforeEach(() => {
  resetSessionStoreForTests();
  qc = createTestQueryClient();
  setBrowserQueryClient(qc);
});

afterEach(() => {
  setBrowserQueryClient(null);
  resetSessionStoreForTests();
});

afterAll(() => offDemo());

function fillClientState(owner: string) {
  qc.setQueryData(["me", "profile"], { name: owner });
  qc.setQueryData(["tareas", "list", {}], [`${owner}-task`]);
  useDemoUi.setState({ open: true, draft: `${owner} draft` });
}

describe("session store selectors", () => {
  it("selectSessionStatus reads the status", () => {
    expect(selectSessionStatus(useSessionStore.getState())).toBe("guest");
    useSessionStore.getState().setAccess(access("a"));
    expect(selectSessionStatus(useSessionStore.getState())).toBe("active");
  });

  it("selectAuthenticatedUser matches toAuthenticatedUser and is memoized on access", async () => {
    const { resolveCurrentSessionAccess } = await import("@/lib/auth/auth-service");
    expect(selectAuthenticatedUser(useSessionStore.getState())).toBeNull();

    useSessionStore.getState().setAccess(access("a"));
    const first = selectAuthenticatedUser(useSessionStore.getState());
    expect(first).toEqual(resolveCurrentSessionAccess().user);
    expect(first?.email).toBe("a@cincel.mx");
    expect(selectAuthenticatedUser(useSessionStore.getState())).toBe(first);

    useSessionStore.getState().setAccess(access("a", "Arquitecto Senior", "Renamed"));
    const second = selectAuthenticatedUser(useSessionStore.getState());
    expect(second).not.toBe(first);
    expect(second?.member.name).toBe("Renamed");
  });

  it("selectCurrentUser is the user only while active (getCurrentAuthenticatedUser)", async () => {
    const { getCurrentAuthenticatedUser } = await import("@/lib/auth/auth-service");
    expect(selectCurrentUser(useSessionStore.getState())).toBeNull();

    useSessionStore.getState().setAccess({ ...access("a"), status: "pending_first_access" });
    expect(selectCurrentUser(useSessionStore.getState())).toBeNull();
    expect(getCurrentAuthenticatedUser()).toBeNull();

    useSessionStore.getState().setAccess(access("a"));
    expect(selectCurrentUser(useSessionStore.getState())).toEqual(getCurrentAuthenticatedUser());
    expect(selectCurrentUser(useSessionStore.getState())).toBe(selectAuthenticatedUser(useSessionStore.getState()));
  });

  it("sessionIdentityKey changes with the user, the status or the access role only", () => {
    expect(sessionIdentityKey(access("a"))).toBe(sessionIdentityKey(access("a", "Arquitecto Senior", "Other name")));
    expect(sessionIdentityKey(access("a"))).not.toBe(sessionIdentityKey(access("b")));
    expect(sessionIdentityKey(access("a"))).not.toBe(sessionIdentityKey(access("a", "Administrador")));
    expect(sessionIdentityKey(access("a"))).not.toBe(sessionIdentityKey({ ...access("a"), status: "inactive_member" }));
  });
});

describe("identity change resets the client state", () => {
  it("log in as A, fill, log out, log in as B → cache empty and stores at INITIAL", () => {
    useSessionStore.getState().setAccess(access("a"));
    fillClientState("a");

    useSessionStore.getState().setAccess(GUEST);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);

    fillClientState("guest");
    useSessionStore.getState().setAccess(access("b"));
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);
    expect(qc.getQueryData(["me", "profile"])).toBeUndefined();
  });

  it("switching straight from A to B, or A's capabilities changing, resets too", () => {
    useSessionStore.getState().setAccess(access("a"));
    fillClientState("a");
    useSessionStore.getState().setAccess(access("b"));
    expect(qc.getQueryCache().getAll()).toHaveLength(0);

    useSessionStore.getState().setAccess(access("b"));
    fillClientState("b");
    useSessionStore.getState().setAccess(access("b", "Administrador"));
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);
  });

  it("keeps the cache when the hydrator seeds the first session or re-sends the same identity", () => {
    fillClientState("a");
    useSessionStore.getState().setAccess(access("a"));
    expect(qc.getQueryData(["me", "profile"])).toEqual({ name: "a" });

    useSessionStore.getState().setAccess(access("a", "Arquitecto Senior", "New name"));
    expect(qc.getQueryData(["me", "profile"])).toEqual({ name: "a" });
    expect(useDemoUi.getState().open).toBe(true);
  });

  it("the AvatarMenu / auth-service logout path (setAccess guest) clears the cache", async () => {
    useSessionStore.getState().setAccess(access("a"));
    fillClientState("a");
    const { logout } = await import("@/lib/auth/auth-service");
    logout();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(useDemoUi.getState()).toEqual(INITIAL);
    const { logoutAction } = await import("@/lib/auth/auth-actions");
    await vi.waitFor(() => expect(logoutAction).toHaveBeenCalledTimes(1));
  });
});
