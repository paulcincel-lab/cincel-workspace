// @vitest-environment happy-dom
/**
 * Page-scoped Ajustes form stores (Query Migration 9a, #963; zustand.md §2.9):
 * the actions, `reset()` on unmount, and one store per mount (two mounts
 * never share a draft).
 */
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { NotificationPreferences } from "@/lib/types/redesign";

import { IntegracionesUiStoreProvider, createIntegracionesUiStore, useIntegracionesUi } from "./integraciones-ui-store";
import {
  DEFAULT_QUIET_FROM,
  NOTIFICATION_MATRIX_KINDS,
  NotificacionesFormStoreProvider,
  createNotificacionesFormStore,
  notificacionesInput,
  useNotificacionesForm,
} from "./notificaciones-form-store";
import { PerfilFormStoreProvider, createPerfilFormStore, usePerfilForm, usePerfilFormApi } from "./perfil-form-store";

afterEach(() => cleanup());

const PREFS: NotificationPreferences = {
  rows: NOTIFICATION_MATRIX_KINDS.map((kind) => ({ kind, inApp: true, email: false, digest: false })),
  quietHours: null,
};

describe("createNotificacionesFormStore", () => {
  it("seeds the draft from the saved preferences (default times when quiet hours are off)", () => {
    const store = createNotificacionesFormStore(PREFS);
    const s = store.getState();
    expect(s.quietEnabled).toBe(false);
    expect(s.quietFrom).toBe(DEFAULT_QUIET_FROM);
    expect(s.matrix.mencion).toEqual({ inApp: true, email: false, digest: false });
    expect(notificacionesInput(s)).toEqual(PREFS);
  });

  it("edits the draft, clears errors on edit, replaces on save and resets to the last save", () => {
    const store = createNotificacionesFormStore(PREFS);
    store.getState().setTimeError("mal");
    store.getState().setQuietEnabled(true);
    expect(store.getState().timeError).toBeNull();
    store.getState().setChannel("mencion", "digest", true);
    store.getState().setQuietFrom("22:00");
    expect(notificacionesInput(store.getState()).quietHours).toEqual({ from: "22:00", to: "08:00" });

    const saved: NotificationPreferences = { ...notificacionesInput(store.getState()) };
    store.getState().replace(saved);
    store.getState().setChannel("sistema", "email", true);
    store.getState().reset();
    expect(notificacionesInput(store.getState())).toEqual(saved);
  });
});

describe("createPerfilFormStore", () => {
  it("sets fields, field errors and commits a save as the new reset target", () => {
    const store = createPerfilFormStore({ name: "Ana", phone: "", emailSignature: "" });
    store.getState().setFieldError("name", "Escribe tu nombre.");
    store.getState().setField("name", "Ana María");
    expect(store.getState().errors.name).toBeUndefined();
    store.getState().commit({ name: "Ana María", phone: "", emailSignature: "" });
    store.getState().setField("phone", "555");
    store.getState().reset();
    expect(store.getState().draft).toEqual({ name: "Ana María", phone: "", emailSignature: "" });
    expect(store.getState().saved.name).toBe("Ana María");
  });
});

describe("createIntegracionesUiStore", () => {
  it("opens the dialog, keeps errors and resets everything", () => {
    const store = createIntegracionesUiStore();
    store.getState().setDisconnectOpen(true);
    store.getState().setSyncError("x");
    store.getState().setDisconnectError("y");
    store.getState().reset();
    expect(store.getState()).toMatchObject({ disconnectOpen: false, syncError: null, disconnectError: null });
  });
});

function NameField({ testId }: { testId: string }) {
  const name = usePerfilForm((s) => s.draft.name);
  const setField = usePerfilForm((s) => s.setField);
  return <input aria-label={testId} value={name} onChange={(e) => setField("name", e.target.value)} />;
}

describe("page-scoped providers", () => {
  it("two mounts never share a draft", () => {
    render(
      <>
        <PerfilFormStoreProvider initial={{ name: "Ana", phone: "", emailSignature: "" }}>
          <NameField testId="uno" />
        </PerfilFormStoreProvider>
        <PerfilFormStoreProvider initial={{ name: "Ana", phone: "", emailSignature: "" }}>
          <NameField testId="dos" />
        </PerfilFormStoreProvider>
      </>,
    );
    fireEvent.change(screen.getByLabelText("uno"), { target: { value: "Cambio" } });
    expect((screen.getByLabelText("uno") as HTMLInputElement).value).toBe("Cambio");
    expect((screen.getByLabelText("dos") as HTMLInputElement).value).toBe("Ana");
  });

  it("leaving the page and coming back resets the draft", () => {
    const tree = (
      <PerfilFormStoreProvider initial={{ name: "Ana", phone: "", emailSignature: "" }}>
        <NameField testId="nombre" />
      </PerfilFormStoreProvider>
    );
    const first = render(tree);
    fireEvent.change(screen.getByLabelText("nombre"), { target: { value: "Borrador" } });
    first.unmount();

    render(tree);
    expect((screen.getByLabelText("nombre") as HTMLInputElement).value).toBe("Ana");
  });

  it("runs reset() on unmount", () => {
    const holder: { api: ReturnType<typeof usePerfilFormApi> | null } = { api: null };
    function Grab() {
      const api = usePerfilFormApi();
      useEffect(() => {
        holder.api = api;
      }, [api]);
      return null;
    }
    const view = render(
      <PerfilFormStoreProvider initial={{ name: "Ana", phone: "", emailSignature: "" }}>
        <Grab />
      </PerfilFormStoreProvider>,
    );
    act(() => holder.api!.getState().setField("name", "Borrador"));
    view.unmount();
    expect(holder.api!.getState().draft.name).toBe("Ana");
  });

  it("the Notificaciones and Integraciones providers serve their own stores", () => {
    function Matrix() {
      return <p data-testid="quiet">{String(useNotificacionesForm((s) => s.quietEnabled))}</p>;
    }
    function Dialog() {
      return <p data-testid="open">{String(useIntegracionesUi((s) => s.disconnectOpen))}</p>;
    }
    render(
      <NotificacionesFormStoreProvider initial={{ ...PREFS, quietHours: { from: "21:00", to: "07:00" } }}>
        <IntegracionesUiStoreProvider>
          <Matrix />
          <Dialog />
        </IntegracionesUiStoreProvider>
      </NotificacionesFormStoreProvider>,
    );
    expect(screen.getByTestId("quiet").textContent).toBe("true");
    expect(screen.getByTestId("open").textContent).toBe("false");
  });

  it("a hook outside its provider throws", () => {
    function Orphan() {
      usePerfilForm((s) => s.draft);
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/usePerfilForm must be used inside its provider/);
  });
});
