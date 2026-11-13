// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, scroll, prefetch, ...rest }: { href: string; children: ReactNode; scroll?: boolean; prefetch?: boolean }) => {
    void scroll;
    void prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));
const children = vi.hoisted(() => ({
  batch: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, [] as unknown[]]))),
  one: vi.fn(async () => [] as unknown[]),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasSummary: vi.fn(),
  getTareasListPage: vi.fn(async () => ({ rows: [], nextCursor: null, total: 0 })),
  getTaskChildren: children.one,
  getTaskChildrenBatch: children.batch,
}));
vi.mock("./use-tareas-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-tareas-page")>()),
  useTareasPageReady: () => true,
}));
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
// The quick-add line has its own tests; here the context it gets is what counts.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, colSpan }: { context: { label: string; parentTaskId?: string }; colSpan?: number }) => (
    <tr data-slot="quick-add" data-parent={context.parentTaskId ?? ""}>
      <td colSpan={colSpan}>{context.label}</td>
    </tr>
  ),
}));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }) }));

import { TareasAnalitico } from "./TareasAnalitico";
import {
  ANALITICO_FACETS,
  ANALITICO_SUMMARY,
  ANALITICO_ETAPAS,
  LOMAS_PRESALE_ROWS,
  analiticoTaskRow,
  seedAnalitico,
} from "./fixtures/analitico-summary";
import { SUBTASKS_COLLAPSE_ALL, SUBTASKS_EXPAND_ALL } from "./use-subtask-rows";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetTareasUi } from "@/lib/stores/tareas-ui-store";
import { DEFAULT_TAREAS_QUERY } from "@/lib/tareas/query";

const LOMAS = LOMAS_PRESALE_ROWS[0].project;
const SUBTASKS = [
  analiticoTaskRow({ id: "t1a", title: "Cláusulas", parentTaskId: "t1", project: LOMAS, commitmentDate: "2026-11-02" }),
  analiticoTaskRow({ id: "t1b", title: "Firma", parentTaskId: "t1", project: LOMAS, status: "completado" }),
];

function renderAnalitico(seedChildren = true) {
  const client = createTestQueryClient();
  seedAnalitico(client, tareasListFiltersOf(DEFAULT_TAREAS_QUERY), ANALITICO_SUMMARY);
  if (seedChildren) client.setQueryData(qk.tasks.children("t1"), SUBTASKS);
  const view = renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasAnalitico
        query={DEFAULT_TAREAS_QUERY}
        facets={ANALITICO_FACETS}
        etapas={ANALITICO_ETAPAS}
        staff={[{ id: "s1", name: "Ana Ruiz" }]}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={vi.fn()}
        empty={{ title: "No hay tareas con estos filtros" }}
        canCreate
      />
    </StyleProvider>,
    { client },
  );
  return { ...view, client };
}

const nestedRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="leaf-row"][data-depth="1"]'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
  resetTareasUi();
  children.batch.mockClear();
  children.one.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TareasAnalitico subtasks (#1048)", () => {
  it("subtasks never show as flat rows; open, they sit under their parent with the same cells and a quick-add", async () => {
    const { container } = renderAnalitico();
    expect(nestedRows(container)).toHaveLength(0);
    expect(screen.queryByText("Cláusulas")).toBeNull();
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    await act(async () => {
      fireEvent.click(within(lomas).getByRole("button", { name: "Subtareas de «Contrato»" }));
    });
    const nested = nestedRows(container);
    expect(nested.map((r) => r.dataset.rowId)).toEqual(["t1a", "t1b"]);
    // Right under the parent, in the children order.
    const parentRow = container.querySelector<HTMLElement>('[data-slot="leaf-row"][data-row-id="t1"]')!;
    expect(parentRow.nextElementSibling).toBe(nested[0]);
    expect(nested[0].dataset.parentRowId).toBe("t1");
    // Same editable columns as the parent row.
    const editable = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>("[data-grid-cell]")).map((c) => c.dataset.cellColumn);
    expect(editable(nested[0])).toEqual(editable(parentRow));
    // "+ Subtarea…" after the children, for this parent.
    const add = nested[1].nextElementSibling as HTMLElement;
    expect(add.dataset.slot).toBe("quick-add");
    expect(add.dataset.parent).toBe("t1");
    expect(add.textContent).toBe("Nueva subtarea de «Contrato»");
  });

  it("→ on the parent's first cell opens, ← closes; ← on a subtask goes back to its parent", async () => {
    const { container } = renderAnalitico();
    const first = container.querySelector<HTMLElement>('[data-cell-row="t1"][data-cell-column="tarea"]')!;
    await act(async () => {
      first.focus();
    });
    await act(async () => {
      fireEvent.keyDown(first, { key: "ArrowRight" });
    });
    expect(nestedRows(container)).toHaveLength(2);
    // ↓ moves into the nested rows (one keyboard grid).
    await act(async () => {
      fireEvent.keyDown(first, { key: "ArrowDown" });
    });
    const child = container.querySelector<HTMLElement>('[data-cell-row="t1a"][data-cell-column="tarea"]')!;
    expect(document.activeElement).toBe(child);
    await act(async () => {
      fireEvent.keyDown(child, { key: "ArrowLeft" });
    });
    expect(document.activeElement).toBe(first);
    await act(async () => {
      fireEvent.keyDown(first, { key: "ArrowLeft" });
    });
    expect(nestedRows(container)).toHaveLength(0);
  });

  it("Expandir subtareas loads every parent's children in one batch and seeds their keys", async () => {
    children.batch.mockImplementationOnce(async () => ({ t1: SUBTASKS }));
    const { container, client } = renderAnalitico(false);
    const button = screen.getByRole("button", { name: SUBTASKS_EXPAND_ALL });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(children.batch).toHaveBeenCalledWith(["t1"]);
    expect(children.one).not.toHaveBeenCalled();
    expect(client.getQueryData(qk.tasks.children("t1"))).toEqual(SUBTASKS);
    expect(nestedRows(container)).toHaveLength(2);
    expect(screen.getByText("Subtareas abiertas de 1 tarea")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: SUBTASKS_COLLAPSE_ALL }));
    });
    expect(nestedRows(container)).toHaveLength(0);
  });

  it("a parent shown for its matching subtasks starts open with just those", async () => {
    const { container } = renderAnaliticoWithContext();
    await act(async () => {});
    expect(nestedRows(container).map((r) => r.dataset.rowId)).toEqual(["t1b"]);
  });
});

function renderAnaliticoWithContext() {
  const client = createTestQueryClient();
  const f = tareasListFiltersOf(DEFAULT_TAREAS_QUERY);
  seedAnalitico(client, f, ANALITICO_SUMMARY);
  client.setQueryData(qk.tasks.children("t1"), SUBTASKS);
  // The Presale group's first page: Contrato as the context of "Firma".
  for (const [key, data] of client.getQueriesData<{ pages: { rows: { id: string }[] }[] }>({ queryKey: ["tareas", "list"] })) {
    if (!data?.pages[0].rows.some((r) => r.id === "t1")) continue;
    client.setQueryData(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, rows: p.rows.map((r) => (r.id === "t1" ? { ...r, matchedSubtaskIds: ["t1b"] } : r)) })),
    });
  }
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasAnalitico
        query={DEFAULT_TAREAS_QUERY}
        facets={ANALITICO_FACETS}
        etapas={ANALITICO_ETAPAS}
        staff={[{ id: "s1", name: "Ana Ruiz" }]}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={vi.fn()}
        empty={{ title: "No hay tareas con estos filtros" }}
        canCreate
      />
    </StyleProvider>,
    { client },
  );
}
