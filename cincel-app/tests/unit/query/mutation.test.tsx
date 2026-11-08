/**
 * `useActionMutation` (plan §4.4): every branch of the contract in #935.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { actionErrorText } from "@/lib/errors";
import {
  isStrippedActionError,
  runAction,
  useActionMutation,
  type ActionLike,
  type ActionMutationOptions,
} from "@/lib/query/mutation";
import { createTestQueryClient, mockAction } from "@/lib/query/test-utils";
import type { ActionResult } from "@/lib/types/schedule";

const GENERIC = "No se pudo completar la acción. Intenta de nuevo.";

/** What production sends for a thrown action error: a generic message plus a digest. */
function strippedError(): Error {
  const err = new Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
  ) as Error & { digest: string };
  err.digest = "1234567890";
  return err;
}

let qc: QueryClient;

function setup<V, R, Snap = unknown>(action: ActionLike<V, R>, opts?: ActionMutationOptions<V, R, Snap>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useActionMutation<V, R, Snap>(action, opts), { wrapper });
}

beforeEach(() => {
  qc = createTestQueryClient();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
});

describe("runAction", () => {
  it("unwraps { ok: true, data }, passes other results through and throws { ok: false }", async () => {
    await expect(runAction(async () => ({ ok: true, data: 7 }) as ActionResult<number>, undefined)).resolves.toBe(7);
    await expect(runAction(async () => ({ ok: true, emailSent: false }), undefined)).resolves.toEqual({
      ok: true,
      emailSent: false,
    });
    await expect(runAction(async () => ({ ok: false, error: "forbidden" }), undefined)).rejects.toThrow("forbidden");
    await expect(runAction(async () => "plain", undefined)).resolves.toBe("plain");
  });
});

describe("isStrippedActionError", () => {
  it("is true only for a non-code message with a digest", () => {
    expect(isStrippedActionError(strippedError())).toBe(true);
    expect(isStrippedActionError(new Error("FORBIDDEN"))).toBe(false);
    expect(isStrippedActionError(Object.assign(new Error("NOT_FOUND"), { digest: "1" }))).toBe(false);
    expect(isStrippedActionError(new Error("something odd"))).toBe(false);
  });
});

describe("useActionMutation", () => {
  it("returns the data and invalidates a static key list (prefix match) on success", async () => {
    qc.setQueryData(["tareas", "list", {}], ["a"]);
    qc.setQueryData(["inicio"], { x: 1 });
    qc.setQueryData(["personas", "equipo"], []);
    const action = mockAction(async (n: number) => n * 2);
    const { result } = setup(action, { invalidate: [["tareas"], ["inicio"]], successToast: "Guardado" });

    let data: number | undefined;
    await act(async () => {
      data = await result.current.mutateAsync(4);
    });

    expect(data).toBe(8);
    expect(action.calls).toEqual([4]);
    expect(qc.getQueryState(["tareas", "list", {}])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["inicio"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["personas", "equipo"])?.isInvalidated).toBe(false);
    expect(toastMock.success).toHaveBeenCalledWith("Guardado");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("invalidates the keys a function returns from the variables and the result", async () => {
    qc.setQueryData(["tasks", "t1"], {});
    qc.setQueryData(["tasks", "t2"], {});
    const invalidate = vi.fn((vars: { id: string }, data: { projectId: string } | undefined) => [
      ["tasks", vars.id],
      ["proyectos", data?.projectId ?? "none"],
    ]);
    const { result } = setup(async (vars: { id: string }) => ({ ok: true as const, data: { projectId: `p-${vars.id}` } }), {
      invalidate,
      successToast: (d) => `Listo ${d.projectId}`,
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "t1" });
    });

    expect(invalidate).toHaveBeenCalledWith({ id: "t1" }, { projectId: "p-t1" });
    expect(qc.getQueryState(["tasks", "t1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["tasks", "t2"])?.isInvalidated).toBe(false);
    expect(toastMock.success).toHaveBeenCalledWith("Listo p-t1");
  });

  it("also invalidates after an error (onSettled)", async () => {
    qc.setQueryData(["inicio"], {});
    const { result } = setup(async () => ({ ok: false as const, error: "FORBIDDEN" }), { invalidate: [["inicio"]] });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(qc.getQueryState(["inicio"])?.isInvalidated).toBe(true);
  });

  it("passes undefined data to an invalidate function after an error", async () => {
    qc.setQueryData(["tasks", "t3"], {});
    const invalidate = vi.fn((vars: { id: string }) => [["tasks", vars.id]]);
    const { result } = setup<{ id: string }, never>(async () => ({ ok: false as const, error: "NOT_FOUND" }), {
      invalidate,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: "t3" }).catch(() => undefined);
    });
    expect(invalidate).toHaveBeenCalledWith({ id: "t3" }, undefined);
    expect(qc.getQueryState(["tasks", "t3"])?.isInvalidated).toBe(true);
  });

  it("does not call setData or the success toast after an error", async () => {
    const setData = vi.fn();
    const { result } = setup(async () => ({ ok: false as const, error: "FORBIDDEN" }), {
      setData,
      successToast: "Guardado",
    });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(setData).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("writes the result with setData", async () => {
    const setData = vi.fn((client: QueryClient, data: { id: string; name: string }) => {
      client.setQueryData(["tasks", data.id], data);
    });
    const { result } = setup(async (name: string) => ({ id: "t9", name }), { setData });
    await act(async () => {
      await result.current.mutateAsync("Planos");
    });
    expect(setData).toHaveBeenCalledWith(qc, { id: "t9", name: "Planos" }, "Planos");
    expect(qc.getQueryData(["tasks", "t9"])).toEqual({ id: "t9", name: "Planos" });
  });

  it("toasts the actionErrorText copy for an { ok: false, error } result", async () => {
    const action = mockAction(async () => ({ ok: true as const, data: 1 }));
    action.failWith("NAME_TAKEN");
    const { result } = setup(action, { errorContext: { entity: "position" } });
    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow("NAME_TAKEN");
    });
    expect(toastMock.error).toHaveBeenCalledWith("Ya existe un puesto con ese nombre.");
    expect(toastMock.error).toHaveBeenCalledWith(actionErrorText("NAME_TAKEN", { entity: "position" }));
  });

  it("toasts the copy for a thrown Error('CODE')", async () => {
    const action = mockAction(async () => 1);
    action.throwWith(new Error("FORBIDDEN: task edit"));
    const { result } = setup(action);
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
  });

  it("maps a production-stripped error (generic message + digest) to the generic copy, never the raw message", async () => {
    const action = mockAction(async () => 1);
    action.throwWith(strippedError());
    const { result } = setup(action, { errorContext: "gmail" });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith(GENERIC);
    expect(toastMock.error.mock.calls[0][0]).not.toMatch(/Server Components|digest/);
  });

  it("rolls the optimistic patch back on error", async () => {
    qc.setQueryData(["tareas", "board", {}], { todo: ["t1"], done: [] as string[] });
    const seen: unknown[] = [];
    const { result } = setup<string, void, { before: unknown }>(
      async () => {
        seen.push(qc.getQueryData(["tareas", "board", {}]));
        throw new Error("NOT_FOUND");
      },
      {
        optimistic: {
          onMutate: async (client, id) => {
            const before = client.getQueryData(["tareas", "board", {}]);
            client.setQueryData(["tareas", "board", {}], { todo: [], done: [id] });
            return { before };
          },
          rollback: (client, snap) => client.setQueryData(["tareas", "board", {}], snap.before),
        },
      },
    );

    await act(async () => {
      await result.current.mutateAsync("t1").catch(() => undefined);
    });

    expect(seen).toEqual([{ todo: [], done: ["t1"] }]);
    expect(qc.getQueryData(["tareas", "board", {}])).toEqual({ todo: ["t1"], done: [] });
    expect(toastMock.error).toHaveBeenCalledWith("Ya no existe. Recarga la página.");
  });

  it("keeps the optimistic patch on success", async () => {
    qc.setQueryData(["me", "checklists"], { done: false });
    const rollback = vi.fn();
    const { result } = setup(async () => undefined, {
      optimistic: {
        onMutate: (client) => {
          client.setQueryData(["me", "checklists"], { done: true });
          return null;
        },
        rollback,
      },
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(rollback).not.toHaveBeenCalled();
    expect(qc.getQueryData(["me", "checklists"])).toEqual({ done: true });
  });

  it("sends the copy to onFormError instead of a toast", async () => {
    const onFormError = vi.fn();
    const { result } = setup(async () => ({ ok: false as const, error: "INVALID" }), { onFormError });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(onFormError).toHaveBeenCalledWith("Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.");
    expect(toastMock.error).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("calls onStaleError after the toast for a stale code, not for others", async () => {
    const onStaleError = vi.fn();
    const action = mockAction(async () => undefined);
    const { result } = setup(action, { onStaleError });

    action.throwWith(new Error("NOT_FOUND"));
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(toastMock.error).toHaveBeenCalledWith("Ya no existe. Recarga la página.");
    expect(onStaleError).toHaveBeenCalledTimes(1);

    action.throwWith(new Error("FORBIDDEN"));
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    action.throwWith(strippedError());
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(onStaleError).toHaveBeenCalledTimes(1);
  });

  it("honours custom staleCodes", async () => {
    const onStaleError = vi.fn();
    const { result } = setup(async () => ({ ok: false as const, error: "OVERLAP" }), {
      onStaleError,
      staleCodes: ["OVERLAP"],
    });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });
    expect(onStaleError).toHaveBeenCalledTimes(1);
  });

  it("shows the partial-failure copy after the success toast", async () => {
    const { result } = setup(async () => ({ created: true, subtaskError: "FORBIDDEN" as string | null }), {
      successToast: "Tarea creada",
      partialFailure: (d) => (d.subtaskError ? actionErrorText(d.subtaskError) : null),
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastMock.success).toHaveBeenCalledWith("Tarea creada");
    expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
    expect(toastMock.success.mock.invocationCallOrder[0]).toBeLessThan(toastMock.error.mock.invocationCallOrder[0]);
  });

  it("shows no partial-failure toast when the result is complete", async () => {
    const { result } = setup(async () => ({ created: true, subtaskError: null as string | null }), {
      partialFailure: (d) => d.subtaskError,
    });
    await act(async () => {
      await result.current.mutateAsync(undefined);
    });
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
