// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { buildDefaultGeneralSettings } from "./general-settings";
import { GeneralSettingsProvider, useGeneralSettings } from "./use-general-settings";

function SystemName() {
  return <span>{useGeneralSettings().system.systemName}</span>;
}

describe("useGeneralSettings", () => {
  afterEach(() => cleanup());

  it("reads the settings the layout provides", () => {
    const settings = buildDefaultGeneralSettings();
    settings.system.systemName = "Cincel ERP";
    render(
      <GeneralSettingsProvider value={settings}>
        <SystemName />
      </GeneralSettingsProvider>,
    );
    expect(screen.getByText("Cincel ERP")).toBeTruthy();
  });

  it("falls back to the defaults outside a provider", () => {
    render(<SystemName />);
    expect(screen.getByText("Cincel Workspace")).toBeTruthy();
  });
});
