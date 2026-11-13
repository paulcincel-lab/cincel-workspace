import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

const requestHeaders = vi.hoisted(() => ({ value: new Headers() as Headers | null }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    if (!requestHeaders.value) throw new Error("outside a request scope");
    return requestHeaders.value;
  }),
}));

vi.mock("@/lib/db/client", () => ({ db: { tag: "db" } }));

const onTaskClosingChanged = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-flow/auto-start", () => ({ onTaskClosingChanged }));

import { runTaskClosingHook, scheduleTaskClosingHook } from "./closing-hook";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const PRESALE = "66666666-6666-4666-8666-666666666666";
const DISENO = "77777777-7777-4777-8777-777777777777";

async function runScheduled() {
  for (const [callback] of after.mock.calls) await (callback as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  requestHeaders.value = new Headers();
  onTaskClosingChanged.mockResolvedValue(undefined);
});

describe("runTaskClosingHook", () => {
  it("runs onTaskClosingChanged for the pair with the actor", async () => {
    await runTaskClosingHook(PROJECT, PRESALE, ACTOR, "trace-1");
    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("logs one JSON line with trace_id and never throws when the hook fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onTaskClosingChanged.mockRejectedValue(new Error("boom"));

    await expect(runTaskClosingHook(PROJECT, PRESALE, ACTOR, "trace-1")).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0][0]));
    expect(line).toEqual({
      level: "error",
      msg: "task.closing_hook_failed",
      trace_id: "trace-1",
      projectId: PROJECT,
      workflowId: PRESALE,
      err: "boom",
    });
  });

  it("generates a trace_id when none is given", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onTaskClosingChanged.mockRejectedValue("nope");

    await runTaskClosingHook(PROJECT, PRESALE, null);

    const line = JSON.parse(String(error.mock.calls[0][0]));
    expect(line.trace_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(line.err).toBe("nope");
  });
});

describe("scheduleTaskClosingHook", () => {
  it("defers the hook to after() and runs it for the task's pair", async () => {
    await scheduleTaskClosingHook({ projectId: PROJECT, workflowId: PRESALE }, ACTOR);

    expect(after).toHaveBeenCalledTimes(1);
    expect(onTaskClosingChanged).not.toHaveBeenCalled();
    await runScheduled();
    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("schedules each distinct (project, etapa) pair once", async () => {
    await scheduleTaskClosingHook(
      [
        { projectId: PROJECT, workflowId: PRESALE },
        { projectId: PROJECT, workflowId: PRESALE },
        { projectId: PROJECT, workflowId: DISENO },
      ],
      ACTOR
    );
    expect(after).toHaveBeenCalledTimes(2);
    await runScheduled();
    expect(onTaskClosingChanged.mock.calls.map((call) => call[2])).toEqual([PRESALE, DISENO]);
  });

  it("skips tasks without an etapa", async () => {
    await scheduleTaskClosingHook({ projectId: PROJECT, workflowId: null }, ACTOR);
    expect(after).not.toHaveBeenCalled();
  });

  it("uses the request id as trace_id when the request carries one", async () => {
    requestHeaders.value = new Headers({ "x-request-id": "req-42" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onTaskClosingChanged.mockRejectedValue(new Error("boom"));

    await scheduleTaskClosingHook({ projectId: PROJECT, workflowId: PRESALE }, ACTOR);
    await runScheduled();

    expect(JSON.parse(String(error.mock.calls[0][0])).trace_id).toBe("req-42");
  });

  it("falls back to a new trace_id outside a request scope", async () => {
    requestHeaders.value = null;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onTaskClosingChanged.mockRejectedValue(new Error("boom"));

    await scheduleTaskClosingHook({ projectId: PROJECT, workflowId: PRESALE }, ACTOR);
    await runScheduled();

    expect(JSON.parse(String(error.mock.calls[0][0])).trace_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
