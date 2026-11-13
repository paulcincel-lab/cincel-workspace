// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastMock = vi.hoisted(() => {
  const fn = vi.fn(() => "toast-id") as ReturnType<typeof vi.fn> & {
    error: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  fn.error = vi.fn();
  fn.dismiss = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock }));

import { type CellEdit, UNDO_MS, UNDONE_TOAST } from "@/components/widgets/editable-cell";
import {
  CellCommitProvider,
  useCellCommit,
  useCellCommitContext,
  type UseCellCommitOptions,
} from "@/components/widgets/use-cell-commit";

type Row = { id: string; status: string | null };
type Data = Row[];
const KEY = ["tasks", "list"];
const row: Row = { id: "t1", status: "curso" };

const apply = (cached: unknown, r: Row, value: string | null) =>
  (cached as Data).map((x) => (x.id === r.id ? { ...x, status: value } : x));

function makeEdit(commit: CellEdit<Row>["commit"]): CellEdit<Row> {
  return { kind: "select", value: (r) => r.status, options: () => [], commit };
}

let client: QueryClient;

function setup(options: Partial<UseCellCommitOptions<Row>> = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCellCommit<Row>({ queryKeys: [KEY], label: "Estatus", apply, ...options }), { wrapper });
}

const cached = () => client.getQueryData<Data>(KEY);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<Data>(KEY, [row, { id: "t2", status: "pendiente" }]);
  toastMock.mockClear();
  toastMock.error.mockClear();
  toastMock.dismiss.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCellCommit", () => {
  it("patches the cache before the server answers, then toasts with Deshacer", async () => {
    let resolve!: () => void;
    const commit = vi.fn(
      () => new Promise<{ ok: true; data: null }>((r) => (resolve = () => r({ ok: true, data: null }))),
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = setup();
    let done!: Promise<void>;
    act(() => {
      done = result.current.commit(makeEdit(commit), row, "revision");
    });
    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith(row, "revision"));
    expect(cached()?.[0].status).toBe("revision");
    expect(result.current.pending).toBe(true);
    await act(async () => {
      resolve();
      await done;
    });
    expect(result.current.pending).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      "Estatus guardado.",
      expect.objectContaining({ duration: UNDO_MS, action: expect.objectContaining({ label: "Deshacer" }) }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("rolls back and shows the mapped error when the save fails", async () => {
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(async () => ({ ok: false, error: "PHASE_MISMATCH" })), row, "x"));
    expect(cached()?.[0].status).toBe("curso");
    expect(toastMock.error).toHaveBeenCalledWith("Esa fase no pertenece a la etapa de la tarea.");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("rolls back when the action throws", async () => {
    const { result } = setup();
    await act(() =>
      result.current.commit(
        makeEdit(async () => {
          throw new Error("FORBIDDEN: nope");
        }),
        row,
        "x",
      ),
    );
    expect(cached()?.[0].status).toBe("curso");
    expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
  });

  it("does nothing when the value didn't change", async () => {
    const commit = vi.fn(async () => ({ ok: true as const, data: null }));
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(commit), row, "curso"));
    expect(commit).not.toHaveBeenCalled();
  });

  it("without apply only invalidates", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = setup({ apply: undefined });
    await act(() => result.current.commit(makeEdit(async () => ({ ok: true, data: null })), row, "revision"));
    expect(cached()?.[0].status).toBe("curso");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("undo commits the previous value", async () => {
    const commit = vi.fn(async () => ({ ok: true as const, data: null }));
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(commit), row, "revision"));
    await act(async () => {
      result.current.undo();
    });
    await vi.waitFor(() => expect(commit).toHaveBeenLastCalledWith(row, "curso"));
    expect(toastMock.dismiss).toHaveBeenCalledWith("toast-id");
    await vi.waitFor(() => expect(toastMock).toHaveBeenLastCalledWith(UNDONE_TOAST));
    // Only once.
    await act(async () => {
      result.current.undo();
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("the toast's Deshacer action undoes", async () => {
    const commit = vi.fn(async () => ({ ok: true as const, data: null }));
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(commit), row, "revision"));
    const options = (toastMock.mock.calls[0] as unknown[])[1] as { action: { onClick(): void } };
    await act(async () => options.action.onClick());
    await vi.waitFor(() => expect(commit).toHaveBeenLastCalledWith(row, "curso"));
  });

  it("⌘/Ctrl+Z undoes while the toast shows, not after 5 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const commit = vi.fn(async () => ({ ok: true as const, data: null }));
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(commit), row, "revision"));
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    });
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    expect(commit).toHaveBeenLastCalledWith(row, "curso");

    await act(() => result.current.commit(makeEdit(commit), row, "pendiente"));
    expect(commit).toHaveBeenCalledTimes(3);
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS + 10);
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", metaKey: true });
      result.current.undo();
    });
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it("Ctrl+Z inside a text field is left to the field", async () => {
    const commit = vi.fn(async () => ({ ok: true as const, data: null }));
    const { result } = setup();
    await act(() => result.current.commit(makeEdit(commit), row, "revision"));
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(commit).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("a failed undo rolls back to the saved value", async () => {
    const commit = vi
      .fn<CellEdit<Row>["commit"]>()
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: false, error: "NOT_FOUND" });
    const { result } = setup();
    // The row as the cache shows it after the first save.
    await act(() => result.current.commit(makeEdit(commit), row, "revision"));
    client.setQueryData<Data>(KEY, [{ id: "t1", status: "revision" }]);
    await act(async () => result.current.undo());
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Ya no existe. Recarga la página."));
    expect(cached()?.[0].status).toBe("revision");
  });
});

describe("CellCommitProvider", () => {
  it("gives the cells its keys and patch; null outside", () => {
    const outside = renderHook(() => useCellCommitContext());
    expect(outside.result.current).toBeNull();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CellCommitProvider<Row> queryKeys={[KEY, ["other"]]} apply={apply}>
        {children}
      </CellCommitProvider>
    );
    const { result, rerender } = renderHook(() => useCellCommitContext(), { wrapper });
    expect(result.current?.queryKeys).toEqual([KEY, ["other"]]);
    expect(result.current?.apply).toBe(apply);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
