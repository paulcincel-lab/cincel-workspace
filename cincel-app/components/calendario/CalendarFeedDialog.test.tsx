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

import CalendarFeedDialog, { calendarConnectUrl } from "./CalendarFeedDialog";

const notConnected = {
  oauthAvailable: true,
  mode: "staff_token" as const,
  connectedEmail: null,
  hasCalendarScope: false,
  enabled: false,
  lastSyncedAt: null,
  lastError: null,
};

describe("calendarConnectUrl", () => {
  it("starts the staff calendar consent and returns to /calendario", () => {
    expect(calendarConnectUrl("staff_token", "/calendario?vista=mes")).toBe(
      "/api/auth/google/start?scope=calendar&return_to=/calendario",
    );
  });

  it("keeps the old OAuth flow in delegation mode", () => {
    expect(calendarConnectUrl("delegation", "/calendario?vista=mes")).toBe(
      "/api/google/oauth/start?scope=calendar&return_to=%2Fcalendario%3Fvista%3Dmes",
    );
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
});
