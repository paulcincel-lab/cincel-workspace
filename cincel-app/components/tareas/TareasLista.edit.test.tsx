// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { CellEditorProps } from "@/components/widgets/CellEditor";

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
const actions = vi.hoisted(() => ({ updateTaskAction: vi.fn() }));
vi.mock("@/lib/actions/tasks-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/tasks-actions")>()),
  ...actions,
}));
vi.mock("@/components/widgets/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } }) => <span>{tramo.name}</span>,
}));
// The real RecordTable (the grid), without the page shell.
vi.mock("@/components/patterns/ListPage", async () => {
  const { RecordTable } = await import("@/components/widgets/RecordTable");
  return {
    ListPage: (props: ListPageProps) => (
      <main>{props.spec.kind === "table" ? <RecordTable data={props.spec.data} renderCell={props.spec.renderCell} /> : null}</main>
    ),
  };
});
vi.mock("@/components/widgets/CellEditor", () => ({
  CellEditor: (props: CellEditorProps<unknown>) => {
    if (!props.open) return null;
    const { edit } = props;
    const options = edit.kind === "select" || edit.kind === "person" ? edit.options(props.row) : [];
    return createPortal(
      <div role="dialog" aria-label={`Editor ${props.label ?? ""}`}>
        {props.canEdit === true ? (
          options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => {
                props.onCommitted?.(o.value);
                props.onOpenChange(false);
              }}
            >
              {o.label}
            </button>
          ))
        ) : (
          <p>{props.canEdit}</p>
        )}
      </div>,
      document.body,
    );
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { LOCK_REASON, OPEN_TASK_LABEL } from "@/components/widgets/editable-cell";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf, type TareasListPages } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { seedSessionUser } from "@/tests/helpers/session-user";

import { TareasLista } from "./TareasLista";
import { analiticoTaskRow } from "./fixtures/analitico-summary";
import { DISENO, LISTA_TRAMOS, PRESALE } from "./fixtures/lista-tasks";

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY, vista: "lista", tramo: "diseno" };

function renderLista() {
  const client = createTestQueryClient();
  const page = { facets: { total: 2, byTramo: {}, projects: [] }, tramos: LISTA_TRAMOS, staff: [] };
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, "analitico")), page);
  client.setQueryData(qk.catalog.taskStatuses(), []);
  const rows = [
    analiticoTaskRow({ id: "t1", title: "Levantamiento", workflow: DISENO, workflowId: DISENO.id }),
    analiticoTaskRow({ id: "t2", title: "Corte de muros", workflow: DISENO, workflowId: DISENO.id, parentTaskId: "t1" }),
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

function cell(rowId: string, column: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cell-row="${rowId}"][data-cell-column="${column}"]`);
  if (!el) throw new Error(`cell ${rowId}/${column} not found`);
  return el;
}

beforeEach(() => actions.updateTaskAction.mockReset());
afterEach(() => {
  cleanup();
  seedSessionUser(null);
});

describe("TareasLista editable cells", () => {
  it("edits the task columns and leaves Proyecto and the summary columns calculated", () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    renderLista();
    for (const column of ["tarea", "tramo", "fase", "responsable", "vence", "prioridad"]) {
      expect(cell("t1", column).dataset.cellState).toBe("editable");
    }
    for (const column of ["proyecto", "subtareas", "diasRetraso", "abiertas", "pctVencidas"]) {
      expect(cell("t1", column).dataset.cellState).toBe("inert");
    }
    // A subtask's fase comes from its parent.
    expect(cell("t2", "fase").dataset.cellState).toBe("locked");
    fireEvent.click(cell("t2", "fase"));
    expect(screen.getByRole("dialog", { name: "Editor Fase" }).textContent).toBe(LOCK_REASON.subtaskPhase);
  });

  it("keeps the title link and adds the open icon", () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    renderLista();
    const title = cell("t1", "tarea");
    expect(within(title).getByRole("link", { name: "Levantamiento" }).getAttribute("href")).toBe("/tareas?vista=lista&tarea=t1");
    expect(within(title).getByRole("link", { name: OPEN_TASK_LABEL }).getAttribute("href")).toBe("/tareas?vista=lista&tarea=t1");
  });

  it("moving a task out of the filtered tramo takes it out of the list", async () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Administrador" });
    actions.updateTaskAction.mockResolvedValue({ ok: true, data: { id: "t1", workflowId: PRESALE.id, phaseId: null } });
    renderLista();
    fireEvent.click(cell("t1", "tramo"));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Editor Tramo" })).getByRole("button", { name: "Presale" }));
    });
    expect(actions.updateTaskAction).toHaveBeenCalledWith("t1", { workflowId: PRESALE.id });
    // The subtask moves with it.
    await waitFor(() => expect(document.querySelector('[data-cell-row="t1"]')).toBeNull());
    expect(document.querySelector('[data-cell-row="t2"]')).toBeNull();
  });

  it("colaborador can't move a task with a tramo", () => {
    seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Colaborador" });
    renderLista();
    fireEvent.click(cell("t1", "tramo"));
    expect(screen.getByRole("dialog", { name: "Editor Tramo" }).textContent).toBe(LOCK_REASON.tramo);
  });
});
