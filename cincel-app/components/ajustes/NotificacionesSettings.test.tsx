// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateNotificationPreferencesAction, toastSuccess } = vi.hoisted(() => ({
  updateNotificationPreferencesAction: vi.fn(),
  toastSuccess: vi.fn(),
}));

const getAjustesNotificacionesPageData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/notifications-actions", () => ({
  updateNotificationPreferencesAction,
  fetchNotificationPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({
  getAjustesAparienciaPageData: vi.fn(),
  getAjustesNotificacionesPageData,
  getAjustesPerfilPageData: vi.fn(),
  getAjustesIntegracionesPageData: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

// Contract-shaped stand-ins for the shared settings patterns (FE §4.11), so this
// test covers the page content on its own.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));
vi.mock("@/components/patterns/SettingsRow", () => ({
  SettingsRow: ({ label, htmlFor, control }: { label: string; htmlFor?: string; control: ReactNode }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {control}
    </div>
  ),
}));

import {
  DIGEST_NOTE,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_KIND_LABELS,
  NotificacionesClient,
} from "@/components/ajustes/NotificacionesClient";
import { NOTIFICATION_DEFAULTS } from "@/lib/notifications/notify";
import { withNotificationDefaults } from "@/lib/notifications/preferences";
import { qk } from "@/lib/query/keys";
import type { AjustesNotificacionesPageData } from "@/lib/query/options/ajustes";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS } from "@/lib/ui/themes";
import type { NotificationPreferences } from "@/lib/types/redesign";

const INVALID_COPY = "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return withNotificationDefaults({
    rows: [{ kind: "comentario", inApp: false, email: true, digest: false }],
    quietHours: { from: "21:00", to: "07:00" },
    ...overrides,
  });
}

/** The client with `qk.ajustes.page('notificaciones')` hydrated, as the page renders it. */
function renderClient(initial: NotificationPreferences = prefs()) {
  const client = createTestQueryClient();
  client.setQueryData<AjustesNotificacionesPageData>(qk.ajustes.page("notificaciones"), { preferences: initial });
  return renderWithQueryClient(<NotificacionesClient />, { client });
}

/** The action's `ActionResult` for a saved input. */
async function savedResult(input: NotificationPreferences) {
  return { ok: true, data: withNotificationDefaults(input) };
}

function box(kind: string, channel: string) {
  return screen.getByRole("checkbox", { name: `${kind} por ${channel}` });
}

function isChecked(el: HTMLElement) {
  return el.getAttribute("aria-checked") === "true" || el.hasAttribute("data-checked");
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
}

beforeEach(() => {
  updateNotificationPreferencesAction.mockReset();
  getAjustesNotificacionesPageData.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("withNotificationDefaults", () => {
  it("returns the 7 kinds in matrix order, defaults for kinds without a row", () => {
    const filled = withNotificationDefaults({
      rows: [{ kind: "mencion", inApp: false, email: false, digest: true }],
      quietHours: null,
    });
    expect(filled.rows.map((r) => r.kind)).toEqual([
      "asignacion",
      "mencion",
      "vencimiento",
      "comentario",
      "aprobacion_cliente",
      "recordatorio",
      "sistema",
    ]);
    expect(filled.rows[1]).toEqual({ kind: "mencion", inApp: false, email: false, digest: true });
    expect(filled.rows[0]).toEqual({ kind: "asignacion", ...NOTIFICATION_DEFAULTS.asignacion });
    expect(filled.quietHours).toBeNull();
  });
});

describe("NotificacionesClient", () => {
  it("loads the 7 kinds × 3 channels with saved values and defaults", () => {
    renderClient();

    expect(screen.getAllByRole("checkbox")).toHaveLength(21);
    for (const kind of Object.values(NOTIFICATION_KIND_LABELS)) {
      expect(screen.getByRole("rowheader", { name: kind })).toBeTruthy();
    }
    // Saved row.
    expect(isChecked(box("Comentario", "En la app"))).toBe(false);
    expect(isChecked(box("Comentario", "Correo"))).toBe(true);
    // Defaults (no stored row).
    expect(isChecked(box("Asignación", "Correo"))).toBe(true);
    expect(isChecked(box("Vencimiento", "Resumen diario"))).toBe(true);
    expect(isChecked(box("Sistema", "Correo"))).toBe(false);

    expect((screen.getByLabelText("Desde") as HTMLInputElement).value).toBe("21:00");
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).value).toBe("07:00");
    expect(screen.getByText(DIGEST_NOTE)).toBeTruthy();
  });

  it("has no Cutto column", () => {
    renderClient();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Evento", ...Object.values(NOTIFICATION_CHANNEL_LABELS)]);
    expect(screen.queryByText(/cutto/i)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /cutto/i })).toBeNull();
  });

  it("saves the edited matrix and quiet hours and shows a toast", async () => {
    updateNotificationPreferencesAction.mockImplementation(savedResult);
    renderClient();

    fireEvent.click(box("Mención", "Resumen diario"));
    fireEvent.click(box("Asignación", "Correo"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "22:30" } });
    await submit();

    expect(updateNotificationPreferencesAction).toHaveBeenCalledTimes(1);
    const input = updateNotificationPreferencesAction.mock.calls[0][0] as NotificationPreferences;
    expect(input.rows).toHaveLength(7);
    expect(input.rows.find((r) => r.kind === "mencion")).toEqual({ kind: "mencion", inApp: true, email: true, digest: true });
    expect(input.rows.find((r) => r.kind === "asignacion")).toEqual({
      kind: "asignacion",
      inApp: true,
      email: false,
      digest: false,
    });
    expect(input.rows.find((r) => r.kind === "comentario")).toEqual({
      kind: "comentario",
      inApp: false,
      email: true,
      digest: false,
    });
    expect(input.quietHours).toEqual({ from: "22:30", to: "07:00" });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Notificaciones guardadas"));
    expect(isChecked(box("Mención", "Resumen diario"))).toBe(true);
  });

  it("sends null quiet hours when the switch is off", async () => {
    updateNotificationPreferencesAction.mockImplementation(savedResult);
    renderClient();

    fireEvent.click(screen.getByRole("switch", { name: "No enviar avisos fuera de horario" }));
    await submit();

    expect(updateNotificationPreferencesAction.mock.calls[0][0].quietHours).toBeNull();
  });

  it("shows the INVALID copy inline for an empty time and does not save", async () => {
    renderClient();

    const hasta = screen.getByLabelText("Hasta");
    fireEvent.change(hasta, { target: { value: "" } });
    await submit();

    expect(updateNotificationPreferencesAction).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(INVALID_COPY);
    expect(hasta.getAttribute("aria-invalid")).toBe("true");
    expect(hasta.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("shows the INVALID copy from the server", async () => {
    updateNotificationPreferencesAction.mockResolvedValue({ ok: false, error: "INVALID: rows" });
    renderClient();

    await submit();

    await waitFor(() => expect(screen.getByText(INVALID_COPY)).toBeTruthy());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows a server quiet-hours error under the times, not as the form error", async () => {
    updateNotificationPreferencesAction.mockResolvedValue({ ok: false, error: "INVALID: quietHours" });
    renderClient();

    await submit();

    const hasta = screen.getByLabelText("Hasta");
    await waitFor(() => expect(hasta.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("alert").textContent).toBe(INVALID_COPY);
  });

  it("still handles a thrown error code (old action shape)", async () => {
    updateNotificationPreferencesAction.mockRejectedValue(new Error("INVALID: rows"));
    renderClient();

    await submit();

    await waitFor(() => expect(screen.getByText(INVALID_COPY)).toBeTruthy());
  });

  it("writes the saved preferences into qk.ajustes.page('notificaciones') and invalidates the preference keys", async () => {
    updateNotificationPreferencesAction.mockImplementation(savedResult);
    const { client } = renderClient();
    client.setQueryData(qk.me.notificationPrefs(), { stale: false });
    client.setQueryData(qk.me.preferences(), { stale: false });

    fireEvent.click(box("Mención", "Resumen diario"));
    await submit();

    await waitFor(() => {
      const data = client.getQueryData<AjustesNotificacionesPageData>(qk.ajustes.page("notificaciones"));
      expect(data?.preferences.rows.find((r) => r.kind === "mencion")?.digest).toBe(true);
    });
    await waitFor(() => expect(client.getQueryState(qk.me.notificationPrefs())?.isInvalidated).toBe(true));
    expect(client.getQueryState(qk.me.preferences())?.isInvalidated).toBe(true);
  });

  it("makes no client page-data call on mount (the data is hydrated)", () => {
    renderClient();
    expect(getAjustesNotificacionesPageData).not.toHaveBeenCalled();
  });

  it("drops an unsaved draft when the page unmounts and mounts again", () => {
    const client = createTestQueryClient();
    client.setQueryData<AjustesNotificacionesPageData>(qk.ajustes.page("notificaciones"), { preferences: prefs() });
    const first = renderWithQueryClient(<NotificacionesClient />, { client });
    fireEvent.click(box("Mención", "Resumen diario"));
    expect(isChecked(box("Mención", "Resumen diario"))).toBe(true);
    first.unmount();

    renderWithQueryClient(<NotificacionesClient />, { client });
    expect(isChecked(box("Mención", "Resumen diario"))).toBe(false);
  });

  it("is keyboard-operable: every control is focusable and labelled", () => {
    renderClient();
    const matrix = screen.getByRole("table");
    for (const checkbox of within(matrix).getAllByRole("checkbox")) {
      expect(checkbox.getAttribute("aria-label")).toMatch(/ por /);
      expect(checkbox.tabIndex).toBeGreaterThanOrEqual(0);
    }
    const toggle = screen.getByRole("switch", { name: "No enviar avisos fuera de horario" });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        document.documentElement.setAttribute("data-theme-id", themeId);
        document.documentElement.setAttribute("data-theme", mode);
        if (mode === "dark") document.documentElement.classList.add("dark");
        renderClient();

        const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual([]);
      });
    }
  }
});
