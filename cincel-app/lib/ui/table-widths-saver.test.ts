import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/table-widths-actions", () => ({ setTableColumnWidthsAction: action }));

import { createWidthsSaver } from "@/lib/ui/table-widths-saver";

beforeEach(() => {
  vi.useFakeTimers();
  action.mockReset();
});
afterEach(() => vi.useRealTimers());

function setup() {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const saver = createWidthsSaver({ tableId: "tareas", onSaved, onError, delayMs: 500 });
  return { saver, onSaved, onError };
}

describe("createWidthsSaver", () => {
  it("sends one save with the last widths after the debounce", async () => {
    action.mockResolvedValue({ ok: true, data: { tableColumnWidths: { tareas: { tarea: 480 } } } });
    const { saver, onSaved } = setup();
    saver.schedule({ tarea: 300 });
    saver.schedule({ tarea: 400 });
    saver.schedule({ tarea: 480 });
    await vi.advanceTimersByTimeAsync(499);
    expect(action).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ tableId: "tareas", widths: { tarea: 480 } });
    expect(onSaved).toHaveBeenCalledWith({ tareas: { tarea: 480 } });
  });

  it("flush sends at once and a reset sends null", async () => {
    action.mockResolvedValue({ ok: true, data: { tableColumnWidths: {} } });
    const { saver } = setup();
    saver.schedule(null);
    await saver.flush();
    expect(action).toHaveBeenCalledWith({ tableId: "tareas", widths: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing queued sends nothing", async () => {
    const { saver } = setup();
    await saver.flush();
    expect(action).not.toHaveBeenCalled();
  });

  it("cancel drops what is queued", async () => {
    const { saver } = setup();
    saver.schedule({ tarea: 300 });
    saver.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(action).not.toHaveBeenCalled();
  });

  it("reports a failed result through onError", async () => {
    action.mockResolvedValue({ ok: false, error: "INVALID: widths" });
    const { saver, onSaved, onError } = setup();
    saver.schedule({ tarea: 300 });
    await saver.flush();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe("INVALID: widths");
  });
});
