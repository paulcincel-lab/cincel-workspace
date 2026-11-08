/**
 * Test helpers for the query layer (plan §4.1). Imported by tests only.
 *
 * - `createTestQueryClient()`: no retries, nothing garbage-collected mid-test.
 * - `renderWithQueryClient(ui, { client?, hydrate? })`: renders under a
 *   `QueryClientProvider`, optionally inside a `HydrationBoundary`.
 * - `mockAction(fn)`: a server-action double that records its calls.
 * - `hydrationRoundtrip(prefetchFn)`: prefetch on a server client, dehydrate,
 *   and hand back a fresh client plus the state, as a page would.
 * - `asViewer(user, fn)` + `mockSessionModule(real)`: run a page-data action
 *   as a given viewer in a DB test (plan §4.8 rule 3).
 */
import { render, type RenderResult } from "@testing-library/react";
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SessionAccess, SessionAccessStatus } from "@/lib/auth/session";
import type { SystemAccessRole } from "@/lib/data/roles";

import { dehydrateQueries } from "./hydrate";

// ── Clients and rendering ────────────────────────────────────────────────────

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export type RenderWithQueryClientResult = RenderResult & { client: QueryClient };

export function renderWithQueryClient(
  ui: ReactElement,
  options: { client?: QueryClient; hydrate?: DehydratedState } = {},
): RenderWithQueryClientResult {
  const client = options.client ?? createTestQueryClient();
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}>
      {options.hydrate ? <HydrationBoundary state={options.hydrate}>{node}</HydrationBoundary> : node}
    </QueryClientProvider>
  );
  const result = render(wrap(ui));
  return {
    ...result,
    client,
    rerender: (next: ReactNode) => result.rerender(wrap(next)),
  };
}

// ── Action doubles ───────────────────────────────────────────────────────────

export type MockAction<V, R> = ((vars: V) => Promise<R>) & {
  /** The variables of every call, in order. */
  calls: V[];
  /** Makes the next calls resolve with `{ ok: false, error }`. */
  failWith(error: string): void;
  /** Makes the next calls throw `error`. */
  throwWith(error: unknown): void;
  /** Back to the implementation. */
  restore(): void;
};

/**
 * A server-action double: records every call's variables and resolves with
 * `fn(vars)`, or with `{ ok: false, error }` / a throw after `failWith` /
 * `throwWith`.
 */
export function mockAction<V, R>(fn: (vars: V) => R | Promise<R>): MockAction<V, R> {
  let mode: { kind: "impl" } | { kind: "fail"; error: string } | { kind: "throw"; error: unknown } = {
    kind: "impl",
  };
  const action = (async (vars: V) => {
    action.calls.push(vars);
    if (mode.kind === "fail") return { ok: false, error: mode.error } as R;
    if (mode.kind === "throw") throw mode.error;
    return fn(vars);
  }) as MockAction<V, R>;
  action.calls = [];
  action.failWith = (error) => {
    mode = { kind: "fail", error };
  };
  action.throwWith = (error) => {
    mode = { kind: "throw", error };
  };
  action.restore = () => {
    mode = { kind: "impl" };
  };
  return action;
}

// ── Hydration ────────────────────────────────────────────────────────────────

/**
 * What a page does across the network boundary: run `prefetchFn` against a
 * fresh "server" client, dehydrate it the way `<Hydrate>` does, and return a
 * fresh "browser" client with the state to render under `HydrationBoundary`
 * (`renderWithQueryClient(ui, { client, hydrate: state })`). The state goes
 * through JSON, like the RSC payload.
 */
export async function hydrationRoundtrip(
  prefetchFn: (serverClient: QueryClient) => Promise<unknown>,
): Promise<{ client: QueryClient; state: DehydratedState; serverClient: QueryClient }> {
  const serverClient = createTestQueryClient();
  await prefetchFn(serverClient);
  const state = JSON.parse(JSON.stringify(dehydrateQueries(serverClient))) as DehydratedState;
  return { client: createTestQueryClient(), state, serverClient };
}

// ── Viewers (DB tests of page-data actions) ──────────────────────────────────

export type TestViewer = {
  id: string;
  access: SystemAccessRole;
  name?: string;
  email?: string | null;
  role?: string | null;
  area?: string | null;
  status?: SessionAccessStatus;
};

let currentViewer: TestViewer | null = null;

/** The viewer `mockSessionModule` serves, or null (a guest). */
export function getTestViewer(): TestViewer | null {
  return currentViewer;
}

/** Runs `fn` with `viewer` as the session user, then restores the previous viewer. */
export async function asViewer<T>(viewer: TestViewer | null, fn: () => Promise<T>): Promise<T> {
  const previous = currentViewer;
  currentViewer = viewer;
  try {
    return await fn();
  } finally {
    currentViewer = previous;
  }
}

function viewerAccess(viewer: TestViewer | null): SessionAccess {
  if (!viewer) return { status: "guest", user: null };
  return {
    status: viewer.status ?? "active",
    user: {
      id: viewer.id,
      name: viewer.name ?? "Test viewer",
      email: viewer.email ?? null,
      role: viewer.role ?? viewer.access,
      area: viewer.area ?? null,
      active: true,
      mustChangePassword: false,
      googleLinked: false,
      access: viewer.access,
    },
  };
}

function viewerCapabilityUser(user: NonNullable<SessionAccess["user"]>): AuthenticatedUser {
  return {
    member: {
      id: user.id,
      name: user.name,
      role: user.role ?? "",
      area: user.area ?? "",
      capacity: 0,
      availability: "",
      active: user.active,
      institutionalEmail: user.email ?? "",
      phone: "",
    },
    email: user.email ?? "",
    access: user.access,
  };
}

/**
 * A `vi.mock("@/lib/auth/session")` factory whose session reads serve the
 * `asViewer` viewer, with the same errors as the real module for a guest:
 *
 *   vi.mock("@/lib/auth/session", async (importOriginal) =>
 *     (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()));
 */
export function mockSessionModule<M extends object>(real: M): M {
  const access = () => viewerAccess(currentViewer);
  const session = () => {
    const user = access().user;
    if (!user) return null;
    return {
      id: `test-session-${user.id}`,
      user,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      staffAccess: { googleSub: null, accessCheckedAt: null, accessRevokedAt: null },
    };
  };
  return {
    ...real,
    getSessionAccess: async () => access(),
    getSession: async () => session(),
    requireSession: async () => {
      const s = session();
      if (!s) throw new Error("UNAUTHENTICATED");
      return s;
    },
    requireSessionAccess: async () => {
      const a = access();
      if (!a.user || a.status === "no_system_access") throw new Error("FORBIDDEN");
      return a.user;
    },
    requireCapabilityUser: async () => {
      const a = access();
      if (!a.user || a.status === "no_system_access") throw new Error("FORBIDDEN");
      return viewerCapabilityUser(a.user);
    },
  };
}
