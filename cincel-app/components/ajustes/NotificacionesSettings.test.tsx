// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/ajustes/notificaciones",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import {
  DIGEST_BADGE,
  DIGEST_NOTE,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_KIND_DESCRIPTIONS,
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

const CHANNEL_SUFFIX: Record<string, string> = {
  "En la app": "en la app",
  Correo: "por correo",
  "Resumen diario": "en el resumen diario",
};

/** The matrix switch of one event and channel (column label). */
function box(kind: string, channel: string) {
  return screen.getByRole("switch", { name: `${kind} ${CHANNEL_SUFFIX[channel]}` });
}

function matrixSwitches() {
  return within(screen.getByRole("table")).getAllByRole("switch");
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
  it("returns the 8 kinds in matrix order, defaults for kinds without a row", () => {
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
      "reunion",
    ]);
    expect(filled.rows[1]).toEqual({ kind: "mencion", inApp: false, email: false, digest: true });
    expect(filled.rows[0]).toEqual({ kind: "asignacion", ...NOTIFICATION_DEFAULTS.asignacion });
    expect(filled.quietHours).toBeNull();
  });
});

describe("NotificacionesClient", () => {
  it("loads the 8 kinds × 3 channels with saved values and defaults", () => {
    renderClient();

    expect(matrixSwitches()).toHaveLength(24);
    for (const [key, kind] of Object.entries(NOTIFICATION_KIND_LABELS)) {
      const header = screen.getByRole("rowheader", { name: new RegExp(`^${kind}`) });
      expect(header.textContent).toContain(NOTIFICATION_KIND_DESCRIPTIONS[key as keyof typeof NOTIFICATION_KIND_DESCRIPTIONS]);
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
    expect(screen.getByText(DIGEST_BADGE)).toBeTruthy();
  });

  it("switch labels name event and channel", () => {
    renderClient();
    const names = matrixSwitches().map((el) => el.getAttribute("aria-label"));
    expect(names.slice(0, 3)).toEqual(["Asignación en la app", "Asignación por correo", "Asignación en el resumen diario"]);
    expect(names).toContain("Aprobación del cliente en el resumen diario");
    expect(new Set(names).size).toBe(24);
  });

  it("quiet hours disabled when off", () => {
    renderClient(prefs({ quietHours: null }));
    const toggle = screen.getByRole("switch", { name: "No enviar avisos fuera de horario" });
    expect(isChecked(toggle)).toBe(false);
    expect((screen.getByLabelText("Desde") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(toggle);
    expect((screen.getByLabelText("Desde") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).disabled).toBe(false);
  });

  it("discard restores saved rows", () => {
    renderClient();
    const save = screen.getByRole("button", { name: "Guardar" });
    expect(save.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(box("Mención", "Resumen diario"));
    fireEvent.click(box("Comentario", "Correo"));
    expect(screen.getByText("2 cambios sin guardar")).toBeTruthy();
    expect(save.hasAttribute("aria-disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(isChecked(box("Mención", "Resumen diario"))).toBe(false);
    expect(isChecked(box("Comentario", "Correo"))).toBe(true);
    expect(screen.queryByText(/sin guardar/)).toBeNull();
    expect(updateNotificationPreferencesAction).not.toHaveBeenCalled();
  });

  it("asks before leaving with unsaved changes", async () => {
    renderClient();
    fireEvent.click(box("Mención", "Resumen diario"));
    const link = document.createElement("a");
    link.href = "/ajustes/perfil";
    link.textContent = "Perfil";
    document.body.appendChild(link);

    await act(async () => {
      fireEvent.click(link);
    });

    expect(await screen.findByText("¿Salir sin guardar?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seguir editando" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salir" })).toBeTruthy();
  });

  it("has no Cutto column", () => {
    renderClient();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Evento", ...Object.values(NOTIFICATION_CHANNEL_LABELS)]);
    expect(screen.queryByText(/cutto/i)).toBeNull();
    expect(screen.queryByRole("switch", { name: /cutto/i })).toBeNull();
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
    expect(input.rows).toHaveLength(8);
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
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Cambios guardados"));
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

    fireEvent.click(box("Mención", "Resumen diario"));
    await submit();

    await waitFor(() => expect(screen.getByText(INVALID_COPY)).toBeTruthy());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows a server quiet-hours error under the times, not as the form error", async () => {
    updateNotificationPreferencesAction.mockResolvedValue({ ok: false, error: "INVALID: quietHours" });
    renderClient();

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "23:00" } });
    await submit();

    const hasta = screen.getByLabelText("Hasta");
    await waitFor(() => expect(hasta.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("alert").textContent).toBe(INVALID_COPY);
  });

  it("still handles a thrown error code (old action shape)", async () => {
    updateNotificationPreferencesAction.mockRejectedValue(new Error("INVALID: rows"));
    renderClient();

    fireEvent.click(box("Mención", "Resumen diario"));
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
    for (const control of matrixSwitches()) {
      expect(control.getAttribute("aria-label")).toMatch(/ (en la app|por correo|en el resumen diario)$/);
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
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
