// @vitest-environment node
/**
 * Primary-calendar writes (Calendario BE §7.3): Meet request, `sendUpdates`,
 * `If-Match`. `fetch` and the token are mocked; Google is never called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google/staff-token", () => ({
  getStaffAccessToken: vi.fn(async () => ({ status: "ok", accessToken: "tok" })),
}));
vi.mock("@/lib/repositories/google-calendar-sync-repository", () => ({
  getCalendarSync: vi.fn(),
  listSyncedEvents: vi.fn(),
}));

import { GoogleCalendarError } from "@/lib/google/calendar-api";
import { deletePrimaryEvent, insertPrimaryEvent, patchPrimaryEvent } from "./google-calendar";

const fetchMock = vi.fn();
const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  const parsed = new URL(url);
  return {
    method: init.method,
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams),
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe("insertPrimaryEvent", () => {
  it("asks for a Meet link with conferenceDataVersion=1 and invites with sendUpdates=all", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "g1", etag: '"e1"', hangoutLink: "https://meet.example/abc" }));
    const created = await insertPrimaryEvent("staff-1", {
      summary: "Revisión",
      attendees: [{ email: "a@example.test" }],
      conferenceData: { createRequest: { requestId: "ev-1", conferenceSolutionKey: { type: "hangoutsMeet" } } },
    });
    const call = lastCall();
    expect(created.id).toBe("g1");
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/calendar/v3/calendars/primary/events");
    expect(call.query).toEqual({ sendUpdates: "all", conferenceDataVersion: "1" });
    expect(call.body.conferenceData.createRequest.requestId).toBe("ev-1");
    // Control fields never travel in the body.
    expect(call.body.sendUpdates).toBeUndefined();
  });

  it("uses sendUpdates=none when the caller says so and no conference query without a Meet request", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "g2" }));
    await insertPrimaryEvent("staff-1", { summary: "Sin Meet", sendUpdates: "none" });
    const call = lastCall();
    expect(call.query).toEqual({ sendUpdates: "none" });
    expect(call.body).toEqual({ summary: "Sin Meet" });
  });
});

describe("patchPrimaryEvent", () => {
  it("sends If-Match with the etag and the chosen sendUpdates", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "g1", etag: '"e2"' }));
    await patchPrimaryEvent("staff-1", "g1", { summary: "Nuevo" }, "none", { ifMatch: '"e1"' });
    const call = lastCall();
    expect(call.method).toBe("PATCH");
    expect(call.query).toEqual({ sendUpdates: "none" });
    expect(call.headers["If-Match"]).toBe('"e1"');
  });

  it("surfaces a 412 as a GoogleCalendarError", async () => {
    fetchMock.mockResolvedValue(reply(412, { error: { message: "Precondition Failed" } }));
    await expect(patchPrimaryEvent("staff-1", "g1", { summary: "x" }, "all", { ifMatch: "old" })).rejects.toMatchObject({
      status: 412,
    });
    await expect(patchPrimaryEvent("staff-1", "g1", { summary: "x" })).rejects.toBeInstanceOf(GoogleCalendarError);
  });
});

describe("deletePrimaryEvent", () => {
  it("cancels for every attendee by default and counts an already-deleted event as deleted", async () => {
    fetchMock.mockResolvedValueOnce(reply(204));
    await deletePrimaryEvent("staff-1", "g1");
    expect(lastCall().method).toBe("DELETE");
    expect(lastCall().query).toEqual({ sendUpdates: "all" });

    fetchMock.mockResolvedValueOnce(reply(410));
    await expect(deletePrimaryEvent("staff-1", "g1", "none")).resolves.toBeUndefined();
    expect(lastCall().query).toEqual({ sendUpdates: "none" });
  });
});
