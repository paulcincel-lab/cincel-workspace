// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type * as ReactTypes from "react";

import type { ProjectDetail, ProjectTramo, WorkflowRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({ setProjectCurrentTramoAction: vi.fn() }));
vi.mock("@/lib/actions/projects-actions", () => actions);

// A native <select> stands in for the popup Select so tests can pick options.
vi.mock("@/components/ui/shadcn/select", async () => {
  const React = await import("react");
  function Select({
    items,
    value,
    disabled,
    onValueChange,
    children,
  }: {
    items?: Record<string, string>;
    value?: string | null;
    disabled?: boolean;
    onValueChange?: (v: string | null) => void;
    children?: ReactTypes.ReactNode;
  }) {
    let label: string | undefined;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<{ "aria-label"?: string }>(child) && child.props["aria-label"]) {
        label = child.props["aria-label"];
      }
    });
    return (
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.value || null)}
      >
        <option value="">—</option>
        {Object.entries(items ?? {}).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    );
  }
  const Empty = () => null;
  return { Select, SelectTrigger: Empty, SelectValue: Empty, SelectContent: Empty, SelectItem: Empty };
});

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { ProjectTramosCard, startTramoHref } from "./ProjectTramosCard";

/** The query keys the client invalidated, in order. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

const PRESALE: WorkflowRef = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };
const WORKFLOWS = [PRESALE, DISENO, CONSTRUCCION];

function tramo(ref: WorkflowRef, overrides: Partial<ProjectTramo> = {}): ProjectTramo {
  return { ...ref, startedAt: "2026-10-01T15:00:00.000Z", closedAt: null, current: false, ...overrides };
}

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    name: "Casa Lomas",
    currentWorkflowId: DISENO.id,
    currentWorkflow: DISENO,
    tramos: [tramo(PRESALE, { closedAt: "2026-10-20T15:00:00.000Z" }), tramo(DISENO, { current: true })],
    needsTramo: false,
    ...overrides,
  } as ProjectDetail;
}

describe("ProjectTramosCard", () => {
  beforeEach(() => {
    actions.setProjectCurrentTramoAction.mockReset();
  });
  afterEach(cleanup);

  it("lists the started tramos with their dates and marks the current one", () => {
    renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo={false} />);

    const list = screen.getByRole("list", { name: "Tramos iniciados" });
    expect(list.textContent).toContain("Presale");
    expect(list.textContent).toContain("Cerrado el");
    expect(list.textContent).toContain("Diseño");
    expect(list.textContent).toContain("Iniciado el");
    expect(screen.getByText("Tramo actual")).toBeTruthy();
    expect(list.textContent).not.toContain("Construcción");
  });

  it("changes the current tramo among the started ones", async () => {
    const updated = project({ currentWorkflowId: PRESALE.id, currentWorkflow: PRESALE });
    actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: true, data: updated });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo />, { client });

    const select = screen.getByRole("combobox", { name: "Tramo actual" }) as HTMLSelectElement;
    expect(select.value).toBe(DISENO.id);
    expect([...select.options].map((o) => o.textContent)).toEqual(["—", "Presale", "Diseño"]);

    fireEvent.change(select, { target: { value: PRESALE.id } });

    // The mutation calls the action on the next tick.
    await waitFor(() => expect(actions.setProjectCurrentTramoAction).toHaveBeenCalledWith("p1", PRESALE.id));
    // No reload: the project, the list and Tareas are invalidated.
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([qk.proyectos.detail("p1"), qk.proyectos.list(), qk.tareas.all]),
    );
  });

  it("shows the action error as Spanish copy", async () => {
    actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: false, error: "NOT_STARTED" });
    renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo />);

    fireEvent.change(screen.getByRole("combobox", { name: "Tramo actual" }), { target: { value: PRESALE.id } });

    expect(await screen.findByText("Ese tramo aún no se inicia en el proyecto.")).toBeTruthy();
  });

  it("links each tramo not started yet to its Actividades page with ?project=", () => {
    renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo />);

    const link = screen.getByRole("link", { name: "Iniciar Construcción" });
    expect(link.getAttribute("href")).toBe("/actividades/construccion?project=p1");
    expect(screen.queryByRole("link", { name: "Iniciar Diseño" })).toBeNull();
    expect(startTramoHref(PRESALE, "p 2")).toBe("/actividades/presale?project=p%202");
  });

  it("hides the tramo controls without canChangeTramo", () => {
    renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo={false} />);

    expect(screen.queryByRole("combobox", { name: "Tramo actual" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Iniciar / })).toBeNull();
  });

  describe("Asignar tramo", () => {
    const noTramo = () => project({ currentWorkflowId: null, currentWorkflow: null, tramos: [], needsTramo: true });

    it("is shown to admins when the project has no current tramo", () => {
      renderWithQueryClient(<ProjectTramosCard project={noTramo()} workflows={WORKFLOWS} canChangeTramo isAdmin />);
      expect(screen.getByRole("combobox", { name: "Asignar tramo" })).toBeTruthy();
    });

    it("is shown to admins when the project has tasks without a tramo", () => {
      renderWithQueryClient(
        <ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo isAdmin hasTasksWithoutTramo />
      );
      expect(screen.getByRole("combobox", { name: "Asignar tramo" })).toBeTruthy();
    });

    it("is hidden from non-admins and when nothing needs a tramo", () => {
      renderWithQueryClient(<ProjectTramosCard project={noTramo()} workflows={WORKFLOWS} canChangeTramo />);
      expect(screen.queryByRole("combobox", { name: "Asignar tramo" })).toBeNull();
      cleanup();

      renderWithQueryClient(<ProjectTramosCard project={project()} workflows={WORKFLOWS} canChangeTramo isAdmin />);
      expect(screen.queryByRole("combobox", { name: "Asignar tramo" })).toBeNull();
    });

    it("sends a tramo not started yet through the Iniciar tramo deep link", () => {
      renderWithQueryClient(<ProjectTramosCard project={noTramo()} workflows={WORKFLOWS} canChangeTramo isAdmin />);

      fireEvent.change(screen.getByRole("combobox", { name: "Asignar tramo" }), { target: { value: DISENO.id } });

      expect(screen.getByRole("link", { name: "Iniciar" }).getAttribute("href")).toBe("/actividades/diseno?project=p1");
      expect(actions.setProjectCurrentTramoAction).not.toHaveBeenCalled();
    });

    it("sets a started tramo as current", async () => {
      const p = project({ currentWorkflowId: null, currentWorkflow: null, needsTramo: true, tramos: [tramo(PRESALE)] });
      const updated = project({ currentWorkflowId: PRESALE.id, currentWorkflow: PRESALE });
      actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: true, data: updated });
      const client = createTestQueryClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      renderWithQueryClient(<ProjectTramosCard project={p} workflows={WORKFLOWS} canChangeTramo isAdmin />, { client });

      fireEvent.change(screen.getByRole("combobox", { name: "Asignar tramo" }), { target: { value: PRESALE.id } });
      fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));

      await waitFor(() => expect(invalidatedKeys(invalidate)).toContainEqual(qk.proyectos.detail("p1")));
      expect(actions.setProjectCurrentTramoAction).toHaveBeenCalledWith("p1", PRESALE.id);
    });
  });
});
