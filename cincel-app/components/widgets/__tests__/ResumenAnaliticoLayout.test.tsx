// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, number> = { presale: 1, diseno: 2, construccion: 3, decoracion: 4 };
  return {
    canSeeAdminData: () => true,
    listTramos: async () => [],
    tramoLabel: (key: string) => key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

const caps = vi.hoisted(() => ({ canCreateActivity: true, canChangeResponsible: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, ...caps }),
}));

const actions = vi.hoisted(() => ({
  getProyectoTareasData: vi.fn(),
  getProyectoAssigneeSuggestion: vi.fn(),
  createUserTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoTareasData: actions.getProyectoTareasData,
  getProyectoAssigneeSuggestion: actions.getProyectoAssigneeSuggestion,
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: actions.createUserTaskAction }));

// A deterministic stand-in for the quick-add parser: `@paul`, `viernes`, `!alta`.
vi.mock("@/lib/quick-add/parse", () => ({
  parseQuickAdd: (text: string) => {
    const tokens: { kind: string; status: string; raw: string }[] = [];
    const words = text.trim().split(/\s+/).filter(Boolean);
    const out: { title: string; assigneeId?: string; dueDate?: string; priority?: string; tokens: typeof tokens; slash: null } = {
      title: "",
      tokens,
      slash: null,
    };
    const rest: string[] = [];
    for (const word of words) {
      if (word === "@paul") {
        out.assigneeId = "s1";
        tokens.push({ kind: "person", status: "resolved", raw: word });
      } else if (word === "viernes") {
        out.dueDate = "2026-11-13";
        tokens.push({ kind: "date", status: "resolved", raw: word });
      } else if (word === "!alta") {
        out.priority = "alta";
        tokens.push({ kind: "priority", status: "resolved", raw: word });
      } else rest.push(word);
    }
    out.title = rest.join(" ");
    return out;
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { ResumenAnaliticoLayout, NO_SCHEDULE_TEXT } from "@/components/widgets/ResumenAnaliticoLayout";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { TASK_ROWS, fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  caps.canCreateActivity = true;
  caps.canChangeResponsible = true;
  actions.createUserTaskAction.mockResolvedValue({ ok: true, data: { id: "nueva", title: "Revisar plafones" } });
  actions.getProyectoAssigneeSuggestion.mockResolvedValue({
    staffId: "s3",
    name: "Ana López",
    loadPct: 40,
    phaseName: "Obra negra",
    projectName: "Casa Roble",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLayout(input: ProjectSummaryInput = fixtureSummaryInput()) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.tab(input.project.id, "tareas"), { tasks: TASK_ROWS, includeAdmin: true });
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <ResumenAnaliticoLayout data={input} />
    </StyleProvider>,
    { client },
  );
}

function quickAdd(tramo = "Construcción") {
  return screen.getByLabelText(`Nueva tarea en ${tramo}`) as HTMLInputElement;
}

describe("ResumenAnaliticoLayout", () => {
  it("renders KPI strip, nav and three sections", () => {
    renderLayout();
    expect(screen.getAllByText("Avance").length).toBeGreaterThan(0);
    expect(screen.getByText("Tareas abiertas")).toBeTruthy();
    expect(screen.getByText("Retraso promedio")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    for (const name of ["Tramos y fases", "Avance vs plan", "Carga del equipo"]) {
      expect(within(nav).getByRole("link", { name })).toBeTruthy();
    }
    expect(within(nav).getByRole("link", { name: /^Tareas/ }).getAttribute("href")).toBe("#s-tareas");
    for (const heading of ["Tramos y fases", "Avance contra plan", "Carga del equipo", "Tareas por tramo"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }
    expect(document.getElementById("s-tramos")).toBeTruthy();
    expect(document.getElementById("s-avance")).toBeTruthy();
    expect(document.getElementById("s-equipo")).toBeTruthy();
    expect(document.getElementById("s-tareas")).toBeTruthy();
    expect(actions.getProyectoTareasData).not.toHaveBeenCalled();
  });

  it("an Ir a anchor focuses its section heading", () => {
    renderLayout();
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    fireEvent.click(within(nav).getByRole("link", { name: "Carga del equipo" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Carga del equipo" }));
  });

  it("quick-add composer shows DETECTADO chips", () => {
    renderLayout();
    fireEvent.change(quickAdd(), { target: { value: "Revisar plafones @paul viernes !alta" } });
    expect(screen.getByText("Detectado")).toBeTruthy();
    const row = quickAdd().closest("td")!;
    expect(row.querySelector('[data-chip="fase"]')?.textContent).toContain("Construcción › Obra negra");
    expect(row.querySelector('[data-chip="persona"]')?.textContent).toBe("Paul Langarica");
    expect(row.querySelector('[data-chip="fecha"]')?.textContent).toBe("Vence 13 nov");
    expect(row.querySelector('[data-chip="prioridad"]')?.textContent).toBe("Prioridad alta");
    expect(within(row).getByText("↵ crear")).toBeTruthy();
  });

  it("Tab accepts Asignar a", async () => {
    renderLayout();
    const input = quickAdd();
    fireEvent.change(input, { target: { value: "Revisar plafones @paul" } });
    const hint = await screen.findByRole("status", {}, { timeout: 2000 });
    expect(hint.textContent).toContain("Asistente:");
    expect(hint.textContent).toContain("Paul Langarica está al 92 %");
    expect(hint.textContent).toContain("Ana López tiene 40 % de carga y ya trabajó Obra negra en Casa Roble.");
    expect(within(hint).getByRole("button", { name: /Asignar a Ana/ })).toBeTruthy();
    expect(within(hint).getByRole("button", { name: "Mantener a Paul" })).toBeTruthy();
    expect(actions.getProyectoAssigneeSuggestion).toHaveBeenCalledWith({ id: "p1", phaseId: "f-obra-negra", staffId: "s1" });

    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(input.closest("td")!.querySelector('[data-chip="persona"]')?.textContent).toBe("Ana López");

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => expect(actions.createUserTaskAction).toHaveBeenCalled());
    expect(actions.createUserTaskAction.mock.calls[0]![0]).toMatchObject({
      projectId: "p1",
      title: "Revisar plafones",
      workflowId: "w-construccion",
      phaseId: "f-obra-negra",
      managerId: "s3",
      priority: "media",
    });
  });

  it("Mantener keeps the responsable and Shift+Tab moves to it", async () => {
    renderLayout();
    const input = quickAdd();
    fireEvent.change(input, { target: { value: "Revisar @paul" } });
    const hint = await screen.findByRole("status", {}, { timeout: 2000 });
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    const keep = within(hint).getByRole("button", { name: "Mantener a Paul" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(screen.queryByRole("status")).toBeNull();
    expect(input.closest("td")!.querySelector('[data-chip="persona"]')?.textContent).toBe("Paul Langarica");
  });

  it("Esc closes the composer", () => {
    renderLayout();
    const input = quickAdd();
    fireEvent.change(input, { target: { value: "Revisar" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(screen.queryByText("Detectado")).toBeNull();
  });

  it("no schedule message", () => {
    renderLayout(fixtureSummaryInput({ schedule: null }));
    expect(screen.getByText(NO_SCHEDULE_TEXT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a Cronograma" }).getAttribute("href")).toBe("/proyectos/p1/cronograma");
    expect(screen.queryByRole("img", { name: /Avance real/ })).toBeNull();
  });

  it("draws the S-curve with its text alternative", () => {
    renderLayout();
    expect(screen.getByRole("img", { name: /^Avance real 82 % contra plan 85 % al 6 de noviembre/ })).toBeTruthy();
  });

  it("budget hidden for non-admins", () => {
    const { unmount } = renderLayout();
    expect(screen.getByText("Presup. ejercido")).toBeTruthy();
    unmount();
    renderLayout(fixtureSummaryInput({ showBudget: false, portfolio: { ...fixtureSummaryInput().portfolio!, budgetSpentPct: null } }));
    expect(screen.queryByText("Presup. ejercido")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("hides the quick-add without canCreateActivity", () => {
    caps.canCreateActivity = false;
    renderLayout();
    expect(screen.queryByLabelText("Nueva tarea en Construcción")).toBeNull();
  });
});
