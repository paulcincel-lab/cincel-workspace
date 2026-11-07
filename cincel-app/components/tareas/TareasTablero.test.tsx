// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { TaskListItem } from "@/lib/types/core";
import type { PresentationStyle, TaskBoard } from "@/lib/types/redesign";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=tablero"),
}));

const actions = vi.hoisted(() => ({
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg), success: vi.fn() } }));

// Shell pieces and sibling widgets render as plain markup: this file checks
// what the Tablero view hands the board, not their own styling.
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions: headerActions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {headerActions}
    </header>
  ),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));
vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("@/components/widgets/DistributionWidget", () => ({
  DistributionWidget: ({ title, segments }: { title: string; segments: DistributionSegment[] }) => (
    <ul aria-label={title}>
      {segments.map((s) => (
        <li key={s.key} data-key={s.key} data-value={s.value}>
          {s.label}: {s.value}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: ({ data }: { data: RecordTableData }) => (
    <table data-testid="record-table" data-columns={data.columns.map((c) => c.key).join(",")}>
      <tbody>
        {data.rows.map((r) => (
          <tr key={String(r.id)} data-row-id={String(r.id)}>
            <td>{String(r.tarea)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TABLERO_DESCRIPTION, TareasTablero, moveTaskToColumn } from "@/components/tareas/TareasTablero";

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "s1",
    managerId: "s1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: { id: "w1", key: "diseno", name: "Diseño", sortOrder: 2 },
    phase: null,
    space: null,
    manager: { id: "s1", name: "Ana Ruiz" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    ...overrides,
  } as TaskListItem;
}

const BOARD: TaskBoard = {
  pendiente: [
    makeTask({ id: "t1", title: "Levantamiento", commitmentDate: "2026-01-15", subtaskCount: 3, subtaskDoneCount: 1 }),
    makeTask({ id: "t2", title: "Planos ejecutivos", commitmentDate: "2030-06-15" }),
  ],
  en_proceso: [makeTask({ id: "t3", title: "Render sala", status: "en_proceso" })],
  completado: [makeTask({ id: "t4", title: "Contrato firmado", status: "completado", closedAt: "2026-01-02" })],
  bloqueado: [],
};
const TOTAL = 4;

function renderTablero(style: PresentationStyle, board: TaskBoard = BOARD) {
  return render(
    <StyleProvider style={style} scope="staff">
      <TareasTablero board={board} header={{ title: "Tareas" }} />
    </StyleProvider>,
  );
}

function card(container: HTMLElement, taskId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!el) throw new Error(`no card ${taskId}`);
  return el;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  refresh.mockReset();
  toastError.mockReset();
  actions.setTaskStatusAction.mockReset().mockResolvedValue({});
  actions.setTaskCustomStatusAction.mockReset().mockResolvedValue({});
});

afterEach(() => cleanup());

describe("TareasTablero · three styles from the same board", () => {
  it("renders the header with the Tablero description", () => {
    renderTablero("visual");
    expect(screen.getByRole("heading", { name: "Tareas" })).toBeTruthy();
    expect(screen.getByText(TABLERO_DESCRIPTION)).toBeTruthy();
  });

  it("Visual: one column per estatus, empty column collapsed, card links to the task sheet", () => {
    const { container } = renderTablero("visual");

    expect(container.querySelectorAll("[data-task-id]").length).toBe(TOTAL);
    expect(screen.getByRole("group", { name: "Pendiente · 2" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "En proceso · 1" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Completado · 1" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Bloqueado · 0" }).getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByRole("link", { name: "Planos ejecutivos" }).getAttribute("href")).toBe("/tareas?tarea=t2");
  });

  it("Esencial: groups by estatus with the same counts and Completado collapsed", () => {
    renderTablero("esencial");

    const pendiente = screen.getByRole("heading", { name: "Pendiente · 2" }).closest("section")!;
    const enProceso = screen.getByRole("heading", { name: "En proceso · 1" }).closest("section")!;
    const completado = screen.getByRole("heading", { name: "Completado · 1" }).closest("section")!;
    expect(pendiente.querySelectorAll("tr").length).toBe(2);
    expect(enProceso.querySelectorAll("tr").length).toBe(1);
    expect(completado.querySelector("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Bloqueado/ })).toBeNull();
  });

  it("Analítico: estatus summary and one 10-column table with every task", () => {
    renderTablero("analitico");

    const summary = screen.getByRole("list", { name: "Tareas por estatus" });
    const values = Array.from(summary.querySelectorAll("li")).map((li) => Number(li.getAttribute("data-value")));
    expect(values.reduce((a, b) => a + b, 0)).toBe(TOTAL);

    const table = screen.getByTestId("record-table");
    expect(table.querySelectorAll("tr").length).toBe(TOTAL);
    expect(table.getAttribute("data-columns")?.split(",")).toHaveLength(10);
  });

  it.each<PresentationStyle>(["visual", "esencial", "analitico"])("shows the filters empty state in %s", (style) => {
    renderTablero(style, { pendiente: [], en_proceso: [], completado: [], bloqueado: [] });
    expect(screen.getByTestId("empty-state").textContent).toBe("No hay tareas con estos filtros");
  });
});

describe("TareasTablero · moves", () => {
  it("drags optimistically through setTaskStatusAction and refreshes on success", async () => {
    const pending = deferred<unknown>();
    actions.setTaskStatusAction.mockReturnValue(pending.promise);
    const { container } = renderTablero("visual");

    fireEvent.dragStart(card(container, "t2"));
    const target = screen.getByRole("group", { name: "En proceso · 1" });
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t2", "en_proceso");
    // Moved before the server answers.
    expect(screen.getByRole("group", { name: "En proceso · 2" }).contains(card(container, "t2"))).toBe(true);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({});
      await pending.promise;
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rolls the card back and shows the mapped Spanish error when the action fails", async () => {
    const pending = deferred<unknown>();
    actions.setTaskStatusAction.mockReturnValue(pending.promise);
    const { container } = renderTablero("visual");

    fireEvent.dragStart(card(container, "t1"));
    const strip = screen.getByRole("group", { name: "Bloqueado · 0" });
    fireEvent.dragOver(strip);
    fireEvent.drop(strip);
    expect(screen.getByRole("group", { name: "Bloqueado · 1" }).contains(card(container, "t1"))).toBe(true);

    await act(async () => {
      pending.reject(new Error("FORBIDDEN: task status change"));
      await pending.promise.catch(() => {});
    });

    expect(screen.getByRole("group", { name: "Pendiente · 2" }).contains(card(container, "t1"))).toBe(true);
    expect(screen.getByRole("group", { name: "Bloqueado · 0" }).getAttribute("data-collapsed")).toBe("true");
    expect(toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("moves a card from the keyboard through “Mover a…”", async () => {
    const { container } = renderTablero("visual");

    const trigger = screen.getByRole("button", { name: "Mover a… Render sala" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const option = await screen.findByRole("menuitem", { name: "Completado" });

    await act(async () => {
      fireEvent.click(option);
    });

    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t3", "completado");
    expect(screen.getByRole("group", { name: "Completado · 2" }).contains(card(container, "t3"))).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("moveTaskToColumn", () => {
  it("sends base columns to setTaskStatusAction", async () => {
    await moveTaskToColumn("t1", "bloqueado");
    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t1", "bloqueado");
    expect(actions.setTaskCustomStatusAction).not.toHaveBeenCalled();
  });

  it("sends custom:<id> columns to setTaskCustomStatusAction", async () => {
    await moveTaskToColumn("t1", "custom:cs-rev");
    expect(actions.setTaskCustomStatusAction).toHaveBeenCalledWith("t1", "cs-rev");
    expect(actions.setTaskStatusAction).not.toHaveBeenCalled();
  });

  it("rejects with the action error so the board rolls back", async () => {
    actions.setTaskStatusAction.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(moveTaskToColumn("t1", "completado")).rejects.toThrow("NOT_FOUND");
  });
});
