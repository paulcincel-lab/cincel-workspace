// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CellEditorProps } from "@/components/widgets/CellEditor";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
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

// Refetches after a save stay in flight: the rows on screen are the optimistic ones.
vi.mock("@/lib/actions/page-data/tareas-actions", () => {
  const never = () => new Promise(() => {});
  return {
    getTareasPageData: vi.fn(never),
    getTareasFacets: vi.fn(never),
    getTareasSummary: vi.fn(never),
    getTareasListPage: vi.fn(never),
    getTareasBoard: vi.fn(never),
    getTareasBoardColumn: vi.fn(never),
  };
});

const actions = vi.hoisted(() => ({
  updateTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  assignTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/tasks-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/tasks-actions")>()),
  ...actions,
}));

const hoursActions = vi.hoisted(() => ({ setTaskEstimatedHoursAction: vi.fn() }));
vi.mock("@/lib/actions/calendario-actions", () => hoursActions);

vi.mock("./use-tareas-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-tareas-page")>()),
  useTareasPageReady: () => true,
}));
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }) }));

// A stand-in editor (the real one has its own tests): the lock reason, or one button per option.
vi.mock("@/components/widgets/CellEditor", () => ({
  CellEditor: (props: CellEditorProps<unknown>) => {
    if (!props.open) return null;
    const { edit } = props;
    const pick = (value: string | null) => {
      props.onCommitted?.(value);
      props.onOpenChange(false);
    };
    const options =
      edit.kind === "select" || edit.kind === "person"
        ? edit.options(props.row)
        : edit.kind === "text"
          ? [{ value: "Planos finales", label: "Guardar texto" }]
          : edit.kind === "number"
            ? [{ value: "2.5", label: "Guardar horas" }]
            : [{ value: "2026-11-12", label: "12 nov" }];
    return createPortal(
      <div role="dialog" aria-label={`Editor ${props.label ?? ""}`}>
        {props.canEdit === true ? (
          options.map((o) => (
            <button key={String(o.value)} type="button" onClick={() => pick(o.value)}>
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

import { LOCK_REASON } from "@/components/widgets/editable-cell";
import type { SessionAccess } from "@/lib/auth/session";
import { qk } from "@/lib/query/keys";
import { taskPhasesKey, tareasListFiltersOf, type TareasListPages } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { useSessionStore } from "@/lib/stores/session-store";
import { resetTareasUi } from "@/lib/stores/tareas-ui-store";
import { parseTareasQuery } from "@/lib/tareas/query";
import { tareasGroupFilters } from "@/lib/tareas/summary";
import type { TaskListRow } from "@/lib/types/core";

import { TareasAnalitico } from "./TareasAnalitico";
import { ANALITICO_FACETS, ANALITICO_SUMMARY, ANALITICO_ETAPAS, seedAnalitico } from "./fixtures/analitico-summary";
import { DISENO, PRESALE } from "./fixtures/lista-tasks";

const PLANOS_FASE = { id: "f-planos", name: "Planos ejecutivos", sortOrder: 1 };
const CONTRATO_FASE = { id: "f-contrato", name: "Contrato", sortOrder: 1 };

function signIn(access: "Administrador" | "Colaborador") {
  const user = { id: "s1", name: "Ana Ruiz", email: "ana@example.test", role: access, area: null, active: true, access };
  useSessionStore.setState({ access: { status: "active", user: { member: user, email: user.email, access } } as unknown as SessionAccess });
}

function renderAnalitico() {
  const query = parseTareasQuery(new URLSearchParams(""));
  const client = createTestQueryClient();
  const f = tareasListFiltersOf(query);
  seedAnalitico(client, f, ANALITICO_SUMMARY);
  // Planos (t3) sits in the Diseño fase "Planos ejecutivos".
  const disenoKey = qk.tareas.list(tareasGroupFilters(f, "p1", DISENO.key));
  client.setQueryData<TareasListPages>(disenoKey, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            rows: p.rows.map((r) => (r.id === "t3" ? { ...r, phaseId: PLANOS_FASE.id, phase: PLANOS_FASE } : r)),
          })),
        }
      : data,
  );
  client.setQueryData(qk.catalog.taskStatuses(), []);
  client.setQueryData(taskPhasesKey(DISENO.id), [PLANOS_FASE]);
  client.setQueryData(taskPhasesKey(PRESALE.id), [CONTRATO_FASE]);
  const view = renderWithQueryClient(
    <TareasAnalitico
      query={query}
      facets={ANALITICO_FACETS}
      etapas={ANALITICO_ETAPAS}
      staff={[
        { id: "s1", name: "Ana Ruiz" },
        { id: "s2", name: "Luis Pérez" },
      ]}
      actions={null}
      search=""
      onSearch={vi.fn()}
      onQuery={vi.fn()}
      empty={{ title: "No hay tareas con estos filtros" }}
      canCreate={false}
    />,
    { client },
  );
  // The first hover loads the editors' lists.
  fireEvent.pointerEnter(view.container.querySelector('[data-slot="tareas-analitico"]')!);
  return { ...view, client };
}

function cell(rowId: string, column: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cell-row="${rowId}"][data-cell-column="${column}"]`);
  if (!el) throw new Error(`cell ${rowId}/${column} not found`);
  return el;
}

/** The ids of the rows in one etapa group, by its toggle label. */
function groupRows(project: string, etapa: string): string[] {
  const region = screen.getByRole("region", { name: project });
  const toggle = within(region)
    .getAllByRole("button")
    .find((b) => b.hasAttribute("aria-expanded") && b.textContent?.startsWith(etapa));
  const body = document.getElementById(toggle?.getAttribute("aria-controls") ?? "");
  return [...(body?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])].map((r) => r.dataset.rowId ?? "");
}

const detail = (row: Partial<TaskListRow>) => ({ ok: true as const, data: row });

beforeEach(() => {
  nav.search = "";
  resetTareasUi();
  for (const fn of Object.values(actions)) fn.mockReset();
  hoursActions.setTaskEstimatedHoursAction.mockReset();
});

afterEach(() => {
  cleanup();
  useSessionStore.setState({ access: { status: "guest", user: null } as unknown as SessionAccess });
});

describe("TareasAnalitico editable cells", () => {
  it("shows Etapa and Fase columns and keeps Subtareas and Días de retraso calculated", () => {
    signIn("Administrador");
    renderAnalitico();
    expect(cell("t3", "etapa").textContent).toBe("Diseño");
    expect(cell("t3", "fase").textContent).toBe("Planos ejecutivos");
    expect(cell("t4", "fase").textContent).toBe("Sin fase");
    expect(cell("t3", "subtareas").dataset.cellState).toBe("inert");
    expect(cell("t3", "diasRetraso").dataset.cellState).toBe("inert");
    for (const column of ["tarea", "etapa", "fase", "responsable", "estatus", "vence", "prioridad"]) {
      expect(cell("t3", column).dataset.cellState).toBe("editable");
    }
  });

  it("Horas is hidden until Mostrar horas is on, then edits through the hours action", async () => {
    signIn("Administrador");
    hoursActions.setTaskEstimatedHoursAction.mockResolvedValue(detail({ id: "t3", estimatedHours: 2.5 }));
    renderAnalitico();
    expect(document.querySelector('[data-cell-column="horas"]')).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar horas" }));
    expect(cell("t3", "horas").dataset.cellState).toBe("editable");
    expect(cell("t3", "horas").textContent).toBe("—");
    fireEvent.click(cell("t3", "horas"));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar horas" }));
    await waitFor(() => expect(hoursActions.setTaskEstimatedHoursAction).toHaveBeenCalledWith("t3", 2.5));
    await waitFor(() => expect(cell("t3", "horas").textContent).toBe("2.5 h"));
  });

  it("admin moves a task to another etapa: the row regroups and the Fase editor opens next", async () => {
    signIn("Administrador");
    actions.updateTaskAction.mockResolvedValue(detail({ id: "t3", workflowId: PRESALE.id, phaseId: null }));
    renderAnalitico();
    expect(groupRows("Casa Lomas", "Diseño")).toEqual(["t3", "t4"]);

    fireEvent.click(cell("t3", "etapa"));
    const editor = screen.getByRole("dialog", { name: "Editor Etapa" });
    expect(within(editor).getAllByRole("button").map((b) => b.textContent)).toEqual(["Presale", "Diseño"]);
    await act(async () => {
      fireEvent.click(within(editor).getByRole("button", { name: "Presale" }));
    });

    expect(actions.updateTaskAction).toHaveBeenCalledWith("t3", { workflowId: PRESALE.id });
    await waitFor(() => expect(groupRows("Casa Lomas", "Presale")).toEqual(["t3", "t1", "t2"]));
    expect(groupRows("Casa Lomas", "Diseño")).toEqual(["t4"]);
    expect(cell("t3", "fase").textContent).toBe("Sin fase");
    // The fase was cleared: its editor opens with the new etapa's fases.
    const fase = await screen.findByRole("dialog", { name: "Editor Fase" });
    expect(within(fase).getAllByRole("button").map((b) => b.textContent)).toEqual(["Contrato"]);
  });

  it("rolls the row back when the save fails", async () => {
    signIn("Administrador");
    actions.updateTaskAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: task etapa change" });
    renderAnalitico();
    fireEvent.click(cell("t3", "etapa"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Presale" }));
    });
    await waitFor(() => expect(groupRows("Casa Lomas", "Diseño")).toEqual(["t3", "t4"]));
    expect(groupRows("Casa Lomas", "Presale")).toEqual(["t1", "t2"]);
    expect(cell("t3", "fase").textContent).toBe("Planos ejecutivos");
  });

  it("colaborador sees the Etapa and Responsable locks with their reasons", () => {
    signIn("Colaborador");
    renderAnalitico();
    expect(cell("t3", "etapa").dataset.cellState).toBe("locked");
    fireEvent.click(cell("t3", "etapa"));
    expect(screen.getByRole("dialog", { name: "Editor Etapa" }).textContent).toBe(LOCK_REASON.etapa);
    expect(cell("t3", "responsable").dataset.cellState).toBe("locked");
    expect(cell("t3", "estatus").dataset.cellState).toBe("editable");
    expect(cell("t3", "fase").dataset.cellState).toBe("editable");
  });

  it("saves Estatus, Responsable, Prioridad, Vence and the title through their actions", async () => {
    signIn("Administrador");
    actions.setTaskStatusAction.mockResolvedValue(detail({ id: "t4" }));
    actions.assignTaskAction.mockResolvedValue(detail({ id: "t4" }));
    actions.updateTaskAction.mockResolvedValue(detail({ id: "t4" }));
    renderAnalitico();

    const choose = async (column: string, label: string) => {
      fireEvent.click(cell("t4", column));
      await act(async () => {
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
      });
    };

    await choose("estatus", "Bloqueado");
    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t4", "bloqueado");
    expect(cell("t4", "estatus").textContent).toBe("Bloqueado");

    await choose("responsable", "Luis Pérez");
    expect(actions.assignTaskAction).toHaveBeenCalledWith("t4", "s2");
    expect(cell("t4", "responsable").textContent).toContain("Luis Pérez");

    await choose("prioridad", "Alta");
    expect(actions.updateTaskAction).toHaveBeenLastCalledWith("t4", { priority: "alta" });

    // Vence shows the commitment date, so that is the one it changes.
    await choose("vence", "12 nov");
    expect(actions.updateTaskAction).toHaveBeenLastCalledWith("t4", { commitmentDate: "2026-11-12" });

    await choose("tarea", "Guardar texto");
    expect(actions.updateTaskAction).toHaveBeenLastCalledWith("t4", { title: "Planos finales" });
    expect(cell("t4", "tarea").textContent).toContain("Planos finales");
  });

  it("keeps the open icon and ⌘/Ctrl-click to open the task", () => {
    signIn("Administrador");
    const pushState = vi.spyOn(window.history, "pushState");
    renderAnalitico();
    const links = within(cell("t3", "tarea")).getAllByRole("link");
    expect(links.every((a) => a.getAttribute("href") === "/tareas?tarea=t3")).toBe(true);
    fireEvent.click(cell("t3", "estatus"), { metaKey: true });
    expect(pushState).toHaveBeenCalledWith(null, "", "/tareas?tarea=t3");
    expect(screen.queryByRole("dialog")).toBeNull();
    pushState.mockRestore();
  });
});
