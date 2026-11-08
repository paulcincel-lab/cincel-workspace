// @vitest-environment happy-dom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchGeneralSettingsAction: vi.fn() }));

vi.mock("@/lib/actions/app-settings-actions", () => ({
  fetchGeneralSettingsAction: mocks.fetchGeneralSettingsAction,
}));

import { orgGeneralOptions } from "@/lib/query/options/org";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import {
  buildDefaultLoadedGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  type LoadedGeneralSettings,
} from "@/lib/settings/general-settings";
import { GeneralSettingsSeed, useGeneralSettings } from "@/lib/settings/use-general-settings";

function loaded(systemName: string): LoadedGeneralSettings {
  const base = buildDefaultLoadedGeneralSettings();
  return {
    ...base,
    hasCustom: true,
    savedAt: "2026-11-01T10:00:00.000Z",
    settings: { ...base.settings, system: { ...base.settings.system, systemName } },
  };
}

function SystemName() {
  return <p>{useGeneralSettings().system.systemName}</p>;
}

describe("orgGeneralOptions", () => {
  it("uses qk.org.general() with a 5 min stale time and the fetch action", async () => {
    const options = orgGeneralOptions();
    expect(options.queryKey).toEqual(qk.org.general());
    expect(options.staleTime).toBe(5 * 60_000);

    mocks.fetchGeneralSettingsAction.mockResolvedValueOnce(loaded("Desde el servidor"));
    const qc = createTestQueryClient();
    await expect(qc.fetchQuery(options)).resolves.toMatchObject({ settings: { system: { systemName: "Desde el servidor" } } });
    expect(mocks.fetchGeneralSettingsAction).toHaveBeenCalledTimes(1);
  });
});

describe("useGeneralSettings", () => {
  beforeEach(() => {
    mocks.fetchGeneralSettingsAction.mockReset();
  });
  afterEach(cleanup);

  it("reads the layout-seeded value on the first render and makes no request", () => {
    const { client } = renderWithQueryClient(
      <GeneralSettingsSeed value={loaded("Despacho Norte")}>
        <SystemName />
      </GeneralSettingsSeed>,
    );

    expect(screen.getByText("Despacho Norte")).toBeTruthy();
    expect(client.getQueryData(qk.org.general())).toMatchObject({ hasCustom: true });
    expect(mocks.fetchGeneralSettingsAction).not.toHaveBeenCalled();
  });

  it("does not refetch on mount once the seeded value is stale", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(qk.org.general(), loaded("Antiguo"), { updatedAt: Date.now() - 60 * 60_000 });

    renderWithQueryClient(<SystemName />, { client: qc });

    expect(screen.getByText("Antiguo")).toBeTruthy();
    expect(mocks.fetchGeneralSettingsAction).not.toHaveBeenCalled();
  });

  it("keeps a value already in the cache over the seed on the first render", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(qk.org.general(), loaded("Guardado"));

    renderWithQueryClient(
      <GeneralSettingsSeed value={loaded("Guardado")}>
        <SystemName />
      </GeneralSettingsSeed>,
      { client: qc },
    );

    expect(screen.getByText("Guardado")).toBeTruthy();
    expect(mocks.fetchGeneralSettingsAction).not.toHaveBeenCalled();
  });

  it("takes a new layout value (after a layout revalidation)", async () => {
    const view = renderWithQueryClient(
      <GeneralSettingsSeed value={loaded("Antes")}>
        <SystemName />
      </GeneralSettingsSeed>,
    );
    expect(screen.getByText("Antes")).toBeTruthy();

    view.rerender(
      <GeneralSettingsSeed value={loaded("Después")}>
        <SystemName />
      </GeneralSettingsSeed>,
    );

    // Query observers notify on the next tick (notifyManager batching).
    expect(await screen.findByText("Después")).toBeTruthy();
    expect(mocks.fetchGeneralSettingsAction).not.toHaveBeenCalled();
  });

  it("follows setQueryData from a save", async () => {
    const { client } = renderWithQueryClient(
      <GeneralSettingsSeed value={loaded("Antes")}>
        <SystemName />
      </GeneralSettingsSeed>,
    );

    act(() => {
      client.setQueryData(qk.org.general(), loaded("Guardado ahora"));
    });

    expect(await screen.findByText("Guardado ahora")).toBeTruthy();
  });

  it("falls back to the defaults while nothing is cached", () => {
    mocks.fetchGeneralSettingsAction.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SystemName />);

    expect(screen.getByText(GENERAL_SETTINGS_DEFAULTS.system.systemName)).toBeTruthy();
  });
});
