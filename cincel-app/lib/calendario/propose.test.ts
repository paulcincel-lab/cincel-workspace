// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  canCreate: true,
  created: [] as { kind: string; data: Record<string, unknown>; opts: unknown }[],
}));

vi.mock("@/lib/db/client", () => {
  // Every query of the module resolves to `state.rows`, whatever the chain.
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "then") return (resolve: (value: unknown) => unknown) => Promise.resolve(state.rows).then(resolve);
        return () => chain;
      },
    },
  );
  return { db: { select: () => chain } };
});
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canCreateActivity: state.canCreate }),
  canSeeAdminData: (user: { access?: string } | null | undefined) => user?.access === "Administrador",
}));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: vi.fn(async () => []) }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: vi.fn(async () => ({ status: "needs_consent" })) }));
vi.mock("@/lib/assistant/agenda/google-calendar", () => ({
  CALENDAR_EVENTS_GRANT: "calendar_events",
  calendarEventsGrantAvailable: () => true,
}));
vi.mock("@/lib/repositories/calendario-events-range", () => ({ busyWindowsOf: vi.fn(async () => []) }));
vi.mock("@/lib/repositories/proposals-repository", () => ({
  createProposal: vi.fn(async (_user: unknown, kind: string, data: Record<string, unknown>, opts: unknown) => {
    state.created.push({ kind, data, opts });
    return { id: "p-1", kind, status: "propuesta", rangeFrom: null, rangeTo: null, createdAt: "", expiresAt: "", ...data };
  }),
}));

import { meetingIdOf, normalizeMoves, proposalResult, proposeMoveTasks } from "@/lib/calendario/propose";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const user = (access: "Administrador" | "Colaborador"): AuthenticatedUser => ({
  member: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ana Pérez",
    role: access,
    area: "",
    capacity: 0,
    availability: "",
    active: true,
    institutionalEmail: "ana@cincel.mx",
    phone: "",
  },
  email: "ana@cincel.mx",
  access,
});

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T4 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Tarea ${id.slice(0, 2)}`,
  kind: "usuario",
  commitmentDate: "2026-11-05",
  deliveryDate: null,
  projectName: "Casa Roble",
  managerId: "22222222-2222-4222-8222-222222222222",
  ...over,
});

beforeEach(() => {
  state.rows = [];
  state.canCreate = true;
  state.created = [];
});

describe("normalizeMoves", () => {
  it("expands taskIds + toDate and keeps the last date of a repeated task", () => {
    expect(normalizeMoves({ taskIds: [T1, T2], toDate: "2026-11-12" })).toEqual([
      { taskId: T1, toDate: "2026-11-12" },
      { taskId: T2, toDate: "2026-11-12" },
    ]);
    expect(
      normalizeMoves({
        moves: [
          { taskId: T1, toDate: "2026-11-12" },
          { taskId: T1, toDate: "2026-11-13" },
        ],
      }),
    ).toEqual([{ taskId: T1, toDate: "2026-11-13" }]);
  });
});

describe("meetingIdOf", () => {
  it("accepts a uuid or the e- id of list_events, and nothing else", () => {
    expect(meetingIdOf(T1)).toBe(T1);
    expect(meetingIdOf(`e-${T1}`)).toBe(T1);
    expect(meetingIdOf(`e:${T1}`)).toBe(T1);
    expect(meetingIdOf("g-abc123")).toBeNull();
  });
});

describe("proposeMoveTasks", () => {
  it("proposes the three overdue tasks for Thursday with their current dates as before", async () => {
    state.rows = [row(T1), row(T2, { commitmentDate: null, deliveryDate: "2026-11-06" }), row(T3)];
    const made = await proposeMoveTasks(
      { user: user("Colaborador"), threadId: null },
      { taskIds: [T1, T2, T3], toDate: "2026-11-12", reason: "Pasa lo vencido" },
    );
    expect(made.ok).toBe(true);
    expect(state.created).toHaveLength(1);
    const { kind, data, opts } = state.created[0];
    expect(kind).toBe("mover_tareas");
    expect(opts).toEqual({});
    expect(data.title).toBe("Mover 3 tareas al jueves 12 nov.");
    expect(data.line).toBe("Paso 3 tareas al jueves 12 nov.");
    expect(data.range).toEqual({ from: "2026-11-12", to: "2026-11-12" });
    expect(data.deferred).toEqual([]);
    const changes = data.changes as { type: string; before: unknown; after: unknown; reason?: string }[];
    expect(changes.map((c) => c.type)).toEqual(["task_date", "task_date", "task_date"]);
    expect(changes[0]).toMatchObject({ before: { date: "2026-11-05", field: "commitmentDate" }, after: { date: "2026-11-12" }, reason: "Pasa lo vencido" });
    // A task without a commitment date moves its delivery date.
    expect(changes[1]).toMatchObject({ before: { date: "2026-11-06", field: "deliveryDate" } });
  });

  it("passes the chat thread to the proposal", async () => {
    state.rows = [row(T1)];
    await proposeMoveTasks({ user: user("Colaborador"), threadId: "thread-9" }, { taskIds: [T1], toDate: "2026-11-12" });
    expect(state.created[0].opts).toEqual({ threadId: "thread-9" });
  });

  it("drops tasks that are missing or admin-only for a non-admin, and tasks already on that date", async () => {
    state.rows = [row(T1), row(T2, { kind: "admin" }), row(T3, { commitmentDate: "2026-11-12" })];
    const made = await proposeMoveTasks({ user: user("Colaborador"), threadId: null }, { taskIds: [T1, T2, T3, T4], toDate: "2026-11-12" });
    expect(made.ok).toBe(true);
    const changes = state.created[0].data.changes as { taskId: string }[];
    expect(changes.map((c) => c.taskId)).toEqual([T1]);
    expect(state.created[0].data.deferred).toEqual([]);
  });

  it("lets an administrator move admin tasks", async () => {
    state.rows = [row(T2, { kind: "admin" })];
    const made = await proposeMoveTasks({ user: user("Administrador"), threadId: null }, { taskIds: [T2], toDate: "2026-11-12" });
    expect(made.ok).toBe(true);
  });

  it("refuses with FORBIDDEN and writes no proposal when the viewer can't change dates", async () => {
    state.canCreate = false;
    state.rows = [row(T1)];
    const made = await proposeMoveTasks({ user: user("Colaborador"), threadId: null }, { taskIds: [T1], toDate: "2026-11-12" });
    expect(made).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(state.created).toHaveLength(0);
  });

  it("answers NOT_FOUND when none of the ids exist", async () => {
    const made = await proposeMoveTasks({ user: user("Colaborador"), threadId: null }, { taskIds: [T1], toDate: "2026-11-12" });
    expect(made).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("returns the shape every proposing tool returns", async () => {
    state.rows = [row(T1)];
    const made = await proposeMoveTasks({ user: user("Colaborador"), threadId: null }, { taskIds: [T1], toDate: "2026-11-12" });
    if (!made.ok) throw new Error("expected a proposal");
    const result = proposalResult(made.proposal);
    expect(Object.keys(result).sort()).toEqual(["changes", "deferred", "kind", "line", "ok", "proposalId", "title"]);
    expect(result).toMatchObject({ ok: true, proposalId: "p-1", kind: "mover_tareas" });
  });
});
