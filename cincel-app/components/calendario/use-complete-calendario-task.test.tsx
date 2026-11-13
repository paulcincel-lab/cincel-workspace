import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { qk } from "@/lib/query/keys";
import { DEFAULT_CALENDARIO_FILTERS } from "@/lib/calendario/url-state";
import type { CalTaskItem, CalendarioRange } from "@/lib/types/calendario";

const setTaskStatusAction = vi.fn();
const toastFn = vi.fn();
vi.mock("@/lib/actions/tasks-actions", () => ({ setTaskStatusAction: (...a: unknown[]) => setTaskStatusAction(...a) }));
vi.mock("sonner", () => ({ toast: Object.assign((...a: unknown[]) => toastFn(...a), { error: vi.fn(), success: vi.fn() }) }));

import { useCompleteCalendarioTask } from "./use-complete-calendario-task";

const item: CalTaskItem = {
  kind: "task", id: "t:1", taskId: "1", title: "Ingenierías", date: "2026-11-11", dateField: "commitmentDate",
  project: { id: "p", name: "Madrid 22" }, etapa: null, phase: null, status: "pendiente", statusLabel: "Pendiente",
  priority: "media", manager: null, support: [], overdue: false, completed: false, blocked: false, hours: 1,
  hoursSource: "default", parentTaskId: null, canEdit: true,
};
const input = { view: "semana" as const, from: "2026-11-09", to: "2026-11-15", filters: DEFAULT_CALENDARIO_FILTERS };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const range: CalendarioRange = { ...emptyCalendarioRange(input, "2026-11-11"), items: [item] };
  qc.setQueryData(qk.calendario.range(input), range);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useCompleteCalendarioTask([item], false), { wrapper });
  const current = () => qc.getQueryData<CalendarioRange>(qk.calendario.range(input))!.items[0] as CalTaskItem;
  return { qc, hook, current };
}

describe("useCompleteCalendarioTask", () => {
  beforeEach(() => {
    setTaskStatusAction.mockReset();
    toastFn.mockReset();
  });

  it("completes optimistically and offers Deshacer", async () => {
    let release: (v: unknown) => void = () => {};
    setTaskStatusAction.mockReturnValue(new Promise((r) => (release = r)));
    const { hook, current } = setup();
    act(() => hook.result.current("1"));
    await waitFor(() => expect(current().completed).toBe(true));
    await act(async () => release({ ok: true, data: {} }));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith("Tarea completada.", expect.objectContaining({ action: expect.objectContaining({ label: "Deshacer" }) })));
    expect(setTaskStatusAction).toHaveBeenCalledWith("1", "completado");

    setTaskStatusAction.mockResolvedValue({ ok: true, data: {} });
    await act(async () => toastFn.mock.calls[0][1].action.onClick());
    await waitFor(() => expect(setTaskStatusAction).toHaveBeenLastCalledWith("1", "pendiente"));
  });

  it("rolls back when the action fails", async () => {
    setTaskStatusAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const { hook, current } = setup();
    act(() => hook.result.current("1"));
    await waitFor(() => expect(setTaskStatusAction).toHaveBeenCalled());
    await waitFor(() => expect(current().completed).toBe(false));
    expect(toastFn).not.toHaveBeenCalled();
  });
});
