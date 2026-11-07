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

import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectsPortfolio } from "./ProjectsPortfolio";

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

describe("/proyectos?nuevo=1", () => {
  it("opens NewProjectDialog on load; non-admins see the name only", () => {
    nav.params = new URLSearchParams("nuevo=1");
    render(<ProjectsPortfolio projects={[]} portfolio={[]} canCreateProject />);
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows the admin fields to admins", () => {
    nav.params = new URLSearchParams("nuevo=1");
    render(<ProjectsPortfolio projects={[]} portfolio={[]} canCreateProject canSeeAdminData adminOptions={ADMIN_OPTIONS} />);
    expect(screen.getByRole("combobox", { name: "Cliente" })).toBeTruthy();
  });

  it("stays closed without ?nuevo=1", () => {
    render(<ProjectsPortfolio projects={[]} portfolio={[]} canCreateProject />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
