// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/patterns/SettingsSection", async () => ({
  SettingsSection: (await import("./general-settings-test-utils")).TestSettingsSection,
}));
const actions = vi.hoisted(() => ({ fetchWorkdayHoursAction: vi.fn(), saveWorkdayHoursAction: vi.fn() }));
vi.mock("@/lib/actions/calendario-settings-actions", () => actions);

import { WorkdayHoursSection, workdayHoursError } from "./WorkdayHoursSection";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

function renderSection(hours = 6) {
  const client = createTestQueryClient();
  client.setQueryData(qk.calendario.workday(), hours);
  actions.fetchWorkdayHoursAction.mockResolvedValue(hours);
  return renderWithQueryClient(<WorkdayHoursSection />, { client });
}

describe("workdayHoursError", () => {
  it("accepts 1 to 12 in steps of 0.5", () => {
    for (const ok of ["1", "6", "6.5", "12"]) expect(workdayHoursError(ok)).toBeNull();
  });
  it("rejects out of range, off-step and empty values", () => {
    expect(workdayHoursError("0.5")).toMatch(/entre 1 y 12/);
    expect(workdayHoursError("13")).toMatch(/entre 1 y 12/);
    expect(workdayHoursError("6.3")).toMatch(/media hora/);
    expect(workdayHoursError("")).toMatch(/Escribe/);
  });
});

describe("WorkdayHoursSection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows the saved hours with the hint, saving disabled until a change", () => {
    renderSection(6);
    expect((screen.getByLabelText("Horas de trabajo por día") as HTMLInputElement).value).toBe("6");
    expect(screen.getByText("Se usa para la carga del Calendario cuando el puesto no tiene capacidad semanal.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Guardar jornada" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks an out-of-range value", () => {
    renderSection();
    fireEvent.change(screen.getByLabelText("Horas de trabajo por día"), { target: { value: "20" } });
    expect(screen.getByText("Debe estar entre 1 y 12 horas.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Guardar jornada" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves through the action and refreshes the Calendario", async () => {
    actions.saveWorkdayHoursAction.mockResolvedValue({ ok: true, data: { hours: 7.5 } });
    const { client } = renderSection(6);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.change(screen.getByLabelText("Horas de trabajo por día"), { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jornada" }));
    await waitFor(() => expect(actions.saveWorkdayHoursAction).toHaveBeenCalledWith(7.5));
    await waitFor(() =>
      expect(invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey)).toContainEqual(qk.calendario.all),
    );
  });

  it("has no critical or serious a11y violations", async () => {
    const { container } = renderSection();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });
});
