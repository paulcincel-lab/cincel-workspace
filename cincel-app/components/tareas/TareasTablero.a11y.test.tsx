// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";

import type { TaskListRow } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("estilo=visual"),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  setTaskStatusAction: vi.fn(() => Promise.resolve({})),
  setTaskCustomStatusAction: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(() => Promise.resolve({})),
  fetchMyPreferencesAction: vi.fn(() => Promise.resolve(null)),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TareasTablero } from "@/components/tareas/TareasTablero";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { emptyBoardColumns, type TareasBoardData } from "@/lib/tareas/page-data";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS } from "@/lib/ui/themes";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Text / background pairs the view draws: cards on `card`, columns on `muted`, overdue dates in `destructive`. */
const TABLERO_PAIRS = ["foreground/card", "muted-foreground/card", "destructive/card"];

function makeTask(overrides: Partial<TaskListRow>): TaskListRow {
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
    createdById: "s1",
    managerId: "s1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: "2026-01-15",
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
    subtaskCount: 2,
    subtaskDoneCount: 1,
    waitingOn: 0,
    subtaskDone: 1,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
    ...overrides,
  } as TaskListRow;
}

const QUERY: TareasQuery = { ...DEFAULT_TAREAS_QUERY };

function boardData(): TareasBoardData {
  const columns = emptyBoardColumns([]);
  columns.pendiente = {
    rows: [makeTask({ id: "t1", title: "Levantamiento" }), makeTask({ id: "t2", title: "Planos", commitmentDate: "2030-01-01" })],
    total: 2,
    nextCursor: null,
  };
  columns.en_proceso = { rows: [makeTask({ id: "t3", title: "Render", status: "en_proceso" })], total: 1, nextCursor: null };
  columns.completado = { rows: [makeTask({ id: "t4", title: "Contrato", status: "completado" })], total: 1, nextCursor: null };
  return { columns, statuses: [] };
}

/** The cache `/tareas` hydrates for the Tablero. */
function seededClient() {
  const client = createTestQueryClient();
  // The bundle is keyed by the style; seed it for every one the tests render.
  const page = {
    facets: { total: 4, byTramo: {}, projects: [] },
    tramos: [],
    staff: [],
  };
  for (const estilo of ["visual", "esencial", "analitico"] as const) {
    client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(QUERY, estilo)), page);
  }
  client.setQueryData(qk.tareas.board(tareasListFiltersOf(QUERY)), boardData());
  return client;
}

function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", themeId);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and CSS, which happy-dom doesn't provide;
  // the pairs are covered by CONTRAST_PAIRS below and the presets contrast test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("Tareas · Tablero accessibility", () => {
  it("only uses color pairs the contrast checker covers", () => {
    const covered = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of TABLERO_PAIRS) expect(covered.has(pair), pair).toBe(true);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations · ${themeId} ${mode} ${style}`, async () => {
          applyTheme(themeId, mode);
          const { container } = renderWithQueryClient(
            <StyleProvider style={style} scope="staff">
              <TareasTablero query={QUERY} header={{ title: "Tareas" }} />
            </StyleProvider>,
            { client: seededClient() },
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }
});
