// @vitest-environment happy-dom
/** Personas (#689): "Crear integrante", the email-then-name suggestion and the "Eliminados en monday" group. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const createMondayStaffAction = vi.fn();
const suggestMondayPositionAction = vi.fn();
vi.mock("@/lib/actions/monday-import-actions", () => ({
  createMondayStaffAction: (...args: unknown[]) => createMondayStaffAction(...args),
  suggestMondayPositionAction: (...args: unknown[]) => suggestMondayPositionAction(...args),
}));

const noSuggestion = { ok: true, suggestion: { position: null, tasks: 0, topPhases: [] } };

/** "Crear integrante" opens the puesto popover; its own "Crear integrante" creates the person. */
async function createFromRow(row: HTMLElement) {
  fireEvent.click(within(row).getByRole("button", { name: "Crear integrante" }));
  const popover = await screen.findByRole("dialog");
  fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
}

import { PeopleStep } from "./PeopleStep";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayExportSource, MondayImportChoices } from "@/lib/types/monday-import";

const NEW_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const BETO_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

const source: MondayExportSource = {
  boards: [],
  users: [
    { id: "1", name: "Persona Nueva", email: "nueva@example.test", kind: "member" },
    { id: "2", name: "Beto Ejemplo", email: "beto.monday@example.test", kind: "member" },
    { id: "3", name: "Usuario eliminado", email: "u3@deleted.user", kind: "member" },
    { id: "4", name: "monday AI", email: "ai-agent@example.test", kind: "member" },
  ],
  hasFiles: false,
  hasUpdates: false,
};

const choices: MondayImportChoices = {
  statuses: [],
  workflows: [],
  templates: [],
  clients: [],
  staff: [{ id: BETO_ID, name: "Beto Ejemplo", email: null }],
  providerSubtypes: [],
  positions: [],
  statusMap: {},
};

const mapping: MappingInput = {
  version: 2,
  boards: [],
  people: { "1": null, "2": null, "3": { action: "ignore" }, "4": { action: "ignore" } },
  options: { includeUpdates: true, includeFiles: true },
};

beforeEach(() => {
  suggestMondayPositionAction.mockResolvedValue(noSuggestion);
});

afterEach(() => {
  cleanup();
  createMondayStaffAction.mockReset();
  suggestMondayPositionAction.mockReset();
});

describe("PeopleStep (#689)", () => {
  it("creates a staff member for a monday person and maps them to it, marked as created", async () => {
    createMondayStaffAction.mockResolvedValue({
      ok: true,
      staff: { id: NEW_ID, name: "Persona Nueva", email: "nueva@example.test" },
    });
    const onMappingChange = vi.fn();
    const onStaffCreated = vi.fn();
    render(
      <PeopleStep
        mapping={mapping}
        source={source}
        choices={choices}
        runId="run-1"
        onMappingChange={onMappingChange}
        onStaffCreated={onStaffCreated}
      />,
    );
    const row = document.getElementById("persona-1")!;
    await createFromRow(row);
    await waitFor(() => expect(onMappingChange).toHaveBeenCalled());
    expect(createMondayStaffAction).toHaveBeenCalledWith("run-1", "1", { positionIds: [] });
    expect(onStaffCreated).toHaveBeenCalledWith({ id: NEW_ID, name: "Persona Nueva", email: "nueva@example.test" });
    expect(onMappingChange.mock.calls[0][0].people["1"]).toEqual({ action: "staff", staffId: NEW_ID, created: true });
  });

  it("shows the refusal inline and leaves the mapping alone", async () => {
    createMondayStaffAction.mockResolvedValue({
      ok: false,
      error: "Ya hay un integrante con ese correo: Ana Prueba. Elígelo en la lista.",
    });
    const onMappingChange = vi.fn();
    render(
      <PeopleStep mapping={mapping} source={source} choices={choices} runId="run-1" onMappingChange={onMappingChange} />,
    );
    const row = document.getElementById("persona-1")!;
    await createFromRow(row);
    expect((await screen.findByRole("alert")).textContent).toContain("Ya hay un integrante con ese correo");
    expect(onMappingChange).not.toHaveBeenCalled();
  });

  it("suggests staff by name when the email differs", () => {
    render(<PeopleStep mapping={mapping} source={source} choices={choices} runId="run-1" onMappingChange={vi.fn()} />);
    expect(within(document.getElementById("persona-2")!).getByText("Sugerido por nombre: Beto Ejemplo")).toBeTruthy();
  });

  it("lists deleted users and bots last under Eliminados en monday, without Crear integrante", () => {
    render(<PeopleStep mapping={mapping} source={source} choices={choices} runId="run-1" onMappingChange={vi.fn()} />);
    const rows = screen.getAllByRole("row");
    const header = rows.findIndex((r) => r.textContent?.includes("Eliminados en monday"));
    expect(header).toBeGreaterThan(rows.findIndex((r) => r.id === "persona-2"));
    expect(rows.slice(header + 1).map((r) => r.id)).toEqual(["persona-3", "persona-4"]);
    for (const id of ["persona-3", "persona-4"]) {
      expect(within(document.getElementById(id)!).queryByRole("button", { name: "Crear integrante" })).toBeNull();
    }
    // Only the two real people without an equivalent count as pending.
    expect(screen.getByText(/2 personas sin asignar/)).toBeTruthy();
  });

  it("keeps a created staff member selectable before the choices reload", () => {
    const created = { action: "staff" as const, staffId: NEW_ID, created: true };
    const mapped: MappingInput = { ...mapping, people: { ...mapping.people, "1": created } };
    render(<PeopleStep mapping={mapped} source={source} choices={choices} runId="run-1" onMappingChange={vi.fn()} />);
    const row = document.getElementById("persona-1")!;
    expect(within(row).getByText("Integrante nuevo")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Crear integrante" })).toBeNull();
    expect(within(row).getByLabelText("Equivalente de Persona Nueva").textContent).toContain("Persona Nueva");
  });

  it("scrolls to the person a Vista previa Corregir opens", () => {
    const scrolled: string[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.id);
    };
    try {
      render(
        <PeopleStep
          mapping={mapping}
          source={source}
          choices={choices}
          runId="run-1"
          onMappingChange={vi.fn()}
          focusPersonId="2"
        />,
      );
      expect(scrolled).toEqual(["persona-2"]);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});
