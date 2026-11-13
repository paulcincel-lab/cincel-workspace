// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListPageProps } from "@/components/patterns/ListPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=lista"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, scroll, onNavigate, ...rest }: { href: string; children: ReactNode; scroll?: boolean; onNavigate?: unknown }) => {
    void scroll;
    void onNavigate;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => {
  const never = () => new Promise(() => {});
  return {
    getTareasPageData: vi.fn(never),
    getTareasListPage: vi.fn(never),
    getTareasFacets: vi.fn(never),
    getTareasSummary: vi.fn(never),
    getTareasBoard: vi.fn(never),
    getTareasBoardColumn: vi.fn(never),
  };
});
const actions = vi.hoisted(() => ({ deleteTaskAction: vi.fn(), restoreTaskAction: vi.fn() }));
vi.mock("@/lib/actions/tasks-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/tasks-actions")>()),
  ...actions,
}));
const toasts = vi.hoisted(() => Object.assign(vi.fn(() => "toast-1"), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/components/widgets/EtapaBadge", () => ({
  EtapaBadge: ({ etapa }: { etapa: { name: string } }) => <span>{etapa.name}</span>,
}));
// The real RecordTable, without the page shell.
vi.mock("@/components/patterns/ListPage", async () => {
  const { RecordTable } = await import("@/components/widgets/RecordTable");
  return {
    ListPage: (props: ListPageProps) => (
      <main>
        {props.spec.kind === "table" ? (
          <RecordTable data={props.spec.data} renderCell={props.spec.renderCell} rowMenu={props.spec.rowMenu} />
        ) : null}
      </main>
    ),
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { UNDO_LABEL } from "@/components/widgets/editable-cell";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf, type TareasListPages } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

import { TareasLista } from "./TareasLista";
import { analiticoTaskRow } from "./fixtures/analitico-summary";
import { DISENO, LISTA_ETAPAS } from "./fixtures/lista-tasks";
import { TASK_DELETE_CONFIRM, TASK_DELETED_TOAST, TASK_DELETE_UNDO_MS, TASK_RESTORED_TOAST } from "./task-table-copy";

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY, etapa: "diseno" };

function renderLista() {
  const client = createTestQueryClient();
  const page = { facets: { total: 3, byEtapa: {}, projects: [] }, etapas: LISTA_ETAPAS, staff: [] };
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, "analitico")), page);
  client.setQueryData(qk.catalog.taskStatuses(), []);
  const rows = [
    analiticoTaskRow({ id: "t1", title: "Levantamiento", workflow: DISENO, workflowId: DISENO.id }),
    analiticoTaskRow({ id: "t2", title: "Corte de muros", workflow: DISENO, workflowId: DISENO.id, parentTaskId: "t1" }),
    analiticoTaskRow({ id: "t3", title: "Planos", workflow: DISENO, workflowId: DISENO.id }),
  ];
  client.setQueryData<TareasListPages>(qk.tareas.list(tareasListFiltersOf(QUERY)), {
    pages: [{ rows, nextCursor: null, total: rows.length }],
    pageParams: [null],
  });
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasLista query={QUERY} header={{ title: "Tareas" }} />
    </StyleProvider>,
    { client },
  );
}

const rowShown = (id: string) => document.querySelector(`[data-cell-row="${id}"]`) !== null;
const cellOf = (id: string, column: string) =>
  document.querySelector<HTMLElement>(`[data-cell-row="${id}"][data-cell-column="${column}"]`)!;

async function openMenu(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de «${title}»` }));
  return screen.findByRole("menu");
}

beforeEach(() => {
  actions.deleteTaskAction.mockReset();
  actions.restoreTaskAction.mockReset();
  toasts.mockClear();
  toasts.error.mockClear();
});
afterEach(() => {
  cleanup();
  seedSessionUser(null);
});

describe("TareasLista row delete (#1041)", () => {
  it("confirms, hides the row and its subtasks, and Deshacer restores them", async () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    actions.deleteTaskAction.mockResolvedValue({ ok: true, data: undefined });
    actions.restoreTaskAction.mockResolvedValue({ ok: true, data: undefined });
    renderLista();

    const menu = await openMenu("Levantamiento");
    const items = within(menu).getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Abrir", "Eliminar"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(TASK_DELETE_CONFIRM("Levantamiento"))).toBeTruthy();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    });

    expect(actions.deleteTaskAction).toHaveBeenCalledWith("t1");
    await waitFor(() => expect(rowShown("t1")).toBe(false));
    expect(rowShown("t2")).toBe(false);
    expect(rowShown("t3")).toBe(true);
    expect(toasts).toHaveBeenCalledWith(
      TASK_DELETED_TOAST,
      expect.objectContaining({ duration: TASK_DELETE_UNDO_MS, action: expect.objectContaining({ label: UNDO_LABEL }) }),
    );

    const [, options] = toasts.mock.calls[0] as unknown as [string, { action: { onClick(): void } }];
    await act(async () => {
      options.action.onClick();
    });
    expect(actions.restoreTaskAction).toHaveBeenCalledWith("t1");
    await waitFor(() => expect(rowShown("t1")).toBe(true));
    expect(rowShown("t2")).toBe(true);
    expect(toasts).toHaveBeenCalledWith(TASK_RESTORED_TOAST);
  });

  it("brings the row back with an error when the delete fails", async () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    actions.deleteTaskAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderLista();

    fireEvent.click(within(await openMenu("Planos")).getByRole("menuitem", { name: "Eliminar" }));
    await act(async () => {
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
    });
    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(rowShown("t3")).toBe(true);
    expect(toasts).not.toHaveBeenCalledWith(TASK_DELETED_TOAST, expect.anything());
  });

  it("Supr on a focused cell opens the same confirmation", async () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    renderLista();
    const cell = cellOf("t3", "prioridad");
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: "Delete" });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(TASK_DELETE_CONFIRM("Planos"))).toBeTruthy();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();
  });

  it("without canDeleteActivity the menu has no Eliminar and Supr does nothing", async () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Colaborador" });
    renderLista();
    const menu = await openMenu("Planos");
    expect(within(menu).getAllByRole("menuitem").map((el) => el.textContent)).toEqual(["Abrir"]);
    fireEvent.keyDown(document.body, { key: "Escape" });
    const cell = cellOf("t3", "prioridad");
    fireEvent.keyDown(cell, { key: "Delete" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
