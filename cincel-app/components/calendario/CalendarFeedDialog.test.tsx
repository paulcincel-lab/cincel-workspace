// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
  afterEach(cleanup);

  it("shows Conectar Google Calendar without a calendar grant", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue(notConnected);
    render(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Conectar Google Calendar" })).toBeTruthy();
    expect(screen.queryByText(/Conecta tu cuenta de Google/)).toBeNull();
  });

  it("offers Activar sincronización once the consent is granted", async () => {
    actions.fetchGoogleCalendarSyncStatusAction.mockResolvedValue({
      ...notConnected,
      connectedEmail: "ana@cincel.mx",
      hasCalendarScope: true,
    });
    render(<CalendarFeedDialog open onClose={() => {}} />);
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
    render(<CalendarFeedDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Reconectar Google Calendar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reconectar cuenta" })).toBeNull();
  });
});
