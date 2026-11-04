// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; table?: unknown; values?: unknown };

/** Chainable stand-in for the Drizzle client: records every statement and answers selects and claims. */
const fake = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    staffRows: [] as unknown[],
    /** One entry per claim attempt; `true` means that `update … returning` gets the row back. */
    claims: [] as boolean[],
  };
  const chain = (op: string, table?: unknown) => {
    const call: Call = { op, table };
    state.calls.push(call);
    const result = op === "select" ? state.staffRows : [];
    const node: Record<string, unknown> = {
      from: () => node,
      where: () => node,
      limit: () => node,
      set: (values: unknown) => ((call.values = values), node),
      values: (values: unknown) => ((call.values = values), node),
      returning: () => {
        call.op = "claim";
        return Promise.resolve(state.claims.shift() ? [{ id: "staff-1" }] : []);
      },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return node;
  };
  const db = {
    select: () => chain("select"),
    update: (table: unknown) => chain("update", table),
    delete: (table: unknown) => chain("delete", table),
    insert: (table: unknown) => chain("insert", table),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { state, db };
});

const evaluateAccess = vi.hoisted(() => vi.fn());
const applyAccess = vi.hoisted(() => vi.fn());
const recordDirectoryError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: fake.db }));
vi.mock("@/lib/auth/workspace-access", () => ({ evaluateAccess, applyAccess }));
vi.mock("@/lib/auth/directory-error-log", () => ({ recordDirectoryError }));

import { recheckStaffAccess } from "./access-recheck";
import { authEvents, sessions, staff } from "@/lib/db/schema";
import { DirectoryError } from "@/lib/google/directory";

const GOOGLE_STAFF = { googleSub: "sub-1", email: "ana@cincel.example" };
const ALLOWED = { allowed: true, role: "Arquitecto Senior", areaIds: [], areasManaged: false, reason: null };

const ops = () => fake.state.calls.map((call) => call.op);
const inserted = () => fake.state.calls.filter((call) => call.op === "insert").map((call) => call.values);

beforeEach(() => {
  fake.state.calls = [];
  fake.state.staffRows = [GOOGLE_STAFF];
  fake.state.claims = [];
  evaluateAccess.mockReset();
  applyAccess.mockReset();
  recordDirectoryError.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recheckStaffAccess", () => {
  it("skips staff without google_sub and never claims or calls the Directory", async () => {
    fake.state.staffRows = [{ googleSub: null, email: "admin@cincel.example" }];
    await expect(recheckStaffAccess("staff-1")).resolves.toEqual({ status: "not_google_linked" });
    expect(ops()).toEqual(["select"]);
    expect(evaluateAccess).not.toHaveBeenCalled();
  });

  it("only the request that claims the check calls the Directory", async () => {
    fake.state.claims = [true, false, false];
    evaluateAccess.mockResolvedValue(ALLOWED);
    const outcomes = await Promise.all([1, 2, 3].map(() => recheckStaffAccess("staff-1", { hours: 4 })));
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["kept", "not_claimed", "not_claimed"]);
    expect(evaluateAccess).toHaveBeenCalledOnce();
    expect(evaluateAccess).toHaveBeenCalledWith("sub-1", "ana@cincel.example", expect.any(Object));
  });

  it("refreshes role and áreas and records the kept check", async () => {
    fake.state.claims = [true];
    evaluateAccess.mockResolvedValue(ALLOWED);
    await expect(recheckStaffAccess("staff-1")).resolves.toEqual({ status: "kept" });
    expect(applyAccess).toHaveBeenCalledWith("staff-1", ALLOWED);
    expect(inserted()).toEqual([expect.objectContaining({ kind: "staff_recheck_kept", staffId: "staff-1" })]);
  });

  it("revokes a removed or suspended user: marks the row, deletes sessions, writes auth_events", async () => {
    fake.state.claims = [true];
    evaluateAccess.mockResolvedValue({ allowed: false, reason: "workspace_suspended" });
    await expect(recheckStaffAccess("staff-1")).resolves.toEqual({ status: "revoked", reason: "workspace_suspended" });

    const revokeUpdate = fake.state.calls.find(
      (call) => call.op === "update" && (call.values as Record<string, unknown>)?.accessRevokedReason,
    );
    expect(revokeUpdate).toMatchObject({ table: staff, values: { accessRevokedReason: "workspace_suspended" } });
    expect(fake.state.calls.some((call) => call.op === "delete" && call.table === sessions)).toBe(true);
    const event = fake.state.calls.find((call) => call.op === "insert");
    expect(event).toMatchObject({
      table: authEvents,
      values: { kind: "staff_recheck_revoked", staffId: "staff-1", reason: "workspace_suspended" },
    });
    expect(applyAccess).not.toHaveBeenCalled();
  });

  it("keeps access on a Directory outage and backs off 5 minutes", async () => {
    fake.state.claims = [true];
    const error = new DirectoryError("down", "timeout");
    evaluateAccess.mockRejectedValue(error);
    await expect(recheckStaffAccess("staff-1", { hours: 4 })).resolves.toEqual({ status: "error", error });

    expect(fake.state.calls.some((call) => call.op === "delete")).toBe(false);
    expect(fake.state.calls.filter((call) => call.op === "update")).toHaveLength(1);
    expect(recordDirectoryError).toHaveBeenCalledWith("recheck", error, {
      staffId: "staff-1",
      email: "ana@cincel.example",
    });
  });

  it("treats a Directory that is not configured as an outage, not a revoke", async () => {
    fake.state.claims = [true];
    evaluateAccess.mockRejectedValue(new DirectoryError("El Directorio de Google no está configurado", "network"));
    await expect(recheckStaffAccess("staff-1")).resolves.toMatchObject({ status: "error" });
    expect(fake.state.calls.some((call) => call.op === "delete")).toBe(false);
  });

  it("does nothing when the check is not due or was claimed by another request", async () => {
    fake.state.claims = [false];
    await expect(recheckStaffAccess("staff-1")).resolves.toEqual({ status: "not_claimed" });
    expect(evaluateAccess).not.toHaveBeenCalled();
  });

  it("rethrows errors that are not Directory errors", async () => {
    fake.state.claims = [true];
    evaluateAccess.mockRejectedValue(new Error("db down"));
    await expect(recheckStaffAccess("staff-1")).rejects.toThrow("db down");
  });
});
