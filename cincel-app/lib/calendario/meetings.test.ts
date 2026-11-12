import { beforeEach, describe, expect, it, vi } from "vitest";

import { CancelMeetingOptsSchema, MeetingDraftSchema, UpdateMeetingInputSchema } from "@/lib/validation/calendario";

const ORGANIZER = "11111111-1111-4111-8111-111111111111";
const GUEST = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";

const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/email", () => mail);

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => notifications);

vi.mock("@/lib/db/client", () => ({ db: {} }));

const google = vi.hoisted(() => ({ writeMeetingToGoogle: vi.fn() }));
vi.mock("@/lib/google/calendar-events-sync", () => google);

const repo = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  getEventItem: vi.fn(),
  getEventForNotice: vi.fn(),
  setInvitesVia: vi.fn(),
}));
vi.mock("@/lib/repositories/calendar-events-repository", () => repo);

import { cancelMeeting, createMeeting, createMeetingRateLimiter, updateMeeting, whenText } from "./meetings";

const user = {
  member: { id: ORGANIZER, name: "Ana Pérez" },
  email: "ana@cincel.test",
  access: "Colaborador",
} as never;

const draft = {
  title: "Revisión de planos",
  start: "2026-11-12T10:00:00-06:00",
  end: "2026-11-12T11:00:00-06:00",
  projectId: null,
  location: "Sala 2",
  meet: true,
  attendees: [{ staffId: GUEST, email: "luis@cincel.test", name: "Luis Gómez" }],
};

function noticeData(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT,
    source: "cincel",
    status: "confirmada",
    title: "Revisión de planos",
    startsAt: new Date("2026-11-12T16:00:00Z"),
    endsAt: new Date("2026-11-12T17:00:00Z"),
    timeZone: "America/Mexico_City",
    location: "Sala 2",
    description: null,
    meetUrl: null,
    projectId: null,
    organizerId: ORGANIZER,
    invitesVia: "google",
    googleEventId: "g1",
    googleEtag: "e1",
    googleSyncError: null,
    attendees: [
      { staffId: ORGANIZER, contactId: null, email: "ana@cincel.test", name: "Ana Pérez", isOrganizer: true },
      { staffId: GUEST, contactId: null, email: "luis@cincel.test", name: "Luis Gómez", isOrganizer: false },
      { staffId: null, contactId: null, email: "cliente@example.test", name: "Cliente", isOrganizer: false },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createMeetingRateLimiter.reset();
  process.env.APP_ORIGIN = "https://app.cincel.test";
  mail.sendMail.mockResolvedValue({ sent: true });
  notifications.notify.mockResolvedValue({ created: 1 });
  repo.createEvent.mockResolvedValue({});
  repo.getEventItem.mockResolvedValue({ eventId: EVENT, source: "cincel", canEdit: true });
  repo.getEventForNotice.mockResolvedValue(noticeData());
  repo.updateEvent.mockResolvedValue({});
});

describe("meeting input limits", () => {
  it("accepts a normal meeting", () => {
    expect(MeetingDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects a title over 200 characters and an empty one", () => {
    expect(MeetingDraftSchema.safeParse({ ...draft, title: "x".repeat(201) }).success).toBe(false);
    expect(MeetingDraftSchema.safeParse({ ...draft, title: "  " }).success).toBe(false);
  });

  it("rejects an end that is not after the start", () => {
    expect(MeetingDraftSchema.safeParse({ ...draft, end: draft.start }).success).toBe(false);
    expect(MeetingDraftSchema.safeParse({ ...draft, end: "2026-11-12T09:00:00-06:00" }).success).toBe(false);
  });

  it("allows 50 attendees and rejects 51", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `p${i}@example.test`, name: `P ${i}` }));
    expect(MeetingDraftSchema.safeParse({ ...draft, attendees: many(50) }).success).toBe(true);
    expect(MeetingDraftSchema.safeParse({ ...draft, attendees: many(51) }).success).toBe(false);
  });

  it("validates the update and cancel inputs", () => {
    expect(UpdateMeetingInputSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(UpdateMeetingInputSchema.safeParse({ notify: false, location: null }).success).toBe(true);
    expect(CancelMeetingOptsSchema.safeParse({}).success).toBe(false);
    expect(CancelMeetingOptsSchema.safeParse({ notify: true }).success).toBe(true);
  });
});

describe("whenText", () => {
  it("writes the start in the meeting's time zone and the end hour", () => {
    expect(whenText(noticeData() as never)).toBe("12 de noviembre de 2026, 10:00 – 11:00");
  });
});

describe("createMeeting", () => {
  it("with Google: no Cincel email, only the in-app notice", async () => {
    google.writeMeetingToGoogle.mockResolvedValue({ ok: true, googleEventId: "g1", etag: "e1", htmlLink: null, meetUrl: "https://meet.example.test/x" });
    await createMeeting(user, draft);
    expect(repo.createEvent).toHaveBeenCalledWith(user, draft, expect.objectContaining({ invitesVia: "google" }));
    expect(google.writeMeetingToGoogle).toHaveBeenCalledWith(expect.any(String), "create", expect.objectContaining({ meet: true, actorId: ORGANIZER }));
    expect(repo.setInvitesVia).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    const [, staffIds, payload] = notifications.notify.mock.calls[0]!;
    expect(staffIds).toEqual([GUEST]);
    expect(payload).toMatchObject({ kind: "reunion", force: { inApp: true, email: false } });
  });

  it.each(["NO_GRANT", "ACCESS_DENIED", "REAUTH", "UNAVAILABLE", "RATE_LIMITED"])(
    "on %s: takes the failure path with email and in-app at once",
    async (code) => {
      google.writeMeetingToGoogle.mockResolvedValue({ ok: false, error: code });
      await createMeeting(user, draft);
      expect(repo.setInvitesVia).toHaveBeenCalledWith(expect.any(String), "cincel");
      const recipients = mail.sendMail.mock.calls.map((c) => c[0].to).sort();
      expect(recipients).toEqual(["cliente@example.test", "luis@cincel.test"]);
      expect(mail.sendMail.mock.calls[0]![0].subject).toBe("Invitación: Revisión de planos");
      expect(notifications.notify).toHaveBeenCalledTimes(1);
    }
  );

  it("is limited to 30 per hour", async () => {
    google.writeMeetingToGoogle.mockResolvedValue({ ok: true, googleEventId: "g1", etag: null, htmlLink: null, meetUrl: null });
    for (let i = 0; i < 30; i += 1) await createMeeting(user, draft);
    await expect(createMeeting(user, draft)).rejects.toThrow("RATE_LIMITED");
  });
});

describe("updateMeeting", () => {
  it("patches Google with the changed fields and notifies in-app on the Google path", async () => {
    google.writeMeetingToGoogle.mockResolvedValue({ ok: true, googleEventId: "g1", etag: "e2", htmlLink: null, meetUrl: null });
    await updateMeeting(user, EVENT, { start: "2026-11-12T12:00:00-06:00", end: "2026-11-12T13:00:00-06:00" });
    expect(repo.updateEvent).toHaveBeenCalled();
    expect(google.writeMeetingToGoogle).toHaveBeenCalledWith(
      EVENT,
      "update",
      expect.objectContaining({ patch: { start: "2026-11-12T12:00:00-06:00", end: "2026-11-12T13:00:00-06:00" }, notify: true })
    );
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("on the failure path the change goes by email too", async () => {
    repo.getEventForNotice.mockResolvedValue(noticeData({ invitesVia: "cincel", googleEventId: null }));
    await updateMeeting(user, EVENT, { title: "Revisión final" });
    expect(google.writeMeetingToGoogle).not.toHaveBeenCalled();
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(mail.sendMail.mock.calls[0]![0].subject).toContain("Reunión cambiada");
  });

  it("sends nothing when notify is false", async () => {
    repo.getEventForNotice.mockResolvedValue(noticeData({ invitesVia: "cincel", googleEventId: null }));
    await updateMeeting(user, EVENT, { title: "Revisión final", notify: false });
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("takes the edit back and reports CONFLICT when Google can't reconcile it", async () => {
    google.writeMeetingToGoogle.mockResolvedValue({ ok: false, error: "CONFLICT" });
    await expect(updateMeeting(user, EVENT, { title: "Otro título" })).rejects.toThrow("CONFLICT");
    expect(repo.updateEvent).toHaveBeenCalledTimes(2);
    expect(repo.updateEvent.mock.calls[1]![2]).toMatchObject({ title: "Revisión de planos" });
  });

  it("refuses a cached Google copy and a viewer who can't edit", async () => {
    repo.getEventItem.mockResolvedValueOnce({ eventId: EVENT, source: "google", canEdit: false });
    await expect(updateMeeting(user, EVENT, { title: "x" })).rejects.toThrow("NOT_ORGANIZER");
    repo.getEventItem.mockResolvedValueOnce({ eventId: EVENT, source: "cincel", canEdit: false });
    await expect(updateMeeting(user, EVENT, { title: "x" })).rejects.toThrow("FORBIDDEN");
    repo.getEventItem.mockResolvedValueOnce(null);
    await expect(updateMeeting(user, EVENT, { title: "x" })).rejects.toThrow("NOT_FOUND");
  });

  it("rejects an end before the start without saving", async () => {
    await expect(updateMeeting(user, EVENT, { end: "2026-11-12T09:00:00-06:00" })).rejects.toThrow("INVALID");
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });
});

describe("cancelMeeting", () => {
  it("cancels in Cincel and in Google, and tells the attendees only in-app on the Google path", async () => {
    google.writeMeetingToGoogle.mockResolvedValue({ ok: true, googleEventId: "g1", etag: null, htmlLink: null, meetUrl: null });
    await expect(cancelMeeting(user, EVENT, { notify: true })).resolves.toEqual({ eventId: EVENT });
    expect(repo.cancelEvent).toHaveBeenCalledWith(user, EVENT);
    expect(google.writeMeetingToGoogle).toHaveBeenCalledWith(EVENT, "cancel", expect.objectContaining({ notify: true }));
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("on the failure path the cancel notice goes by email", async () => {
    repo.getEventForNotice.mockResolvedValue(noticeData({ invitesVia: "cincel", googleEventId: null }));
    await cancelMeeting(user, EVENT, { notify: true });
    expect(mail.sendMail.mock.calls.map((c) => c[0].subject)).toEqual([
      "Reunión cancelada: Revisión de planos",
      "Reunión cancelada: Revisión de planos",
    ]);
  });

  it("keeps quiet with notify false and does nothing twice", async () => {
    repo.getEventForNotice.mockResolvedValue(noticeData({ invitesVia: "cincel", googleEventId: null }));
    await cancelMeeting(user, EVENT, { notify: false });
    expect(mail.sendMail).not.toHaveBeenCalled();
    repo.cancelEvent.mockClear();
    repo.getEventForNotice.mockResolvedValue(noticeData({ status: "cancelada" }));
    await cancelMeeting(user, EVENT, { notify: true });
    expect(repo.cancelEvent).not.toHaveBeenCalled();
  });
});
