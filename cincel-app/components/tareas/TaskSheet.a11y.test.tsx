// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=tablero&tarea=t-1"),
}));

vi.mock("@/components/patterns/FormSheet", async () => {
  const { FormSheetDouble } = await import("./task-sheet.fixtures");
  return { FormSheet: FormSheetDouble };
});

vi.mock("@/lib/actions/tasks-actions", async () => {
  const { makeTask } = await import("./task-sheet.fixtures");
  return {
    fetchTaskAction: vi.fn(async (id: string) => (id === "t-admin" ? null : makeTask())),
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
    fetchTasksAction: vi.fn(async () => []),
  };
});
vi.mock("@/lib/actions/task-statuses-actions", () => ({ fetchTaskStatusesAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/workflows-actions", async () => {
  const { makeWorkflow } = await import("./task-sheet.fixtures");
  return { fetchWorkflowsAction: vi.fn(async () => [makeWorkflow()]) };
});
vi.mock("@/lib/actions/staff-actions", async () => {
  const { STAFF } = await import("./task-sheet.fixtures");
  return { fetchAssignableStaffAction: vi.fn(async () => STAFF) };
});
vi.mock("@/lib/actions/projects-actions", async () => {
  const { SPACES } = await import("./task-sheet.fixtures");
  return { fetchProjectSpacesAction: vi.fn(async () => SPACES) };
});
vi.mock("@/lib/actions/import-actions", () => ({ getImportDataAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s-1", name: "Ana López" } }),
}));
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

import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

import { TaskSheet } from "./TaskSheet";

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
  const results = await axe.run(
    {
      include: [document.body],
      // Base UI's focus guards are aria-hidden on purpose: they only bounce Tab back into the trapped sheet.
      exclude: [["[data-base-ui-focus-guard]"]],
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
