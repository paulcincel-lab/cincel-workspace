// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithQueryClient } from "@/lib/query/test-utils";

const actions = vi.hoisted(() => ({ retryMeetingSyncAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/actions/calendario-actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { MeetingGoogleNote } from "./MeetingGoogleNote";

const base = { eventId: "11111111-1111-4111-8111-111111111111", source: "cincel" as const, canEdit: true };

describe("MeetingGoogleNote", () => {
  beforeEach(() => {
    actions.retryMeetingSyncAction.mockReset();
    toast.success.mockReset();
  });
  afterEach(cleanup);

  const cases: [string, string, string | null][] = [
    ["NO_GRANT", "Esta reunión solo está en Cincel. La invitación se envió por correo.", "Conectar y crear en Google"],
    ["ACCESS_DENIED", "Tu administrador todavía no habilita Google Calendar para Cincel.", null],
    ["UNAVAILABLE", "Google Calendar no respondió. La invitación se envió por correo; la agregaré a Google en cuanto responda.", "Reintentar ahora"],
    ["RATE_LIMITED", "Google Calendar no respondió. La invitación se envió por correo; la agregaré a Google en cuanto responda.", "Reintentar ahora"],
    ["REAUTH", "Vuelve a conectar Google Calendar para que la reunión se agregue a Google.", "Volver a conectar"],
    ["GONE", "Ya no está en Google Calendar.", "Volver a crear en Google"],
    ["NOT_ORGANIZER", "Solo quien organiza puede actualizar Google Calendar. El cambio quedó en Cincel.", null],
  ];

  it.each(cases)("%s renders its note and action in every variant", (code, note, action) => {
    for (const variant of ["card", "line", "field"] as const) {
      renderWithQueryClient(<MeetingGoogleNote item={{ ...base, syncError: code }} eventsGrant={false} variant={variant} />);
      expect(screen.getByText(note)).toBeTruthy();
      const controls = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")];
      expect(controls.map((c) => c.textContent)).toEqual(action ? [action] : []);
      cleanup();
    }
  });

  it("drops the invitation line when the organizer is the only attendee", () => {
    const item = { ...base, syncError: "NO_GRANT", organizer: { id: "s1", name: "Ana" }, attendees: [{ name: "Ana", staffId: "s1", response: "acepta" as const }] };
    renderWithQueryClient(<MeetingGoogleNote item={item} eventsGrant={false} />);
    expect(screen.getByText("Esta reunión solo está en Cincel.")).toBeTruthy();
    expect(screen.queryByText(/se envió por correo/)).toBeNull();
  });

  it("shows no action to an attendee", () => {
    renderWithQueryClient(<MeetingGoogleNote item={{ ...base, syncError: "UNAVAILABLE", canEdit: false }} eventsGrant />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing when the meeting is in Google", () => {
    const { container } = renderWithQueryClient(<MeetingGoogleNote item={{ ...base, syncError: null }} eventsGrant />);
    expect(container.textContent).toBe("");
  });

  it("retries and says it is in Google Calendar", async () => {
    actions.retryMeetingSyncAction.mockResolvedValue({ ok: true, data: { id: "e:1" } });
    renderWithQueryClient(<MeetingGoogleNote item={{ ...base, syncError: "UNAVAILABLE" }} eventsGrant />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar ahora" }));
    await waitFor(() => expect(actions.retryMeetingSyncAction).toHaveBeenCalledWith(base.eventId));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Ya está en Google Calendar."));
  });

  it("runs the retry instead of the grant once NO_GRANT has the grant", async () => {
    actions.retryMeetingSyncAction.mockResolvedValue({ ok: true, data: { id: "e:1" } });
    renderWithQueryClient(<MeetingGoogleNote item={{ ...base, syncError: "NO_GRANT" }} eventsGrant />);
    fireEvent.click(screen.getByRole("button", { name: "Conectar y crear en Google" }));
    await waitFor(() => expect(actions.retryMeetingSyncAction).toHaveBeenCalledTimes(1));
  });
});
