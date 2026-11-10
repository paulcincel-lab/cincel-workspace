// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
// The sheet reads the task, its catalogs and "Datos de monday" through queries.
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("estilo=visual&tarea=t-1"),
}));

vi.mock("@/components/patterns/FormSheet", async () => {
  const { FormSheetDouble } = await import("./task-sheet.fixtures");
  return { FormSheet: FormSheetDouble };
});

// The sheet reads the seeded query cache; `t-admin` loads as null (not visible to the viewer).
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTaskSheetData: vi.fn(async () => null),
  searchProjectTasksAction: vi.fn(async () => []),
  getTareasCalendarData: vi.fn(),
  getTareasStartSlotData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: vi.fn(async () => []),
  fetchCatalogWorkflows: vi.fn(async () => []),
  fetchCatalogTaskStatuses: vi.fn(async () => []),
  fetchCatalogStaff: vi.fn(async () => []),
  fetchCatalogAssignableStaff: vi.fn(async () => []),
  fetchCatalogProjectSpaces: vi.fn(async () => []),
  fetchCatalogContacts: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  updateTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  assignTaskAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  addTaskAttachmentAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
  updateChecklistItemAction: vi.fn(),
  removeChecklistItemAction: vi.fn(),
  reorderChecklistAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  listSubtasksAction: vi.fn(async () => []),
  listTaskDependenciesAction: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
  addTaskDependencyAction: vi.fn(),
  removeTaskDependencyAction: vi.fn(),
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowAction: vi.fn(async () => null) }));
vi.mock("@/lib/actions/tramo-start-actions", () => ({ previewStartTramoAction: vi.fn() }));
vi.mock("@/lib/actions/import-actions", () => ({ getImportDataAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveActivitiesCapabilities: () => ({
      canViewActivities: true,
      canCreateActivity: true,
      canChangeResponsible: true,
      canDeleteActivity: false,
      canReorderPhases: false,
      canExportData: false,
      statusScope: "all",
    }),
  };
});

import { qk } from "@/lib/query/keys";
import { seedTaskSheet } from "@/lib/query/options/tareas";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

import { TaskSheet } from "./TaskSheet";
import { SPACES, makeSheetData } from "./task-sheet.fixtures";
import { seedSessionUser } from "@/tests/helpers/session-user";
import { settle } from "@/tests/helpers/settle";

// The components read the signed-in user from the session store.
beforeEach(() => seedSessionUser({ member: { id: "s-1", name: "Ana López" } }));

/** The sheet's one call already answered: the task, its catalogs (with espacios), no subtareas or dependencies. */
/** The last rendered sheet's client, so `seriousViolations` can wait for its fetches. */
let lastClient: ReturnType<typeof createTestQueryClient> | undefined;

function render(ui: React.ReactElement) {
  const client = createTestQueryClient();
  lastClient = client;
  const data = makeSheetData(undefined, { spaces: SPACES });
  seedTaskSheet(client, data);
  client.setQueryData(qk.tasks.detail(data.task.id), data.task);
  client.setQueryData(qk.tasks.subtasks(data.task.id), []);
  client.setQueryData(qk.tasks.dependencies(data.task.id), { dependsOn: [], blocks: [] });
  return renderWithQueryClient(ui, { client });
}

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

/** Token pairs the sheet paints: text and muted labels on the sheet, the primary button, errors, focus ring. */
const TASK_SHEET_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "destructive/background",
  "ring/background",
]);

/** Mount one theme the way the app does: a `<style id="appearance">` block plus `data-theme` / `.dark` on `<html>`. */
function applyTheme(theme: ThemeId, mode: Mode) {
  const tokens = THEME_PRESETS[theme].tokens;
  const body = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${body}}`;
  document.head.appendChild(style);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
}

async function seriousViolations() {
  // Let the queries and Base UI finish their pending updates so axe audits the settled sheet.
  await settle(lastClient);
  const results = await axe.run(
    {
      include: [document.body],
      // Base UI's focus guards are aria-hidden on purpose: they only bounce Tab back into the trapped sheet.
      // A focused Select mounts its closed list inside a `hidden` positioner; happy-dom has no UA
      // `[hidden] { display: none }` rule, so axe would audit what the browser never shows.
      exclude: [["[data-base-ui-focus-guard]"], ["[hidden]"]],
    },
    // Color contrast needs real layout/rendering, which happy-dom doesn't provide; the token pairs are checked below.
    { rules: { "color-contrast": { enabled: false } } },
  );
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("TaskSheet accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      describe(`${theme} · ${mode}`, () => {
        it("has no serious or critical axe violations with the task loaded", async () => {
          applyTheme(theme, mode);
          render(<TaskSheet taskId="t-1" onClose={() => undefined} />);
          await screen.findByDisplayValue("Planos de conjunto");
          await screen.findByRole("combobox", { name: "Espacio" });
          expect(await seriousViolations()).toEqual([]);
        });

        it("has no serious or critical axe violations with the mention list open", async () => {
          applyTheme(theme, mode);
          render(<TaskSheet taskId="t-1" onClose={() => undefined} />);
          await screen.findByDisplayValue("Planos de conjunto");
          await screen.findByRole("combobox", { name: "Espacio" });
          fireEvent.change(screen.getByLabelText("Comentario"), { target: { value: "@a" } });
          await screen.findByRole("listbox", { name: "Mencionar a" });
          expect(await seriousViolations()).toEqual([]);
        });

        it("has no serious or critical axe violations in the not-found state", async () => {
          applyTheme(theme, mode);
          render(<TaskSheet taskId="t-admin" onClose={() => undefined} />);
          await screen.findByText(/No encontramos esta tarea/);
          expect(await seriousViolations()).toEqual([]);
        });

        it("the token pairs the sheet uses meet their contrast minimum", () => {
          const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => TASK_SHEET_PAIRS.has(r.pair));
          const expected = CONTRAST_PAIRS.filter((p) => TASK_SHEET_PAIRS.has(p.pair)).length;
          expect(results).toHaveLength(expected);
          expect(results.filter((r) => !r.ok)).toEqual([]);
        });
      });
    }
  }
});
