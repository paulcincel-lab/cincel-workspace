// @vitest-environment happy-dom
/** "Crear integrante" (project flow §4.8): suggested puesto with its reason, changeable before creating. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const createMondayStaffAction = vi.fn();
const suggestMondayPositionAction = vi.fn();
vi.mock("@/lib/actions/monday-import-actions", () => ({
  createMondayStaffAction: (...args: unknown[]) => createMondayStaffAction(...args),
  suggestMondayPositionAction: (...args: unknown[]) => suggestMondayPositionAction(...args),
}));

// A native select stands in for the shadcn one so the test can pick a puesto.
vi.mock("@/components/configuracion/monday-import/ChoiceSelect", () => ({
  ChoiceSelect: ({
    label,
    value,
    choices,
    onChange,
  }: {
    label: string;
    value: string | null;
    choices: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  ),
}));

import { CreateStaffButton, suggestionReason } from "./CreateStaffButton";

const POSITIONS = [
  { id: "pos-ejecutivo", name: "Proyectista ejecutivo" },
  { id: "pos-residente", name: "Residente de obra" },
];
const STAFF = { id: "cccccccc-3333-4333-8333-cccccccccccc", name: "Luis Prueba", email: "luis@example.test" };
const SUGGESTION = {
  position: POSITIONS[0],
  tasks: 40,
  topPhases: [
    { workflowName: "Diseño", phaseName: "Ejecutivo", tasks: 34 },
    { workflowName: "Construcción", phaseName: "Obra", tasks: 6 },
  ],
};

afterEach(() => {
  cleanup();
  createMondayStaffAction.mockReset();
  suggestMondayPositionAction.mockReset();
});

function renderButton(onCreated = vi.fn()) {
  render(
    <CreateStaffButton runId="run-1" user={{ id: "7", name: "Luis Prueba" }} positions={POSITIONS} onCreated={onCreated} />,
  );
  return onCreated;
}

async function openPopover() {
  fireEvent.click(screen.getByRole("button", { name: "Crear integrante" }));
  return screen.findByRole("dialog");
}

describe("CreateStaffButton", () => {
  it("preselects the suggested puesto and shows why", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: SUGGESTION });
    renderButton();
    const popover = await openPopover();

    expect(await within(popover).findByText("Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo.")).toBeTruthy();
    expect(suggestMondayPositionAction).toHaveBeenCalledWith("run-1", "7");
    expect((within(popover).getByRole("combobox", { name: "Puesto" }) as HTMLSelectElement).value).toBe("pos-ejecutivo");
  });

  it("creates the person with the suggested puesto", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: SUGGESTION });
    createMondayStaffAction.mockResolvedValue({ ok: true, staff: STAFF });
    const onCreated = renderButton();
    const popover = await openPopover();
    await within(popover).findByText(/Sugerido por sus tareas/);

    fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(STAFF));
    expect(createMondayStaffAction).toHaveBeenCalledWith("run-1", "7", { positionIds: ["pos-ejecutivo"] });
  });

  it("lets the user change the puesto before creating", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: SUGGESTION });
    createMondayStaffAction.mockResolvedValue({ ok: true, staff: STAFF });
    const onCreated = renderButton();
    const popover = await openPopover();
    await within(popover).findByText(/Sugerido por sus tareas/);

    fireEvent.change(within(popover).getByRole("combobox", { name: "Puesto" }), { target: { value: "pos-residente" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createMondayStaffAction).toHaveBeenCalledWith("run-1", "7", { positionIds: ["pos-residente"] });
  });

  it("creates without a puesto when Sin puesto is picked", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: SUGGESTION });
    createMondayStaffAction.mockResolvedValue({ ok: true, staff: STAFF });
    const onCreated = renderButton();
    const popover = await openPopover();
    await within(popover).findByText(/Sugerido por sus tareas/);

    fireEvent.change(within(popover).getByRole("combobox", { name: "Puesto" }), { target: { value: "none" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createMondayStaffAction).toHaveBeenCalledWith("run-1", "7", { positionIds: [] });
  });

  it("says there is no suggestion when the person's tasks have no fase", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: { position: null, tasks: 3, topPhases: [] } });
    renderButton();
    const popover = await openPopover();

    expect(await within(popover).findByText("Sin sugerencia: sus tareas no tienen fase.")).toBeTruthy();
    expect((within(popover).getByRole("combobox", { name: "Puesto" }) as HTMLSelectElement).value).toBe("none");
  });

  it("shows a loading line while the suggestion loads", async () => {
    suggestMondayPositionAction.mockReturnValue(new Promise(() => {}));
    renderButton();
    await openPopover();
    expect(await screen.findByTestId("position-suggestion-loading")).toBeTruthy();
  });

  it("shows a refusal inline and keeps the popover open", async () => {
    suggestMondayPositionAction.mockResolvedValue({ ok: true, suggestion: SUGGESTION });
    createMondayStaffAction.mockResolvedValue({ ok: false, error: "Ya hay un integrante con ese correo." });
    const onCreated = renderButton();
    const popover = await openPopover();
    await within(popover).findByText(/Sugerido por sus tareas/);

    fireEvent.click(within(popover).getByRole("button", { name: "Crear integrante" }));
    expect((await within(popover).findByRole("alert")).textContent).toContain("Ya hay un integrante con ese correo.");
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("suggestionReason", () => {
  it("names the top fase and its share of the person's tasks", () => {
    expect(suggestionReason(SUGGESTION)).toBe("Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo.");
  });

  it("falls back to the no-suggestion line", () => {
    expect(suggestionReason({ position: null, tasks: 0, topPhases: [] })).toBe("Sin sugerencia: sus tareas no tienen fase.");
  });
});
