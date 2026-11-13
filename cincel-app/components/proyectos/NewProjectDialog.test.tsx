// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { FormDialogProps } from "@/components/patterns/FormDialog";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/projects-actions", () => ({
  submitProjectCreateAction: vi.fn(async () => ({ ok: true, project: { id: "p-new" } })),
  updateProjectAction: vi.fn(async () => undefined),
}));
vi.mock("@/lib/tramos/compat", () => ({ tramoColorVar: () => "var(--chart-1)" }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectosPageData: vi.fn(),
  getProjectCreateStartOptions: vi.fn(async () => START_OPTIONS),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogContacts: vi.fn(async () => [{ id: "c1", name: "Familia Gómez", type: "cliente" }]),
  fetchCatalogStaff: vi.fn(async () => [{ id: "s1", name: "Ana López" }]),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogWorkflows: vi.fn(),
}));
vi.mock("@/components/patterns/ListPage", () => ({ ListPage: () => null }));

// The shell has its own tests (focus, Escape, alert); this one renders the
// dialog's contract plainly so the assertions are about the fields and flow.
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: ({ title, description, open, onOpenChange, onSubmit, submitLabel, error, children }: FormDialogProps) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
          {children}
          {error ? <div role="alert">{error}</div> : null}
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit">{submitLabel}</button>
        </form>
      </div>
    ) : null,
}));

import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { NewProjectDialog } from "./NewProjectDialog";
import { projectStartInput } from "./project-create-form";
import { ProjectsPortfolio } from "./ProjectsPortfolio";
import { portfolioPageData } from "./projects-portfolio.fixtures";

/** `/proyectos` over a seeded `qk.proyectos.list()`, with no projects. */
function renderPortfolio(patch: Partial<ProyectosPageData> = {}) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData({ projects: [], portfolio: [], ...patch }));
  return renderWithQueryClient(<ProjectsPortfolio />, { client });
}

const START_OPTIONS = vi.hoisted(() => ({
  defaultWorkflowId: "wf-presale",
  tramos: [
    {
      id: "wf-presale",
      key: "presale",
      name: "Presale",
      sortOrder: 0,
      phases: [
        { id: "ph-a", name: "Levantamiento", sortOrder: 0, templateCount: 3 },
        { id: "ph-b", name: "Propuesta", sortOrder: 1, templateCount: 2 },
      ],
    },
    {
      id: "wf-diseno",
      key: "diseno",
      name: "Diseño",
      sortOrder: 1,
      phases: [{ id: "ph-c", name: "Anteproyecto", sortOrder: 0, templateCount: 4 }],
    },
  ],
}));

const ADMIN_OPTIONS = {
  clients: [{ id: "c1", name: "Familia Gómez" }],
  staff: [{ id: "s1", name: "Ana López" }],
};

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  nav.params = new URLSearchParams();
});

function renderDialog(patch: Partial<Parameters<typeof NewProjectDialog>[0]> = {}) {
  const onConfirm = vi.fn(async () => undefined);
  const onOpenChange = vi.fn();
  render(
    <NewProjectDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} presaleAutoStart {...patch} />,
  );
  return { onConfirm, onOpenChange };
}

describe("NewProjectDialog", () => {
  it("asks non-admins for the name only", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText("Nombre del proyecto")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("Origen")).toBeNull();
    expect(screen.getByText("Solo necesitas el nombre. Presale se inicia automáticamente.")).toBeTruthy();
  });

  it("adds Cliente, Origen and Quién trajo el proyecto for admins", () => {
    renderDialog({ adminOptions: ADMIN_OPTIONS });
    expect(screen.getByLabelText("Nombre del proyecto")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Cliente" })).toBeTruthy();
    expect(screen.getByLabelText("Origen")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Quién trajo el proyecto" })).toBeTruthy();
  });

  it("submits the trimmed name and closes", async () => {
    const { onConfirm, onOpenChange } = renderDialog();
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "  Casa Lomas  " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ name: "Casa Lomas" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("passes the admin values with the name for admins", async () => {
    const { onConfirm } = renderDialog({ adminOptions: ADMIN_OPTIONS });
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.change(screen.getByLabelText("Origen"), { target: { value: "  Recomendación " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        { name: "Casa Lomas" },
        { clientId: null, origin: "Recomendación", originStaffId: null },
      ),
    );
  });

  it("does not call onConfirm without a name", async () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect((await screen.findByRole("alert")).textContent).toBe("El nombre del proyecto es obligatorio.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the action error copy and stays open", async () => {
    const { onOpenChange } = renderDialog({ onConfirm: vi.fn(async () => Promise.reject(new Error("NAME_TAKEN"))) });
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ya existe un proyecto con ese nombre.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("maps FORBIDDEN through actionErrorText", async () => {
    renderDialog({ onConfirm: vi.fn(async () => Promise.reject(new Error("FORBIDDEN: project create"))) });
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });
});

describe("NewProjectDialog · Etapa inicial (#1034)", () => {
  it("shows the default etapa with every fase checked; untouched it sends the name only", async () => {
    const { onConfirm } = renderDialog({ startOptions: START_OPTIONS });
    expect(screen.getByRole("combobox", { name: "Etapa inicial" })).toBeTruthy();
    const levantamiento = screen.getByRole("checkbox", { name: "Levantamiento · 3 tareas" });
    expect(levantamiento.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Propuesta · 2 tareas" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ name: "Casa Lomas" }));
  });

  it("sends the etapa and the checked fases once a fase is unchecked", async () => {
    const { onConfirm } = renderDialog({ startOptions: START_OPTIONS });
    fireEvent.click(screen.getByRole("checkbox", { name: "Propuesta · 2 tareas" }));
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ name: "Casa Lomas", startWorkflowId: "wf-presale", phaseIds: ["ph-a"] }),
    );
  });

  it("asks for a fase when every fase is unchecked", async () => {
    const { onConfirm } = renderDialog({ startOptions: START_OPTIONS });
    fireEvent.click(screen.getByRole("checkbox", { name: "Levantamiento · 3 tareas" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Propuesta · 2 tareas" }));
    fireEvent.change(screen.getByLabelText("Nombre del proyecto"), { target: { value: "Casa Lomas" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Elige al menos una fase.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("hides the select without start options", () => {
    renderDialog();
    expect(screen.queryByRole("combobox", { name: "Etapa inicial" })).toBeNull();
  });

  it("maps the choice to the create input", () => {
    const none = new Set<string>();
    expect(projectStartInput(START_OPTIONS, { uncheckedPhaseIds: none })).toEqual({});
    expect(projectStartInput(null, { workflowId: "wf-diseno", uncheckedPhaseIds: none })).toEqual({});
    expect(projectStartInput(START_OPTIONS, { workflowId: null, uncheckedPhaseIds: none })).toEqual({
      startWorkflowId: null,
    });
    expect(projectStartInput(START_OPTIONS, { workflowId: "wf-diseno", uncheckedPhaseIds: none })).toEqual({
      startWorkflowId: "wf-diseno",
      phaseIds: ["ph-c"],
    });
    expect(
      projectStartInput({ ...START_OPTIONS, defaultWorkflowId: null }, { uncheckedPhaseIds: new Set(["x"]) }),
    ).toEqual({ startWorkflowId: null });
  });
});

describe("/proyectos?nuevo=1", () => {
  it("opens NewProjectDialog on load; non-admins see the name only", () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio();
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows the admin fields to admins", () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio({ canSeeAdminData: true });
    expect(screen.getByRole("combobox", { name: "Cliente" })).toBeTruthy();
  });

  it("shows Etapa inicial to staff who can start etapas", async () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio({ canPickStartTramo: true });
    expect(await screen.findByRole("combobox", { name: "Etapa inicial" })).toBeTruthy();
  });

  it("stays closed without ?nuevo=1", () => {
    renderPortfolio();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
