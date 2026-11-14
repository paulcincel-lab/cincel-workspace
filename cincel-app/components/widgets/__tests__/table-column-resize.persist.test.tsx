// @vitest-environment happy-dom
/**
 * Remembered column widths (#1125): seeded from the user's preferences,
 * saved through the debounced `setTableColumnWidthsAction`, forgotten with
 * "Restablecer anchos".
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GroupedTable } from "@/components/widgets/GroupedTable";
import { groupedTaskColumns, groupedTaskGroups, type GroupedTaskRow } from "@/components/widgets/fixtures/grouped-table";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { UserPreferences } from "@/lib/types/redesign";
import { WIDTHS_SAVE_DEBOUNCE_MS } from "@/lib/ui/table-widths";
import { DEFAULT_USER_PREFERENCES, resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

const mocks = vi.hoisted(() => ({ setWidths: vi.fn(), toastError: vi.fn() }));

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/table-widths-actions", () => ({ setTableColumnWidthsAction: mocks.setWidths }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const appearance = resolveAppearance({ ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 }, null);

function renderTable(preferences: UserPreferences) {
  return render(
    <AppearanceStoreProvider initial={appearance} preferences={preferences}>
      <GroupedTable<GroupedTaskRow> label="Tareas" tableId="tareas-test" columns={groupedTaskColumns} groups={groupedTaskGroups} />
    </AppearanceStoreProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  mocks.setWidths.mockReset();
  mocks.toastError.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("remembered column widths", () => {
  it("applies the widths of the user's preferences to this table only", () => {
    const { container } = renderTable({
      ...DEFAULT_USER_PREFERENCES,
      tableColumnWidths: { "tareas-test": { responsable: 260 }, otra: { responsable: 500 } },
    });
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("260px");
    expect(screen.getByRole("button", { name: "Restablecer anchos" })).toBeTruthy();
  });

  it("saves after the debounce with the table's widths, once for several changes", async () => {
    mocks.setWidths.mockResolvedValue({ ok: true, data: { tableColumnWidths: { "tareas-test": { responsable: 172 } } } });
    renderTable({ ...DEFAULT_USER_PREFERENCES });
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Responsable" })[0];
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(mocks.setWidths).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIDTHS_SAVE_DEBOUNCE_MS);
    });
    expect(mocks.setWidths).toHaveBeenCalledTimes(1);
    expect(mocks.setWidths).toHaveBeenCalledWith({ tableId: "tareas-test", widths: { responsable: 172 } });
  });

  it("Restablecer anchos forgets the table's widths and sends null", async () => {
    mocks.setWidths.mockResolvedValue({ ok: true, data: { tableColumnWidths: {} } });
    const { container } = renderTable({ ...DEFAULT_USER_PREFERENCES, tableColumnWidths: { "tareas-test": { responsable: 260 } } });
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restablecer anchos" }));
    });
    expect(mocks.setWidths).toHaveBeenCalledWith({ tableId: "tareas-test", widths: null });
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("140px");
    expect(screen.queryByRole("button", { name: "Restablecer anchos" })).toBeNull();
  });

  it("shows an error and goes back to the confirmed widths when the save fails", async () => {
    mocks.setWidths.mockResolvedValue({ ok: false, error: "INVALID" });
    const { container } = renderTable({ ...DEFAULT_USER_PREFERENCES });
    const root = container.querySelector<HTMLElement>("[data-slot=grouped-table]")!;
    const handle = screen.getAllByRole("separator", { name: "Ancho de la columna Responsable" })[0];
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WIDTHS_SAVE_DEBOUNCE_MS);
    });
    expect(mocks.toastError).toHaveBeenCalled();
    expect(root.style.getPropertyValue("--cw-responsable")).toBe("140px");
  });
});
