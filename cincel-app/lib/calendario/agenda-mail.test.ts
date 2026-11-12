// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPrepEvent: vi.fn(),
  listAgendaRecipients: vi.fn(),
  sendMail: vi.fn(),
  recordComment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/repositories/meeting-prep-repository", () => ({
  getPrepEvent: mocks.getPrepEvent,
  listAgendaRecipients: mocks.listAgendaRecipients,
}));
vi.mock("@/lib/repositories/history-repository", () => ({ recordComment: mocks.recordComment }));
vi.mock("@/lib/email", () => ({ sendMail: mocks.sendMail }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { agendaPerEventLimiter, agendaPerStaffLimiter, agendaSentLine, sendAgenda } from "./agenda-mail";

const EVENT_ID = "6f1c0a8e-3c41-4d63-9d0b-0a7c3a5f2b11";
const OTHER_EVENT_ID = "0d9d5a52-7a9b-4a52-8d49-0c54b6f4e0aa";
const user = {
  email: "ana@cincel.test",
  access: "Colaborador",
  member: { id: "staff-1", name: "Ana García", role: "", institutionalEmail: "ana@cincel.test" },
} as unknown as AuthenticatedUser;

const event = {
  id: EVENT_ID,
  title: "Revisión con cliente",
  startsAt: new Date("2026-11-11T16:00:00Z"),
  endsAt: new Date("2026-11-11T17:00:00Z"),
  timeZone: "America/Mexico_City",
  location: "Sala 2",
  meetUrl: null,
  projectId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  agendaPerStaffLimiter.reset();
  agendaPerEventLimiter.reset();
  mocks.getPrepEvent.mockResolvedValue(event);
  mocks.listAgendaRecipients.mockResolvedValue([
    { email: "ana@cincel.test", name: "Ana García" },
    { email: "luis@cincel.test", name: "Luis Martínez" },
    { email: "LUIS@cincel.test", name: "Luis M." },
    { email: "cliente@example.test", name: "Cliente" },
  ]);
  mocks.sendMail.mockResolvedValue({ sent: true });
  mocks.recordComment.mockResolvedValue({});
});

describe("sendAgenda", () => {
  it("mails the other attendees once and writes the history line", async () => {
    const result = await sendAgenda(user, EVENT_ID, ["Avance de Ingenierías", "Fechas de entrega"]);
    expect(result).toEqual({ sent: 2 });
    const mail = mocks.sendMail.mock.calls[0]![0];
    expect(mail.to).toEqual(["luis@cincel.test", "cliente@example.test"]);
    expect(mail.subject).toBe("Orden del día · Revisión con cliente");
    expect(mail.text).toContain("1. Avance de Ingenierías");
    expect(mail.text).toContain("miércoles 11 nov, 10:00 – 11:00");
    expect(mocks.recordComment).toHaveBeenCalledWith({
      entity: "calendar_event",
      entityId: EVENT_ID,
      actorId: "staff-1",
      comment: "Ana García envió el orden del día a 2 asistentes",
    });
  });

  it("refuses a viewer who is not the organizer or a staff attendee", async () => {
    mocks.getPrepEvent.mockResolvedValue(null);
    await expect(sendAgenda(user, EVENT_ID, ["Punto"])).rejects.toThrow("FORBIDDEN");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("validates the input", async () => {
    await expect(sendAgenda(user, "no-es-uuid", ["Punto"])).rejects.toThrow("INVALID");
    await expect(sendAgenda(user, EVENT_ID, [])).rejects.toThrow("INVALID");
    await expect(sendAgenda(user, EVENT_ID, Array.from({ length: 13 }, (_, i) => `p${i}`))).rejects.toThrow("INVALID");
  });

  it("needs someone to send to", async () => {
    mocks.listAgendaRecipients.mockResolvedValue([{ email: "ana@cincel.test", name: "Ana García" }]);
    await expect(sendAgenda(user, EVENT_ID, ["Punto"])).rejects.toThrow("NO_ATTENDEES");
  });

  it("fails when the mail does not go out", async () => {
    mocks.sendMail.mockResolvedValue({ sent: false, reason: "failed" });
    await expect(sendAgenda(user, EVENT_ID, ["Punto"])).rejects.toThrow("MAIL_FAILED");
    expect(mocks.recordComment).not.toHaveBeenCalled();
  });

  it("still succeeds when only the history line fails", async () => {
    mocks.recordComment.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendAgenda(user, EVENT_ID, ["Punto"])).resolves.toEqual({ sent: 2 });
    spy.mockRestore();
  });

  it("allows 3 sends per event an hour", async () => {
    for (let i = 0; i < 3; i++) await sendAgenda(user, EVENT_ID, ["Punto"]);
    await expect(sendAgenda(user, EVENT_ID, ["Punto"])).rejects.toThrow("RATE_LIMITED");
    expect(mocks.sendMail).toHaveBeenCalledTimes(3);
  });

  it("allows 10 sends per person an hour across events", async () => {
    for (let i = 0; i < 10; i++) {
      mocks.getPrepEvent.mockResolvedValue({ ...event, id: `${i}`.padStart(8, "0") + OTHER_EVENT_ID.slice(8) });
      await sendAgenda(user, OTHER_EVENT_ID, ["Punto"]);
    }
    await expect(sendAgenda(user, OTHER_EVENT_ID, ["Punto"])).rejects.toThrow("RATE_LIMITED");
  });
});

describe("agendaSentLine", () => {
  it("pluralizes", () => {
    expect(agendaSentLine("Ana García", 3)).toBe("Ana García envió el orden del día a 3 asistentes");
    expect(agendaSentLine("Ana García", 1)).toBe("Ana García envió el orden del día a 1 asistente");
  });
});
