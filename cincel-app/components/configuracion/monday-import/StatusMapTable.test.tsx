// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { StatusMapLabel } from "@/lib/monday-import/status-map";
import type { MondayImportChoices, MondayStatusMap } from "@/lib/types/monday-import";

const saveMondayStatusMapAction = vi.fn();
const createTaskStatusAction = vi.fn();

vi.mock("@/lib/actions/monday-import-actions", () => ({
  saveMondayStatusMapAction: (map: MondayStatusMap) => saveMondayStatusMapAction(map),
}));
vi.mock("@/lib/actions/task-statuses-actions", () => ({
  createTaskStatusAction: (input: unknown) => createTaskStatusAction(input),
}));
// A native select stands in for the shadcn one so a test can pick an option.
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
      <option value="" />
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  ),
}));

import { STATUS_MAP_SAVE_DELAY_MS, StatusMapTable } from "./StatusMapTable";

const GONE = "33333333-3333-4333-8333-333333333333";
const CREATED = "44444444-4444-4444-8444-444444444444";

const labels: StatusMapLabel[] = [
  { key: "en proceso", name: "En Proceso", items: 4, isDone: false },
  { key: "raro", name: "Raro", items: 2, isDone: false },
];

const choices: Pick<MondayImportChoices, "statuses" | "statusMap"> = { statuses: [], statusMap: {} };

function renderTable(overrides: Partial<Parameters<typeof StatusMapTable>[0]> = {}) {
  const onSaved = vi.fn();
  const onStatusCreated = vi.fn();
  render(
    <StatusMapTable labels={labels} choices={choices} onSaved={onSaved} onStatusCreated={onStatusCreated} {...overrides} />,
  );
  return { onSaved, onStatusCreated };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(STATUS_MAP_SAVE_DELAY_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMondayStatusMapAction.mockReset();
  createTaskStatusAction.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StatusMapTable (FE §4.6 item 5)", () => {
  it("prefills defaults and flags labels without an equivalent", () => {
    renderTable();
    expect((screen.getByRole("combobox", { name: "Estatus de Cincel para En Proceso" }) as HTMLSelectElement).value).toBe(
      "status:en_proceso",
    );
    expect((screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }) as HTMLSelectElement).value).toBe(
      "status:pendiente",
    );
    expect(screen.getAllByText("Sin equivalente")).toHaveLength(1);
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("starts from the saved map", () => {
    renderTable({ choices: { statuses: [], statusMap: { raro: { target: { status: "bloqueado" }, priority: "alta" } } } });
    expect((screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }) as HTMLSelectElement).value).toBe(
      "status:bloqueado",
    );
    expect((screen.getByRole("combobox", { name: "Prioridad para Raro" }) as HTMLSelectElement).value).toBe("alta");
    expect(screen.queryByText("Sin equivalente")).toBeNull();
  });

  it("debounces changes into one save of the whole map and shows Guardando… then Guardado", async () => {
    const saved: MondayStatusMap = {
      raro: { target: { status: "completado" }, priority: "media" },
    };
    saveMondayStatusMapAction.mockResolvedValue({ ok: true, statusMap: saved });
    const { onSaved } = renderTable();

    fireEvent.change(screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }), {
      target: { value: "status:completado" },
    });
    expect(screen.getByText("Guardando…")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_MAP_SAVE_DELAY_MS - 100);
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridad para Raro" }), { target: { value: "media" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_MAP_SAVE_DELAY_MS - 100);
    });
    expect(saveMondayStatusMapAction).not.toHaveBeenCalled();

    await flush();
    expect(saveMondayStatusMapAction).toHaveBeenCalledTimes(1);
    expect(saveMondayStatusMapAction).toHaveBeenCalledWith({
      raro: { target: { status: "completado" }, priority: "media" },
    });
    expect(screen.getByText("Guardado")).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(screen.queryByText("Sin equivalente")).toBeNull();
  });

  it("keeps the local value on a failed save and retries it", async () => {
    saveMondayStatusMapAction.mockResolvedValueOnce({ ok: false, error: "Algo falló" });
    renderTable();

    fireEvent.change(screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }), {
      target: { value: "status:bloqueado" },
    });
    await flush();
    expect(screen.getByText("No se pudo guardar el mapa de estatus.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }) as HTMLSelectElement).value).toBe(
      "status:bloqueado",
    );

    saveMondayStatusMapAction.mockResolvedValueOnce({
      ok: true,
      statusMap: { raro: { target: { status: "bloqueado" }, priority: null } },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(saveMondayStatusMapAction).toHaveBeenCalledTimes(2);
    expect(saveMondayStatusMapAction).toHaveBeenLastCalledWith({ raro: { target: { status: "bloqueado" }, priority: null } });
    expect(screen.queryByText("No se pudo guardar el mapa de estatus.")).toBeNull();
    expect(screen.getByText("Guardado")).toBeTruthy();
  });

  it("explains STATUS_NOT_FOUND and marks the row with the missing status", async () => {
    saveMondayStatusMapAction.mockResolvedValue({ ok: false, error: "STATUS_NOT_FOUND" });
    renderTable({
      choices: { statuses: [], statusMap: { raro: { target: { customStatusId: GONE }, priority: null } } },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Prioridad para En Proceso" }), { target: { value: "baja" } });
    await flush();
    expect(screen.getByText("Uno de los estatus elegidos ya no existe. Elige otro y vuelve a guardar.")).toBeTruthy();
    const invalid = document.querySelectorAll('[aria-invalid="true"]');
    expect(invalid).toHaveLength(1);
    expect(invalid[0].querySelector('[aria-label="Estatus de Cincel para Raro"]')).not.toBeNull();
  });

  it("sends «Cuenta como completada» when creating a status inline and picks it", async () => {
    createTaskStatusAction.mockResolvedValue({
      id: CREATED,
      name: "Raro",
      closes: true,
      countsAsCompleted: true,
      sortOrder: 9,
    });
    saveMondayStatusMapAction.mockResolvedValue({ ok: true, statusMap: {} });
    const { onStatusCreated } = renderTable();

    fireEvent.change(screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }), {
      target: { value: "__create__" },
    });
    const completed = screen.getByRole("checkbox", { name: "Cuenta como completada" });
    expect(completed.getAttribute("aria-disabled") === "true" || completed.hasAttribute("disabled") || completed.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cierra la tarea" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cuenta como completada" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear estatus" }));
    });

    expect(createTaskStatusAction).toHaveBeenCalledWith({ name: "Raro", closes: true, countsAsCompleted: true });
    expect(onStatusCreated).toHaveBeenCalledWith({ id: CREATED, name: "Raro", closes: true, countsAsCompleted: true });
    await flush();
    expect(saveMondayStatusMapAction).toHaveBeenCalledWith({
      raro: { target: { customStatusId: CREATED }, priority: null },
    });
  });

  it("never counts a status as completed when it doesn't close the task", async () => {
    createTaskStatusAction.mockResolvedValue({ id: CREATED, name: "Raro", closes: false, countsAsCompleted: false, sortOrder: 9 });
    saveMondayStatusMapAction.mockResolvedValue({ ok: true, statusMap: {} });
    renderTable();
    fireEvent.change(screen.getByRole("combobox", { name: "Estatus de Cincel para Raro" }), {
      target: { value: "__create__" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear estatus" }));
    });
    expect(createTaskStatusAction).toHaveBeenCalledWith({ name: "Raro", closes: false, countsAsCompleted: false });
  });
});
