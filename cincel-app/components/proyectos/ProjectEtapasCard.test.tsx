// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type * as ReactTypes from "react";

import type { ProjectDetail, ProjectEtapa, WorkflowRef } from "@/lib/types/core";

const actions = vi.hoisted(() => ({ setProjectCurrentEtapaAction: vi.fn() }));
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

import { ProjectEtapasCard, startEtapaHref } from "./ProjectEtapasCard";

/** The query keys the client invalidated, in order. */
function invalidatedKeys(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

const PRESALE: WorkflowRef = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };
const WORKFLOWS = [PRESALE, DISENO, CONSTRUCCION];

function etapa(ref: WorkflowRef, overrides: Partial<ProjectEtapa> = {}): ProjectEtapa {
  return { ...ref, startedAt: "2026-10-01T15:00:00.000Z", closedAt: null, current: false, ...overrides };
}

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    name: "Casa Lomas",
    currentWorkflowId: DISENO.id,
    currentWorkflow: DISENO,
    etapas: [etapa(PRESALE, { closedAt: "2026-10-20T15:00:00.000Z" }), etapa(DISENO, { current: true })],
    needsEtapa: false,
    ...overrides,
  } as ProjectDetail;
}

describe("ProjectEtapasCard", () => {
  beforeEach(() => {
    actions.setProjectCurrentEtapaAction.mockReset();
  });
  afterEach(cleanup);

  it("lists the started etapas with their dates and marks the current one", () => {
    renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa={false} />);

    const list = screen.getByRole("list", { name: "Etapas iniciadas" });
    expect(list.textContent).toContain("Presale");
    expect(list.textContent).toContain("Cerrado el");
    expect(list.textContent).toContain("Diseño");
    expect(list.textContent).toContain("Iniciado el");
    expect(screen.getByText("Etapa actual")).toBeTruthy();
    expect(list.textContent).not.toContain("Construcción");
  });

  it("changes the current etapa among the started ones", async () => {
    const updated = project({ currentWorkflowId: PRESALE.id, currentWorkflow: PRESALE });
    actions.setProjectCurrentEtapaAction.mockResolvedValue({ ok: true, data: updated });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa />, { client });

    const select = screen.getByRole("combobox", { name: "Etapa actual" }) as HTMLSelectElement;
    expect(select.value).toBe(DISENO.id);
    expect([...select.options].map((o) => o.textContent)).toEqual(["—", "Presale", "Diseño"]);

    fireEvent.change(select, { target: { value: PRESALE.id } });

    // The mutation calls the action on the next tick.
    await waitFor(() => expect(actions.setProjectCurrentEtapaAction).toHaveBeenCalledWith("p1", PRESALE.id));
    // No reload: the project, the list and Tareas are invalidated.
    await waitFor(() =>
      expect(invalidatedKeys(invalidate)).toEqual([qk.proyectos.detail("p1"), qk.proyectos.list(), qk.tareas.all]),
    );
  });

  it("shows the action error as Spanish copy", async () => {
    actions.setProjectCurrentEtapaAction.mockResolvedValue({ ok: false, error: "NOT_STARTED" });
    renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa />);

    fireEvent.change(screen.getByRole("combobox", { name: "Etapa actual" }), { target: { value: PRESALE.id } });

    expect(await screen.findByText("Esa etapa aún no se inicia en el proyecto.")).toBeTruthy();
  });

  it("links each etapa not started yet to its Actividades page with ?project=", () => {
    renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa />);

    const link = screen.getByRole("link", { name: "Iniciar Construcción" });
    expect(link.getAttribute("href")).toBe("/actividades/construccion?project=p1");
    expect(screen.queryByRole("link", { name: "Iniciar Diseño" })).toBeNull();
    expect(startEtapaHref(PRESALE, "p 2")).toBe("/actividades/presale?project=p%202");
  });

  it("hides the etapa controls without canChangeEtapa", () => {
    renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa={false} />);

    expect(screen.queryByRole("combobox", { name: "Etapa actual" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Iniciar / })).toBeNull();
  });

  describe("Asignar etapa", () => {
    const noEtapa = () => project({ currentWorkflowId: null, currentWorkflow: null, etapas: [], needsEtapa: true });

    it("is shown to admins when the project has no current etapa", () => {
      renderWithQueryClient(<ProjectEtapasCard project={noEtapa()} workflows={WORKFLOWS} canChangeEtapa isAdmin />);
      expect(screen.getByRole("combobox", { name: "Asignar etapa" })).toBeTruthy();
    });

    it("is shown to admins when the project has tasks without an etapa", () => {
      renderWithQueryClient(
        <ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa isAdmin hasTasksWithoutEtapa />
      );
      expect(screen.getByRole("combobox", { name: "Asignar etapa" })).toBeTruthy();
    });

    it("is hidden from non-admins and when nothing needs an etapa", () => {
      renderWithQueryClient(<ProjectEtapasCard project={noEtapa()} workflows={WORKFLOWS} canChangeEtapa />);
      expect(screen.queryByRole("combobox", { name: "Asignar etapa" })).toBeNull();
      cleanup();

      renderWithQueryClient(<ProjectEtapasCard project={project()} workflows={WORKFLOWS} canChangeEtapa isAdmin />);
      expect(screen.queryByRole("combobox", { name: "Asignar etapa" })).toBeNull();
    });

    it("sends an etapa not started yet through the Iniciar etapa deep link", () => {
      renderWithQueryClient(<ProjectEtapasCard project={noEtapa()} workflows={WORKFLOWS} canChangeEtapa isAdmin />);

      fireEvent.change(screen.getByRole("combobox", { name: "Asignar etapa" }), { target: { value: DISENO.id } });

      expect(screen.getByRole("link", { name: "Iniciar" }).getAttribute("href")).toBe("/actividades/diseno?project=p1");
      expect(actions.setProjectCurrentEtapaAction).not.toHaveBeenCalled();
    });

    it("sets a started etapa as current", async () => {
      const p = project({ currentWorkflowId: null, currentWorkflow: null, needsEtapa: true, etapas: [etapa(PRESALE)] });
      const updated = project({ currentWorkflowId: PRESALE.id, currentWorkflow: PRESALE });
      actions.setProjectCurrentEtapaAction.mockResolvedValue({ ok: true, data: updated });
      const client = createTestQueryClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      renderWithQueryClient(<ProjectEtapasCard project={p} workflows={WORKFLOWS} canChangeEtapa isAdmin />, { client });

      fireEvent.change(screen.getByRole("combobox", { name: "Asignar etapa" }), { target: { value: PRESALE.id } });
      fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));

      await waitFor(() => expect(invalidatedKeys(invalidate)).toContainEqual(qk.proyectos.detail("p1")));
      expect(actions.setProjectCurrentEtapaAction).toHaveBeenCalledWith("p1", PRESALE.id);
    });
  });
});
