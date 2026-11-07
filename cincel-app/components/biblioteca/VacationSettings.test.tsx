// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  save: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  flags: { saveVacationSettingsAction: true } as Record<string, boolean>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh }),
  usePathname: () => "/biblioteca/vacaciones",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@/lib/actions/vacations-actions", () => ({ saveVacationSettingsAction: mocks.save }));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/components/patterns/SettingsSection", async () => ({
  SettingsSection: (await import("./vacation-deciders.fixtures")).patternMocks.SettingsSection,
}));
vi.mock("@/components/patterns/SettingsRow", async () => ({
  SettingsRow: (await import("./vacation-deciders.fixtures")).patternMocks.SettingsRow,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";

import { VACATION_DAYS_ERROR, VacationSettings, parseVacationSettingsDraft } from "./VacationSettings";
import { ANA_ID, LUIS_ID, vacationSettingsFixture } from "./vacation-deciders.fixtures";

function renderSettings(canDecide = true) {
  return render(
    <StyleProvider style="visual" scope="staff">
      <VacationSettings initial={vacationSettingsFixture()} canDecide={canDecide} />
    </StyleProvider>,
  );
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
}

beforeEach(() => {
  mocks.flags.saveVacationSettingsAction = true;
  mocks.save.mockReset();
  mocks.refresh.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => cleanup());

describe("parseVacationSettingsDraft", () => {
  it("accepts whole days from 0 to 60 and sends empty overrides as null", () => {
    expect(
      parseVacationSettingsDraft({ daysPerYear: "0", overrides: { [ANA_ID]: "60", [LUIS_ID]: "" } }, [ANA_ID, LUIS_ID]),
    ).toEqual({
      ok: true,
      value: {
        daysPerYear: 0,
        overrides: [
          { staffId: ANA_ID, days: 60 },
          { staffId: LUIS_ID, days: null },
        ],
      },
    });
  });

  it.each(["-1", "61", "2.5", "", "abc"])("rejects %j as the org default", (raw) => {
    const parsed = parseVacationSettingsDraft({ daysPerYear: raw, overrides: {} }, []);
    expect(parsed).toEqual({ ok: false, errors: { daysPerYear: VACATION_DAYS_ERROR, overrides: {} } });
  });

  it("rejects an override out of range", () => {
    const parsed = parseVacationSettingsDraft({ daysPerYear: "12", overrides: { [ANA_ID]: "70" } }, [ANA_ID]);
    expect(parsed).toEqual({ ok: false, errors: { overrides: { [ANA_ID]: VACATION_DAYS_ERROR } } });
  });
});

describe("VacationSettings", () => {
  it("is absent from the DOM without canDecideVacations", () => {
    const { container } = renderSettings(false);
    expect(container.innerHTML).toBe("");
  });

  it("shows the org default and the per-person overrides (empty = default)", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: "Días de vacaciones" })).toBeTruthy();
    expect((screen.getByLabelText("Días por año") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("Días de Ana Torres") as HTMLInputElement).value).toBe("15");
    const luis = screen.getByLabelText("Días de Luis Méndez") as HTMLInputElement;
    expect(luis.value).toBe("");
    expect(luis.placeholder).toBe("12");
  });

  it("does not save a value outside 0–60", async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("Días por año"), { target: { value: "61" } });
    await clickSave();
    expect(mocks.save).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Días por año");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(VACATION_DAYS_ERROR)).toBeTruthy();
  });

  it("persists the default and the overrides, clearing one to null", async () => {
    mocks.save.mockImplementation(async (input: { daysPerYear: number; overrides: { staffId: string; days: number | null }[] }) => ({
      daysPerYear: input.daysPerYear,
      overrides: [
        { staffId: ANA_ID, name: "Ana Torres", days: null },
        { staffId: LUIS_ID, name: "Luis Méndez", days: 20 },
      ],
    }));
    renderSettings();
    fireEvent.change(screen.getByLabelText("Días por año"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("Días de Ana Torres"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Días de Luis Méndez"), { target: { value: "20" } });
    await clickSave();
    expect(mocks.save).toHaveBeenCalledWith({
      daysPerYear: 14,
      overrides: [
        { staffId: ANA_ID, days: null },
        { staffId: LUIS_ID, days: 20 },
      ],
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Días de vacaciones guardados");
    expect(mocks.refresh).toHaveBeenCalled();
    expect((screen.getByLabelText("Días de Luis Méndez") as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText("Días de Ana Torres") as HTMLInputElement).placeholder).toBe("14");
  });

  it("shows the action error inline on FORBIDDEN or INVALID", async () => {
    mocks.save.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderSettings();
    await clickSave();
    expect(screen.getByText("No tienes permiso para realizar esta acción.")).toBeTruthy();

    mocks.save.mockRejectedValueOnce(new Error("INVALID"));
    await clickSave();
    expect(screen.getByText("Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.")).toBeTruthy();
  });

  it("is read-only while saveVacationSettingsAction is not implemented", () => {
    mocks.flags.saveVacationSettingsAction = false;
    renderSettings();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect((screen.getByLabelText("Días por año") as HTMLInputElement).disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
