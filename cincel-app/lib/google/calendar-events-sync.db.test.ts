// @vitest-environment node
/**
 * Primary-calendar cache, meeting write-through and free/busy against a real
 * Postgres (Calendario BE §7). Runs only when TEST_DATABASE_URL points at a
 * migrated database. `fetch` and the access token are mocked; Google is never
 * called. Rows carry a per-run marker and are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/google/staff-token", () => ({
  getStaffAccessToken: vi.fn(async () => ({ status: "ok", accessToken: "tok" })),
}));

// The repository body of the meetings issue is not part of this test: the sync state is stored directly.
vi.mock("@/lib/repositories/calendar-events-repository", async () => {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const { calendarEvents } = await import("@/lib/db/schema");
  return {
    setGoogleSyncState: async (
      eventId: string,
      state: { googleEventId?: string | null; etag?: string | null; htmlLink?: string | null; meetUrl?: string | null; error: string | null },
    ) => {
      await db
        .update(calendarEvents)
        .set({
          googleSyncError: state.error,
          ...(state.googleEventId !== undefined ? { googleEventId: state.googleEventId } : {}),
          ...(state.etag !== undefined ? { googleEtag: state.etag } : {}),
          ...(state.htmlLink !== undefined ? { googleHtmlLink: state.htmlLink } : {}),
          ...(state.meetUrl !== undefined ? { meetUrl: state.meetUrl } : {}),
        })
        .where(eq(calendarEvents.id, eventId));
    },
  };
});

const run = randomUUID().slice(0, 8);
const sleep = () => Promise.resolve();
const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

describe.skipIf(!url)("calendar-events-sync (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const sync = await import("./calendar-events-sync");
  const syncRepository = await import("@/lib/repositories/google-calendar-sync-repository");

  const staffIds: string[] = [];
  const eventIds: string[] = [];
  const fetchMock = vi.fn();
  let n = 0;

  async function person(email?: string) {
    n += 1;
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Cal ${run} ${n}`, email: email ?? `cal-${run}-${n}@example.test` })
      .returning({ id: schema.staff.id, email: schema.staff.email });
    staffIds.push(row.id);
    return row as { id: string; email: string };
  }

  const calls = () =>
    fetchMock.mock.calls.map(([u, init]) => {
      const parsed = new URL(u as string);
      const i = init as RequestInit;
      return {
        method: i.method as string,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams) as Record<string, string>,
        headers: (i.headers ?? {}) as Record<string, string>,
        body: i.body ? JSON.parse(i.body as string) : undefined,
      };
    });

  const cached = (ownerId: string) =>
    db
      .select()
      .from(schema.calendarEvents)
      .where(and(eq(schema.calendarEvents.source, "google"), eq(schema.calendarEvents.ownerStaffId, ownerId)));

  async function meeting(organizerId: string, extra: Partial<typeof schema.calendarEvents.$inferInsert> = {}) {
    const [row] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        organizerId,
        title: `Reunión ${run}`,
        startsAt: new Date(Date.now() + 2 * 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000),
        invitesVia: "google",
        ...extra,
      })
      .returning();
    eventIds.push(row.id);
    return row;
  }

  const meetingRow = async (id: string) =>
    (await db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, id)))[0];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (eventIds.length) await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, eventIds));
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  describe("refreshPrimaryEvents", () => {
    it("first sync reads the window, skips Cincel-owned and cancelled events and keeps the sync token", async () => {
      const owner = await person();
      const other = await person();
      const own = await meeting(owner.id, { googleEventId: `own-${run}` });
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          items: [
            {
              id: `a-${run}`,
              summary: "Del calendario",
              etag: '"1"',
              htmlLink: "https://calendar.example/a",
              start: { dateTime: "2026-11-12T16:00:00Z" },
              end: { dateTime: "2026-11-12T17:00:00Z" },
              hangoutLink: "https://meet.example/a",
              attendees: [{ email: other.email, responseStatus: "accepted" }, { email: `ext-${run}@outside.test` }],
            },
            { id: own.googleEventId, summary: "Ya es de Cincel", start: { dateTime: "2026-11-13T16:00:00Z" }, end: { dateTime: "2026-11-13T17:00:00Z" } },
            { id: `x-${run}`, status: "cancelled" },
          ],
          nextSyncToken: "sync-1",
        }),
      );

      const result = await sync.refreshPrimaryEvents(owner.id, { now: new Date("2026-11-11T12:00:00Z"), sleep });
      expect(result).toMatchObject({ upserted: 1, deleted: 0 });

      const rows = await cached(owner.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "Del calendario", meetUrl: "https://meet.example/a", googleEtag: '"1"', googleCalendarId: "primary" });
      const attendees = await db.select().from(schema.calendarEventAttendees).where(eq(schema.calendarEventAttendees.eventId, rows[0].id));
      expect(attendees.find((a) => a.email === other.email.toLowerCase())).toMatchObject({ staffId: other.id, response: "acepta" });
      expect(attendees.find((a) => a.email.startsWith("ext-"))?.staffId).toBeNull();

      const [first] = calls();
      expect(first.path).toBe("/calendar/v3/calendars/primary/events");
      expect(first.query).toMatchObject({ singleEvents: "true" });
      expect(first.query.timeMin).toBeTruthy();
      expect(await syncRepository.getPrimarySyncState(owner.id)).toMatchObject({ syncToken: "sync-1", error: null });
      // Other people's caches are untouched.
      expect(await cached(other.id)).toHaveLength(0);
    });

    it("skips a fresh cache and refreshes when forced", async () => {
      const owner = await person();
      const now = new Date("2026-11-11T12:00:00Z");
      fetchMock.mockResolvedValue(reply(200, { items: [], nextSyncToken: "t" }));
      await sync.refreshPrimaryEvents(owner.id, { now, sleep });
      fetchMock.mockClear();

      expect(await sync.refreshPrimaryEvents(owner.id, { now: new Date(now.getTime() + 60_000), sleep })).toEqual({ skipped: "fresh" });
      expect(fetchMock).not.toHaveBeenCalled();
      await sync.refreshPrimaryEvents(owner.id, { now: new Date(now.getTime() + 60_000), force: true, sleep });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("incremental sync sends the token and applies changes and cancellations", async () => {
      const owner = await person();
      const now = new Date("2026-11-11T12:00:00Z");
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          items: [
            { id: `k-${run}`, summary: "Se queda", start: { dateTime: "2026-11-12T16:00:00Z" }, end: { dateTime: "2026-11-12T17:00:00Z" } },
            { id: `d-${run}`, summary: "Se cancela", start: { dateTime: "2026-11-12T18:00:00Z" }, end: { dateTime: "2026-11-12T19:00:00Z" } },
          ],
          nextSyncToken: "sync-a",
        }),
      );
      await sync.refreshPrimaryEvents(owner.id, { now, sleep });
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          items: [
            { id: `k-${run}`, summary: "Se queda, renombrada", start: { dateTime: "2026-11-12T16:00:00Z" }, end: { dateTime: "2026-11-12T17:00:00Z" } },
            { id: `d-${run}`, status: "cancelled" },
          ],
          nextSyncToken: "sync-b",
        }),
      );

      const later = new Date(now.getTime() + 10 * 60_000);
      expect(await sync.refreshPrimaryEvents(owner.id, { now: later, sleep })).toMatchObject({ upserted: 1, deleted: 1 });
      expect(calls()[0].query.syncToken).toBe("sync-a");
      expect(calls()[0].query.timeMin).toBeUndefined();
      expect((await cached(owner.id)).map((r) => r.title)).toEqual(["Se queda, renombrada"]);
      expect((await syncRepository.getPrimarySyncState(owner.id))?.syncToken).toBe("sync-b");
    });

    it("a 410 resets the token and re-reads the window, dropping what is gone", async () => {
      const owner = await person();
      const now = new Date("2026-11-11T12:00:00Z");
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          items: [{ id: `g-${run}`, summary: "Desaparece", start: { dateTime: "2026-11-12T16:00:00Z" }, end: { dateTime: "2026-11-12T17:00:00Z" } }],
          nextSyncToken: "old",
        }),
      );
      await sync.refreshPrimaryEvents(owner.id, { now, sleep });
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(reply(410, { error: { message: "Gone" } }));
      fetchMock.mockResolvedValueOnce(reply(200, { items: [], nextSyncToken: "new" }));

      await sync.refreshPrimaryEvents(owner.id, { now: new Date(now.getTime() + 10 * 60_000), sleep });
      const [incremental, full] = calls();
      expect(incremental.query.syncToken).toBe("old");
      expect(full.query.timeMin).toBeTruthy();
      expect(full.query.syncToken).toBeUndefined();
      expect(await cached(owner.id)).toHaveLength(0);
      expect((await syncRepository.getPrimarySyncState(owner.id))?.syncToken).toBe("new");
    });

    it("keeps the cache and stores the error when Google is down", async () => {
      const owner = await person();
      fetchMock.mockResolvedValue(reply(503, { error: { message: "down" } }));
      await expect(sync.refreshPrimaryEvents(owner.id, { now: new Date("2026-11-11T12:00:00Z"), sleep })).rejects.toThrow("GOOGLE_UNAVAILABLE");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await syncRepository.getPrimarySyncState(owner.id)).toMatchObject({ error: "UNAVAILABLE" });
    });

    it("a revoked token is reported as REAUTH", async () => {
      const owner = await person();
      fetchMock.mockResolvedValue(reply(401, { error: { message: "Invalid Credentials" } }));
      await expect(sync.refreshPrimaryEvents(owner.id, { now: new Date("2026-11-11T12:00:00Z"), sleep })).rejects.toThrow("GOOGLE_REAUTH");
      expect(await syncRepository.getPrimarySyncState(owner.id)).toMatchObject({ error: "REAUTH" });
    });
  });

  describe("writeMeetingToGoogle", () => {
    it("creates the event with a Meet request and invitations, and stores the Google ids", async () => {
      const organizer = await person();
      const guest = await person();
      const row = await meeting(organizer.id);
      await db.insert(schema.calendarEventAttendees).values({ eventId: row.id, staffId: guest.id, email: guest.email, name: "Invitada" });
      fetchMock.mockResolvedValueOnce(
        reply(200, { id: `ge-${run}`, etag: '"e1"', htmlLink: "https://calendar.example/ge", hangoutLink: "https://meet.example/ge" }),
      );

      const outcome = await sync.writeMeetingToGoogle(row.id, "create", { sleep });
      expect(outcome).toMatchObject({ ok: true, googleEventId: `ge-${run}`, meetUrl: "https://meet.example/ge" });
      const [call] = calls();
      expect(call.method).toBe("POST");
      expect(call.query).toEqual({ sendUpdates: "all", conferenceDataVersion: "1" });
      expect(call.body.conferenceData.createRequest.requestId).toBe(row.id);
      expect(call.body.attendees).toEqual([{ email: guest.email.toLowerCase() }]);
      expect(await meetingRow(row.id)).toMatchObject({ googleEventId: `ge-${run}`, googleEtag: '"e1"', googleSyncError: null, meetUrl: "https://meet.example/ge" });
    });

    it("a Google failure keeps the meeting with google_sync_error and counts the try", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id);
      fetchMock.mockResolvedValue(reply(503, { error: { message: "down" } }));

      expect(await sync.writeMeetingToGoogle(row.id, "create", { sleep })).toEqual({ ok: false, error: "UNAVAILABLE" });
      expect(await meetingRow(row.id)).toMatchObject({ googleSyncError: "UNAVAILABLE", googleSyncAttempts: 1, deletedAt: null, status: "confirmada" });
    });

    it("a meeting saved during an outage gets its Google event on the resync with sendUpdates=none", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { invitesVia: "cincel", googleSyncError: "UNAVAILABLE", googleSyncAttempts: 1 });
      fetchMock.mockResolvedValueOnce(reply(200, { id: `re-${run}`, etag: '"r1"' }));

      const { dueMeetingResyncs } = await import("@/lib/cron/jobs/calendar-meetings-resync");
      expect(await dueMeetingResyncs(db, new Date())).toContain(row.id);

      expect(await sync.writeMeetingToGoogle(row.id, "retry", { sleep })).toMatchObject({ ok: true, googleEventId: `re-${run}` });
      expect(calls()[0].query.sendUpdates).toBe("none");
      expect(await meetingRow(row.id)).toMatchObject({ googleSyncError: null, googleSyncAttempts: 0 });
      expect(await dueMeetingResyncs(db, new Date())).not.toContain(row.id);
    });

    it("stops resyncing after 3 tries", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { googleSyncError: "UNAVAILABLE", googleSyncAttempts: 3 });
      const { dueMeetingResyncs } = await import("@/lib/cron/jobs/calendar-meetings-resync");
      expect(await dueMeetingResyncs(db, new Date())).not.toContain(row.id);
    });

    it("patches with If-Match and retries once on 412 after re-reading the event", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { googleEventId: `p-${run}`, googleEtag: '"old"' });
      fetchMock
        .mockResolvedValueOnce(reply(412, { error: { message: "Precondition Failed" } }))
        .mockResolvedValueOnce(reply(200, { id: `p-${run}`, etag: '"fresh"', start: { dateTime: "2026-11-20T16:00:00Z" } }))
        .mockResolvedValueOnce(reply(200, { id: `p-${run}`, etag: '"after"' }));

      const outcome = await sync.writeMeetingToGoogle(row.id, "update", { patch: { title: "Nuevo título" }, sleep });
      expect(outcome).toMatchObject({ ok: true, etag: '"after"' });
      const [first, reread, second] = calls();
      expect(first.headers["If-Match"]).toBe('"old"');
      expect(reread.method).toBe("GET");
      expect(second.headers["If-Match"]).toBe('"fresh"');
      expect(second.body).toEqual({ summary: "Nuevo título" });
      expect(await meetingRow(row.id)).toMatchObject({ googleEtag: '"after"', googleSyncError: null });
    });

    it("gives up with CONFLICT after a second 412 without marking the meeting", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { googleEventId: `c-${run}`, googleEtag: '"old"' });
      fetchMock
        .mockResolvedValueOnce(reply(412, { error: { message: "Precondition Failed" } }))
        .mockResolvedValueOnce(reply(200, { id: `c-${run}`, etag: '"fresh"', start: { dateTime: "2026-11-20T16:00:00Z" } }))
        .mockResolvedValueOnce(reply(412, { error: { message: "Precondition Failed" } }));
      expect(await sync.writeMeetingToGoogle(row.id, "update", { patch: { title: "x" }, sleep })).toEqual({ ok: false, error: "CONFLICT" });
      expect((await meetingRow(row.id)).googleSyncError).toBeNull();
    });

    it("cancel deletes with sendUpdates=all", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { googleEventId: `x-${run}`, googleEtag: '"e"' });
      fetchMock.mockResolvedValueOnce(reply(204));
      expect(await sync.writeMeetingToGoogle(row.id, "cancel", { sleep })).toMatchObject({ ok: true });
      expect(calls()[0]).toMatchObject({ method: "DELETE", query: { sendUpdates: "all" } });
    });

    it("marks a vanished event GONE and recreates it quietly on retry", async () => {
      const organizer = await person();
      const row = await meeting(organizer.id, { googleEventId: `v-${run}`, googleEtag: '"e"' });
      fetchMock.mockResolvedValueOnce(reply(404, { error: { message: "Not Found" } }));
      expect(await sync.writeMeetingToGoogle(row.id, "update", { patch: { title: "y" }, sleep })).toEqual({ ok: false, error: "GONE" });
      expect((await meetingRow(row.id)).googleSyncError).toBe("GONE");

      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(reply(200, { id: `v2-${run}`, etag: '"n"' }));
      await sync.writeMeetingToGoogle(row.id, "retry", { sleep });
      expect(calls()[0]).toMatchObject({ method: "POST", query: { sendUpdates: "none" } });
      expect(await meetingRow(row.id)).toMatchObject({ googleEventId: `v2-${run}`, googleSyncError: null });
    });

    it("only the organizer writes to Google", async () => {
      const organizer = await person();
      const admin = await person();
      const row = await meeting(organizer.id);
      expect(await sync.writeMeetingToGoogle(row.id, "update", { actorId: admin.id, patch: { title: "z" }, sleep })).toEqual({
        ok: false,
        error: "NOT_ORGANIZER",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await meetingRow(row.id)).googleSyncError).toBe("NOT_ORGANIZER");
    });
  });

  describe("freeBusy", () => {
    it("returns Google busy times merged with Cincel meetings and reports unknown emails", async () => {
      const caller = await person();
      const colleague = await person();
      const organizer = await person();
      const start = new Date("2026-11-17T16:00:00Z");
      const row = await meeting(organizer.id, { startsAt: start, endsAt: new Date(start.getTime() + 3_600_000) });
      await db.insert(schema.calendarEventAttendees).values({ eventId: row.id, staffId: colleague.id, email: colleague.email, name: "Colega" });
      const outside = `afuera-${run}@outside.test`;
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          calendars: {
            [colleague.email.toLowerCase()]: { busy: [{ start: "2026-11-17T15:00:00Z", end: "2026-11-17T16:30:00Z" }] },
            [outside]: { errors: [{ reason: "notFound" }] },
          },
        }),
      );

      const result = await sync.freeBusy(caller.id, [colleague.email, outside], "2026-11-17T14:00:00Z", "2026-11-18T14:00:00Z", { sleep });
      expect(result.unknown).toEqual([outside]);
      const busy = result.busy[colleague.email.toLowerCase()];
      // Google 15:00-16:30 and the Cincel meeting 16:00-17:00 become one block.
      expect(busy).toContainEqual({ start: "2026-11-17T15:00:00Z", end: "2026-11-17T17:00:00.000Z" });
      expect(result.busy[outside]).toEqual([]);
      const [call] = calls();
      expect(call).toMatchObject({ method: "POST", path: "/calendar/v3/freeBusy" });
      expect(call.body.items).toEqual([{ id: colleague.email.toLowerCase() }, { id: outside }]);
    });

    it("rejects more than 20 emails and ranges over 31 days", async () => {
      const caller = await person();
      const many = Array.from({ length: 21 }, (_, i) => `p${i}-${run}@example.test`);
      await expect(sync.freeBusy(caller.id, many, "2026-11-17T00:00:00Z", "2026-11-18T00:00:00Z")).rejects.toThrow("INVALID");
      await expect(sync.freeBusy(caller.id, ["a@example.test"], "2026-11-01T00:00:00Z", "2026-12-15T00:00:00Z")).rejects.toThrow("RANGE_TOO_LONG");
    });
  });
});
