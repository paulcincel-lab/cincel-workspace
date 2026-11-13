// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

const actions = vi.hoisted(() => ({
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchWorkflowsAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogProjectOptions: actions.fetchCatalogProjectOptions,
  fetchCatalogAssignableStaff: actions.fetchCatalogAssignableStaff,
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: actions.fetchWorkflowsAction }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  deleteTaskAction: actions.deleteTaskAction,
  createUserTaskAction: actions.createUserTaskAction,
  createSubtaskAction: actions.createSubtaskAction,
  setTaskStatusAction: actions.setTaskStatusAction,
  setTaskCustomStatusAction: actions.setTaskCustomStatusAction,
}));
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => GENERAL_SETTINGS_DEFAULTS };
});
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

import { WORKFLOWS } from "@/components/tareas/new-task-fixtures";
import { newTaskWorkflowsKey } from "@/components/tareas/quick-add-create";
import { QuickAddRow, type QuickAddContext, type QuickAddCreated, type QuickAddRowProps } from "@/components/widgets/QuickAddRow";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetAssistantUi, useAssistantUi } from "@/lib/stores/assistant-ui-store";
import { resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";
import { resetQuickAddRecent, useQuickAddRecent } from "@/lib/stores/quick-add-store";
import type { CatalogAssignableStaffOption, CatalogProjectOption } from "@/lib/types/catalog";

const STAFF: CatalogAssignableStaffOption[] = [
  { id: "p-ana", name: "Ana Ruiz", suggested: true, openCount: 3, overdueCount: 0 },
  { id: "p-luis", name: "Luis Pérez", suggested: true, openCount: 6, overdueCount: 2 },
  { id: "p-luisa", name: "Luisa Gómez", suggested: true, openCount: 1, overdueCount: 0 },
  { id: "p-jorge", name: "Jorge Mena", suggested: false },
];

const PROJECTS: CatalogProjectOption[] = [
  { id: "p-roble", name: "Casa Roble", status: "activo", currentWorkflowId: "w-diseno" },
];

const CONTEXT: QuickAddContext = { label: "Diseño", projectId: "p-roble", etapaId: "w-diseno", assigneeId: null };

function seededClient(): QueryClient {
  const client = createTestQueryClient();
  client.setQueryData(newTaskWorkflowsKey(), WORKFLOWS);
  client.setQueryData(qk.catalog.assignableStaff("w-diseno"), STAFF);
  client.setQueryData(qk.catalog.projectOptions(), PROJECTS);
  return client;
}

function renderRow(props: Partial<QuickAddRowProps> = {}) {
  const onCreate = props.onCreate ?? vi.fn(async (): Promise<QuickAddCreated> => ({ id: "t-1", title: "Creada" }));
  const variant = props.variant ?? "row";
  const ui = <QuickAddRow context={CONTEXT} variant={variant} colSpan={4} {...props} onCreate={onCreate} />;
  const result = renderWithQueryClient(
    variant === "row" ? (
      <table>
        <tbody>{ui}</tbody>
      </table>
    ) : (
      ui
    ),
    { client: seededClient() },
  );
  const context = props.context ?? CONTEXT;
  const input = screen.getByRole("textbox", { name: `Nueva tarea en ${context.label}` }) as HTMLInputElement;
  act(() => input.focus());
  fireEvent.focus(input);
  return { ...result, input, onCreate };
}

function typeInto(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

const hint = () => document.querySelector('[data-slot="quick-add-hint"]')?.textContent ?? "";

beforeEach(() => {
  // Monday 2026-11-09, 12:00 in Mexico City.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
  actions.fetchWorkflowsAction.mockResolvedValue(WORKFLOWS);
  actions.fetchCatalogAssignableStaff.mockResolvedValue(STAFF);
  actions.fetchCatalogProjectOptions.mockResolvedValue(PROJECTS);
  actions.deleteTaskAction.mockResolvedValue({ ok: true, data: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  resetAssistantUi();
  resetNewTaskUi();
  resetQuickAddRecent();
});

describe("QuickAddRow", () => {
  it("Enter creates with the parsed draft and clears", async () => {
    const { input, onCreate } = renderRow({ context: { ...CONTEXT, status: "pendiente" } });
    typeInto(input, "Revisar plafones @ana viernes !alta");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith({
      title: "Revisar plafones",
      projectId: "p-roble",
      etapaId: "w-diseno",
      assigneeId: "p-ana",
      dueDate: "2026-11-13",
      priority: "alta",
      status: "pendiente",
    });
    expect(input.value).toBe("");
    await waitFor(() => expect(screen.getByText("Creada: Creada")).toBeTruthy());
  });

  it("Enter ignored with empty title", () => {
    const { input, onCreate } = renderRow();
    typeInto(input, "   ");
    fireEvent.keyDown(input, { key: "Enter" });
    typeInto(input, "@ana viernes");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).not.toHaveBeenCalled();
    expect(input.value).toBe("@ana viernes");
  });

  it("Enter blocked while ambiguous", () => {
    const { input, onCreate } = renderRow();
    typeInto(input, "@lu revisar cotización");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).not.toHaveBeenCalled();
    expect(hint()).toContain("¿Quién? Luis Pérez o Luisa Gómez.");
    expect(screen.getByRole("button", { name: /Elegir Luis Pérez/ })).toBeTruthy();
  });

  it("Tab accepts the suggestion", () => {
    const { input } = renderRow();
    typeInto(input, "@lu revisar");
    const notPrevented = fireEvent.keyDown(input, { key: "Tab" });
    expect(notPrevented).toBe(false);
    expect(input.value).toBe("@luis revisar");
  });

  it("suggests the least-loaded person of the etapa when nobody is set", () => {
    const { input } = renderRow({ context: { label: "Diseño", projectId: "p-roble", etapaId: "w-diseno" } });
    typeInto(input, "Revisar planos");
    expect(hint()).toContain("Luisa Gómez tiene 1 abierta en");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("Revisar planos @luisa");
  });

  it("suggests a lighter person when the assignee has overdue tasks", () => {
    const { input } = renderRow();
    typeInto(input, "Revisar @perez viernes");
    expect(hint()).toContain("Luis Pérez ya tiene 6 abiertas");
    expect(hint()).toContain("2 vencidas");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("Revisar @luisa viernes");
  });

  it("suggests a Friday without a date", () => {
    const { input } = renderRow();
    typeInto(input, "Revisar @ana");
    expect(hint()).toContain("Sin fecha. ¿Vence el viernes 13 nov?");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.value).toBe("Revisar @ana viernes");
  });

  it("Tab moves focus without a suggestion", () => {
    const { input } = renderRow();
    typeInto(input, "Revisar @ana viernes");
    expect(hint()).toContain("Lista para crear: Ana Ruiz · vence 13 nov. Enter para crear.");
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(true);
    expect(input.value).toBe("Revisar @ana viernes");
  });

  it("Esc clears, Esc on empty blurs", () => {
    const { input } = renderRow();
    typeInto(input, "Revisar");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).not.toBe(input);
  });

  it("slash opens the Asistente with the query", () => {
    const { input, onCreate } = renderRow();
    typeInto(input, "/ cerrar la etapa de Diseño");
    expect(hint()).toContain("Pedir al asistente: “cerrar la etapa de Diseño”");
    fireEvent.keyDown(input, { key: "Enter" });
    const state = useAssistantUi.getState();
    expect(state.open).toBe(true);
    expect(state.pendingPrompt?.text).toBe("cerrar la etapa de Diseño");
    expect(state.contextOverride).toEqual({ projectId: "p-roble" });
    expect(onCreate).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("pending row then row-new on success", async () => {
    let resolve!: (created: QuickAddCreated) => void;
    const onCreate = vi.fn(() => new Promise<QuickAddCreated>((r) => (resolve = r)));
    const { input } = renderRow({ onCreate });
    typeInto(input, "Medir cocina");
    fireEvent.keyDown(input, { key: "Enter" });
    const pending = document.querySelector('[data-slot="quick-add-pending"]');
    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(pending?.textContent).toContain("Medir cocina");
    await act(async () => resolve({ id: "t-9", title: "Medir cocina" }));
    expect(document.querySelector('[data-slot="quick-add-pending"]')).toBeNull();
    expect(useQuickAddRecent.getState().isNew("t-9")).toBe(true);
    expect(screen.getByText("Creada: Medir cocina")).toBeTruthy();
  });

  it("error restores the text", async () => {
    const onCreate = vi.fn(() => Promise.reject(new Error("INVALID")));
    const { input } = renderRow({ onCreate });
    typeInto(input, "Medir cocina mañana");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(input.value).toBe("Medir cocina mañana"));
    expect(document.querySelector('[data-slot="quick-add-pending"]')).toBeNull();
  });

  it("Deshacer calls deleteTaskAction", async () => {
    const { input } = renderRow({ onCreate: vi.fn(async () => ({ id: "t-1", title: "Medir cocina" })) });
    typeInto(input, "Medir cocina");
    fireEvent.keyDown(input, { key: "Enter" });
    const undo = await screen.findByRole("button", { name: "Deshacer" });
    fireEvent.click(undo);
    await waitFor(() => expect(actions.deleteTaskAction).toHaveBeenCalledWith("t-1"));
    await waitFor(() => expect(screen.queryByText("Creada: Medir cocina")).toBeNull());
  });

  it("no project opens the dialog with defaults", () => {
    const { input, onCreate } = renderRow({ context: { label: "Mi espacio", projectId: null, assigneeId: "p-ana" } });
    typeInto(input, "Revisar #diseño viernes !alta");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).not.toHaveBeenCalled();
    expect(useNewTaskUi.getState()).toMatchObject({
      open: true,
      source: "quick-add",
      defaults: { title: "Revisar", etapaKey: "diseno", managerId: "p-ana", deliveryDate: "2026-11-13", priority: "alta" },
    });
    expect(input.value).toBe("");
  });

  it("uses the context etapa with · de la etapa", () => {
    const { input } = renderRow();
    typeInto(input, "Revisar");
    const chips = document.querySelector('[data-slot="quick-add-chips"]');
    expect(chips?.textContent).toContain("· de la etapa");
    expect(chips?.textContent).toContain("Tarea Revisar");
    expect(chips?.textContent).toContain("Sin asignar");
    expect(chips?.textContent).toContain("Media");
  });

  it("a #etapa token replaces the context etapa", async () => {
    const { input, onCreate } = renderRow();
    typeInto(input, "Revisar #presale");
    expect(document.querySelector('[data-slot="quick-add-chips"]')?.textContent).not.toContain("· de la etapa");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "Revisar", etapaId: "w-presale" }));
    await screen.findByText("Creada: Creada");
  });

  it.each(["row", "card", "column"] as const)("variant %s renders", (variant) => {
    const { input } = renderRow({ variant });
    const root = input.closest('[data-slot="quick-add"]');
    expect(root?.getAttribute("data-variant")).toBe(variant);
    expect(input.placeholder).toBe(
      variant === "row"
        ? "Nueva tarea en Diseño…  @persona  #etapa  fecha  !prioridad  ·  / asistente"
        : "Escribe para agregar una tarea…",
    );
    if (variant === "row") expect(root?.tagName).toBe("TR");
  });

  it("the card variant shows the weekday in the date chip", () => {
    const { input } = renderRow({ variant: "card" });
    typeInto(input, "Revisar mañana");
    expect(document.querySelector('[data-slot="quick-add-chips"]')?.textContent).toContain("Vence mar 10 nov");
  });

  it("disabled renders nothing", () => {
    renderWithQueryClient(<QuickAddRow context={CONTEXT} variant="card" onCreate={vi.fn()} disabled />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("loads the catalogs only after the first focus", async () => {
    const client = createTestQueryClient();
    renderWithQueryClient(<QuickAddRow context={CONTEXT} variant="card" onCreate={vi.fn()} />, { client });
    expect(actions.fetchWorkflowsAction).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole("textbox"));
    await waitFor(() => expect(actions.fetchWorkflowsAction).toHaveBeenCalled());
  });
});
