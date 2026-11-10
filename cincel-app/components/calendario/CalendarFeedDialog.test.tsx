// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const actions = vi.hoisted(() => ({
  disableCalendarFeedAction: vi.fn(),
  disableGoogleCalendarSyncAction: vi.fn(),
  enableGoogleCalendarSyncAction: vi.fn(),
  fetchCalendarFeedStatusAction: vi.fn(),
  fetchGoogleCalendarSyncStatusAction: vi.fn(),
  generateCalendarFeedAction: vi.fn(),
  syncGoogleCalendarAction: vi.fn(),
}));

vi.mock("@/lib/actions/calendar-actions", () => actions);

import CalendarFeedDialog, { CALENDAR_CONNECT_URL } from "./CalendarFeedDialog";

const notConnected = {
  oauthAvailable: true,
  mode: "staff_token" as const,
  connectedEmail: null,
  hasCalendarScope: false,
  enabled: false,
  lastSyncedAt: null,
  lastError: null,
};

/** The button once the feed status has loaded (it stays disabled until then). */
async function enabledButton(name: string): Promise<HTMLButtonElement> {
  const button = (await screen.findByRole("button", { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

describe("CALENDAR_CONNECT_URL", () => {
  it("starts the staff calendar consent and returns to /calendario", () => {
    expect(CALENDAR_CONNECT_URL).toBe("/api/auth/google/start?scope=calendar&return_to=/calendario");
    expect(CALENDAR_CONNECT_URL).not.toContain("/api/google/oauth");
  });
});

describe("CalendarFeedDialog", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    actions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: false, url: null });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Conectar Google Calendar without a calendar grant", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Conectar Google Calendar" })).toBeTruthy();
    expect(screen.queryByText(/Conecta tu cuenta de Google/)).toBeNull();
  });

  it("offers Activar sincronización once the consent is granted", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue({
      ...notConnected,
      connectedEmail: "ana@cincel.mx",
      hasCalendarScope: true,
    });
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Activar sincronización" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Google Calendar" })).toBeNull();
  });

  it("offers Reconectar Google Calendar after a sync error, not an account switch", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue({
      ...notConnected,
      connectedEmail: "ana@cincel.mx",
      hasCalendarScope: true,
      enabled: true,
      lastError: "Google rechazó el acceso.",
    });
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Reconectar Google Calendar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reconectar cuenta" })).toBeNull();
  });

  it("does not ask for any status while closed", () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    renderWithQueryClient(<CalendarFeedDialog open={false} onClose={() => {}} />);
    expect(actions.fetchCalendarFeedStatusAction).not.toHaveBeenCalled();
    expect(actions.fetchGoogleCalendarSyncStatusAction).not.toHaveBeenCalled();
  });

  it("reads both statuses from the cache under ajustes.page('integraciones')", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.ajustes.page("integraciones", { part: "calendar", source: "feed" }), { enabled: true });
    client.setQueryData(qk.ajustes.page("integraciones", { part: "calendar", source: "google-sync" }), notConnected);
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />, { client });
    expect(await screen.findByRole("button", { name: "Regenerar enlace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Conectar Google Calendar" })).toBeTruthy();
    expect(actions.fetchCalendarFeedStatusAction).not.toHaveBeenCalled();
    expect(actions.fetchGoogleCalendarSyncStatusAction).not.toHaveBeenCalled();
  });

  it("shows the status error inline when the feed status fails", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    actions.fetchCalendarFeedStatusAction.mockRejectedValue(new Error("boom"));
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByText("No se pudo consultar el estado del enlace.")).toBeTruthy();
  });

  it("generates a link, shows it once and invalidates Integraciones", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    actions.generateCalendarFeedAction.mockImplementation(async () => {
      actions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: true });
      return { token: "secret-token" };
    });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />, { client });

    fireEvent.click(await enabledButton("Crear enlace"));

    const input = (await screen.findByLabelText("Enlace del calendario")) as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/api/calendario/feed/secret-token.ics`);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.ajustes.page("integraciones") });
    });
    expect(await screen.findByRole("button", { name: "Regenerar enlace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeTruthy();
  });

  it("keeps the generate error copy inline", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    actions.generateCalendarFeedAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);
    fireEvent.click(await enabledButton("Crear enlace"));
    expect(await screen.findByText("No se pudo generar el enlace.")).toBeTruthy();
  });

  it("disables the link after confirming and invalidates the same keys", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    actions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: true });
    actions.disableCalendarFeedAction.mockImplementation(async () => {
      actions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: false });
    });
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />, { client });

    fireEvent.click(await screen.findByRole("button", { name: "Desactivar" }));

    expect(await screen.findByRole("button", { name: "Crear enlace" })).toBeTruthy();
    expect(actions.disableCalendarFeedAction).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.ajustes.page("integraciones") });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("syncs now, refetches the sync status and shows the outcome", async () => {
    const enabled = { ...notConnected, connectedEmail: "ana@cincel.mx", hasCalendarScope: true, enabled: true };
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(enabled);
    actions.syncGoogleCalendarAction.mockResolvedValue({ ok: true, result: {} });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />, { client });

    fireEvent.click(await screen.findByRole("button", { name: "Sincronizar ahora" }));

    expect(await screen.findByText("Calendario actualizado.")).toBeTruthy();
    expect(actions.syncGoogleCalendarAction).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.ajustes.page("integraciones") });
    expect(actions.fetchGoogleCalendarSyncStatusAction).toHaveBeenCalledTimes(2);
  });

  it("shows a failed sync outcome with its own message", async () => {
    const enabled = { ...notConnected, connectedEmail: "ana@cincel.mx", hasCalendarScope: true, enabled: true };
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(enabled);
    actions.syncGoogleCalendarAction.mockResolvedValue({ ok: false, error: "Google rechazó el acceso." });
    renderWithQueryClient(<CalendarFeedDialog open onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Sincronizar ahora" }));

    expect(await screen.findByText("Google rechazó el acceso.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconectar Google Calendar" })).toBeTruthy();
  });
});
