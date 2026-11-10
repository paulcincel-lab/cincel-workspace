// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import type { TaskListRow } from "@/lib/types/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(""),
}));
const actions = vi.hoisted(() => ({
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/actions/tasks-actions", () => actions);
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
  getTareasTrend: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(() => Promise.resolve({})),
  fetchMyPreferencesAction: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The quick-add line has its own axe tests (#984); here it is a labelled input.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context }: { context: { label: string } }) => <input aria-label={`Nueva tarea en ${context.label}`} />,
}));
vi.mock("@/components/tareas/quick-add-create", () => ({
  useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TareasVisual } from "@/components/tareas/TareasVisual";
import { getTareasTrend } from "@/lib/actions/page-data/tareas-actions";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { emptyBoardColumns, type TareasBoardData, type TareasFacets, type TareasTrend } from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { THEME_IDS } from "@/lib/ui/themes";
import { seedSessionUser } from "@/tests/helpers/session-user";

const MODES = ["light", "dark"] as const;

function makeTask(overrides: Partial<TaskListRow>): TaskListRow {
  return {
    id: "t1",
    projectId: "p1",
    kind: "usuario",
    templateId: null,
    workflowId: "w1",
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    createdById: "s1",
    managerId: "s1",
    status: "pendiente",
    customStatusId: null,
    priority: "alta",
    sortOrder: null,
    commitmentDate: "2026-01-15",
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Oficina Polanco", clientName: null },
    workflow: { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
    phase: null,
    space: null,
    manager: { id: "s1", name: "Ana Ruiz" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 5,
    subtaskDoneCount: 2,
    waitingOn: 0,
    subtaskDone: 2,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
    ...overrides,
  } as TaskListRow;
}

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY };
const F = tareasListFiltersOf(QUERY);

function boardData(): TareasBoardData {
  const columns = emptyBoardColumns([]);
  columns.pendiente = { rows: [makeTask({ id: "t1", title: "Cotización de cancelería" })], total: 1, nextCursor: null };
  columns.en_proceso = { rows: [makeTask({ id: "t2", title: "Render sala", status: "en_proceso" })], total: 1, nextCursor: null };
  columns.bloqueado = {
    rows: [makeTask({ id: "t3", title: "Permiso de obra", status: "bloqueado", waitingOn: 3 })],
    total: 1,
    nextCursor: null,
  };
  columns.completado = { rows: [makeTask({ id: "t4", title: "Levantamiento", status: "completado" })], total: 1, nextCursor: null };
  return { columns, statuses: [] };
}

const TREND: TareasTrend = {
  kpis: [
    { key: "abiertas", label: "Abiertas", value: 3, series7: [1, 2, 2, 3, 3, 3, 3], delta: { value: 1, good: false, caption: "esta semana" } },
    { key: "vencidas", label: "Vencidas", value: 1, series7: [0, 0, 1, 1, 1, 1, 1], delta: { value: 1, good: false, caption: "desde el lunes" } },
    { key: "en_proceso", label: "En proceso", value: 1, series7: [1, 1, 1, 1, 1, 1, 1] },
    { key: "completadas", label: "Completadas", value: 1, series7: [0, 0, 0, 1, 0, 0, 0], delta: { value: 1, good: true, caption: "vs. semana pasada" } },
  ],
  activeAssignees: 1,
  week: {
    from: "2026-11-09",
    to: "2026-11-15",
    total: 2,
    days: ["09", "10", "11", "12", "13", "14", "15"].map((d, i) => ({
      date: `2026-11-${d}`,
      due: i === 2 ? 2 : 0,
      tramoKey: i === 2 ? "presale" : null,
    })),
  },
};

const FACETS: TareasFacets = {
  total: 4,
  byTramo: { presale: 4 },
  projects: [],
  mostrar: { todas: 4, abiertas: 3, en_retraso: 1 },
  mine: 4,
};

function seededClient() {
  const client = createTestQueryClient();
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, "visual")), {
    facets: FACETS,
    tramos: [{ id: "w1", key: "presale", name: "Presale", sortOrder: 1 }],
    staff: [],
  });
  client.setQueryData(qk.tareas.board(F), boardData());
  client.setQueryData(qk.tareas.trend(F), TREND);
  return client;
}

function renderVisual() {
  return renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <TareasVisual
        query={QUERY}
        facets={FACETS}
        tramos={[{ id: "w1", key: "presale", name: "Presale", sortOrder: 1 }]}
        actions={<button type="button">Nueva tarea</button>}
        search=""
        onSearch={vi.fn()}
        onQuery={vi.fn()}
        empty={{ title: "No hay tareas con estos filtros" }}
      />
    </StyleProvider>,
    { client: seededClient() },
  );
}

function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", themeId);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and CSS, which happy-dom doesn't provide;
  // the token pairs are covered by the presets contrast test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

beforeEach(() => {
  seedSessionUser({ member: { id: "s1", name: "Ana Ruiz" }, access: "Administrador" });
  // A move invalidates the tareas queries; the trend refetch gets the same trend back.
  vi.mocked(getTareasTrend).mockResolvedValue(TREND);
  actions.setTaskStatusAction
    .mockReset()
    .mockImplementation(async (id: string, status: string) => ({ ok: true, data: { id, projectId: "p1", status } }));
});

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("Tareas · Visual accessibility", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`axe clean light and dark · ${themeId} ${mode}`, async () => {
        applyTheme(themeId, mode);
        const { container } = renderVisual();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("Mover a… keyboard flow announces the move", async () => {
    renderVisual();
    const trigger = screen.getByRole("button", { name: "Mover a… Cotización de cancelería" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const option = await screen.findByRole("menuitem", { name: "En proceso" });
    await act(async () => {
      fireEvent.click(option);
    });

    expect(actions.setTaskStatusAction).toHaveBeenCalledWith("t1", "en_proceso");
    await waitFor(() => expect(screen.getByTestId("board-announcement").textContent).toBe("Movida a En proceso"));
    expect(screen.getByTestId("board-announcement").getAttribute("aria-live")).toBe("polite");
  });
});
