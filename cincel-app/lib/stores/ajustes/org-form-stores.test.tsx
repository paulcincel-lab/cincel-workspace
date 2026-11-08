// @vitest-environment happy-dom
/**
 * The page-scoped form stores of Ajustes › General and Control de horario
 * (Phase 9c, decision D3): one store per mount, never shared between mounts,
 * reset on unmount; the saved data stays in TanStack Query.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { StoreApi } from "zustand";

import { buildDefaultGeneralSettings, type GeneralSettings } from "@/lib/settings/general-settings";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

import {
  createGeneralFormStore,
  GeneralFormStoreProvider,
  useGeneralForm,
  useGeneralFormApi,
  type GeneralFormState,
} from "./general-form-store";
import {
  createHorarioFormStore,
  HorarioFormStoreProvider,
  useHorarioForm,
  useHorarioFormApi,
  type HorarioFormInitial,
  type HorarioFormState,
} from "./horario-form-store";

afterEach(() => cleanup());

function settings(): GeneralSettings {
  return buildDefaultGeneralSettings();
}

function horarioInitial(patch: Partial<TimeTrackingSettings> = {}): HorarioFormInitial {
  return {
    draft: { ...DEFAULT_TIME_TRACKING_SETTINGS, workDays: [...DEFAULT_TIME_TRACKING_SETTINGS.workDays], ...patch },
    weekStart: "2026-11-02",
    today: "2026-11-05",
    viewerName: "Ana",
  };
}

describe("createGeneralFormStore", () => {
  it("edits the draft per section and resets to the last saved settings", () => {
    const store = createGeneralFormStore(settings());
    store.getState().setCompanyField("tradeName", "Cincel Studio");
    store.getState().setRegionalField("weekStartsOn", "monday");
    store.getState().setError("No se pudo guardar");
    expect(store.getState().settings.company.tradeName).toBe("Cincel Studio");

    store.getState().reset();
    expect(store.getState().settings).toEqual(settings());
    expect(store.getState().error).toBeNull();
  });

  it("replace() makes the saved settings the new reset target", () => {
    const store = createGeneralFormStore(settings());
    const saved = { ...settings(), company: { ...settings().company, tradeName: "Guardado" } };
    store.getState().pickUpLegacy(saved);
    expect(store.getState().pickedUpLegacy).toBe(true);

    store.getState().replace(saved);
    expect(store.getState().pickedUpLegacy).toBe(false);
    store.getState().setCompanyField("tradeName", "Otro");
    store.getState().reset();
    expect(store.getState().settings.company.tradeName).toBe("Guardado");
  });
});

describe("createHorarioFormStore", () => {
  it("merges patches into the draft, clears the form error, and resets draft and week", () => {
    const store = createHorarioFormStore(horarioInitial());
    store.getState().setError("form", "Falló");
    store.getState().setField({ hoursPerDay: 6 });
    expect(store.getState().draft.hoursPerDay).toBe(6);
    expect(store.getState().errors.form).toBeUndefined();

    store.getState().setWeekStart("2026-10-26");
    store.getState().reset();
    expect(store.getState().draft.hoursPerDay).toBe(DEFAULT_TIME_TRACKING_SETTINGS.hoursPerDay);
    expect(store.getState().weekStart).toBe("2026-11-02");
  });

  it("replace() keeps the saved settings as the reset target", () => {
    const store = createHorarioFormStore(horarioInitial());
    store.getState().replace({ ...horarioInitial().draft, enabled: true });
    store.getState().setField({ enabled: false });
    store.getState().reset();
    expect(store.getState().draft.enabled).toBe(true);
  });
});

/** Captures the store of the provider it renders in, and shows one field. */
function GeneralProbe({ onStore }: { onStore(store: StoreApi<GeneralFormState>): void }) {
  onStore(useGeneralFormApi());
  return <span data-testid="trade">{useGeneralForm((s) => s.settings.company.tradeName)}</span>;
}

function HorarioProbe({ id, onStore }: { id: string; onStore(store: StoreApi<HorarioFormState>): void }) {
  onStore(useHorarioFormApi());
  return <span data-testid={`hours-${id}`}>{useHorarioForm((s) => s.draft.hoursPerDay)}</span>;
}

describe("page-scoped providers", () => {
  it("General: two mounts never share a draft", () => {
    const stores: StoreApi<GeneralFormState>[] = [];
    render(
      <>
        <GeneralFormStoreProvider initial={settings()}>
          <GeneralProbe onStore={(store) => (stores[0] = store)} />
        </GeneralFormStoreProvider>
        <GeneralFormStoreProvider initial={settings()}>
          <GeneralProbe onStore={(store) => (stores[1] = store)} />
        </GeneralFormStoreProvider>
      </>,
    );
    expect(stores[0]).not.toBe(stores[1]);
    act(() => stores[0].getState().setCompanyField("tradeName", "Solo el primero"));
    const [first, second] = screen.getAllByTestId("trade");
    expect(first.textContent).toBe("Solo el primero");
    expect(second.textContent).toBe(settings().company.tradeName);
  });

  it("General: unmounting drops the draft; a new mount starts from the saved settings", () => {
    let store: StoreApi<GeneralFormState> | null = null;
    const page = () => (
      <GeneralFormStoreProvider initial={settings()}>
        <GeneralProbe onStore={(s) => (store = s)} />
      </GeneralFormStoreProvider>
    );
    const { unmount } = render(page());
    const first = store as unknown as StoreApi<GeneralFormState>;
    act(() => first.getState().setCompanyField("tradeName", "Borrador"));
    unmount();
    expect(first.getState().settings.company.tradeName).toBe(settings().company.tradeName);

    render(page());
    expect(store).not.toBe(first);
    expect(screen.getByTestId("trade").textContent).toBe(settings().company.tradeName);
  });

  it("Horario: isolated per mount and reset on unmount", () => {
    const stores: Record<string, StoreApi<HorarioFormState>> = {};
    const { unmount } = render(
      <>
        <HorarioFormStoreProvider initial={horarioInitial()}>
          <HorarioProbe id="a" onStore={(store) => (stores.a = store)} />
        </HorarioFormStoreProvider>
        <HorarioFormStoreProvider initial={horarioInitial({ hoursPerDay: 7 })}>
          <HorarioProbe id="b" onStore={(store) => (stores.b = store)} />
        </HorarioFormStoreProvider>
      </>,
    );
    act(() => {
      stores.a.getState().setField({ hoursPerDay: 5 });
      stores.a.getState().setWeekStart("2026-10-19");
    });
    expect(screen.getByTestId("hours-a").textContent).toBe("5");
    expect(screen.getByTestId("hours-b").textContent).toBe("7");
    expect(stores.b.getState().weekStart).toBe("2026-11-02");

    unmount();
    expect(stores.a.getState().draft.hoursPerDay).toBe(DEFAULT_TIME_TRACKING_SETTINGS.hoursPerDay);
    expect(stores.a.getState().weekStart).toBe("2026-11-02");
  });
});
