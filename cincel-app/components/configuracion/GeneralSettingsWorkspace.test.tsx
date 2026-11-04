// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/layout/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/components/configuracion/PrimaryColorPicker", () => ({ PrimaryColorPicker: () => null }));

import GeneralSettingsWorkspace from "./GeneralSettingsWorkspace";

const appearance = { primaryColor: null, canManage: true };

describe("GeneralSettingsWorkspace", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows no storage key or settings source", () => {
    render(<GeneralSettingsWorkspace appearance={appearance} />);

    expect(screen.queryByText(/Fuente actual/)).toBeNull();
    expect(screen.queryByText(/Clave de persistencia/)).toBeNull();
    expect(screen.queryByText(/cincel\.settings\.general/)).toBeNull();
    expect(screen.queryByText(/^Guardado /)).toBeNull();
  });

  it("shows the last saved time after a save", () => {
    render(<GeneralSettingsWorkspace appearance={appearance} />);

    // Trade name and system name share the default value; the trade name comes first.
    fireEvent.change(screen.getAllByDisplayValue("Cincel Workspace")[0], { target: { value: "Cincel Studio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText(/^Guardado /)).toBeTruthy();
  });
});
