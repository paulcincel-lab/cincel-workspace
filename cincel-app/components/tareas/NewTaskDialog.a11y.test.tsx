// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";

import { PROJECTS, STAFF, WORKFLOWS } from "./new-task-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("nueva=1"),
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectsAction: vi.fn(() => Promise.resolve(PROJECTS)) }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn(() => Promise.resolve(WORKFLOWS)) }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchAssignableStaffAction: vi.fn(() => Promise.resolve(STAFF)) }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  createUserTaskAction: vi.fn(() => Promise.reject(new Error("FORBIDDEN"))),
  createSubtaskAction: vi.fn(() => Promise.resolve({})),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// A labelled dialog shell standing in for the shared `FormDialog` pattern, so
// axe checks this form's own fields, labels and error wiring.
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (props: {
    title: string;
    description?: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    pending?: boolean;
    error?: string | null;
    children: ReactNode;
  }) =>
    props.open ? (
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-desc">
        <h2 id="dlg-title">{props.title}</h2>
        <p id="dlg-desc">{props.description}</p>
        {props.children}
        {props.error ? <div role="alert">{props.error}</div> : null}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" disabled={props.pending} onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { NewTaskDialog } from "./NewTaskDialog";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

/** Text / background pairs the dialog draws: fields and hints on `card`, errors in `destructive`, the primary submit. */
const DIALOG_PAIRS = [
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "primary-foreground/primary",
  "border-strong/card",
];

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

async function renderReady() {
  const view = render(<NewTaskDialog open onOpenChange={vi.fn()} />);
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
  await screen.findByRole("combobox", { name: "Fase" });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("NewTaskDialog accessibility", () => {
  it("only uses color pairs the contrast checker covers", () => {
    const covered = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of DIALOG_PAIRS) expect(covered.has(pair), pair).toBe(true);
  });

  it("names every field and groups the priority radios", async () => {
    await renderReady();
    for (const name of ["Proyecto", "Tramo", "Fase", "Responsable"]) {
      expect(screen.getByRole("combobox", { name })).toBeTruthy();
    }
    expect(screen.getByRole("textbox", { name: "Título" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Descripción" })).toBeTruthy();
    expect(screen.getByLabelText("Fecha de entrega")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Prioridad" })).toBeTruthy();
    expect(screen.getAllByRole("radio").length).toBe(3);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations · ${themeId} ${mode}`, async () => {
        applyTheme(themeId, mode);
        const { container } = await renderReady();
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`has no serious or critical axe violations with errors shown · ${themeId} ${mode}`, async () => {
        applyTheme(themeId, mode);
        const { container } = await renderReady();
        fireEvent.click(screen.getByRole("button", { name: "Agregar subtarea" }));
        fireEvent.click(screen.getByRole("button", { name: "Crear tarea" }));
        await screen.findByText("Escribe un nombre.");
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
