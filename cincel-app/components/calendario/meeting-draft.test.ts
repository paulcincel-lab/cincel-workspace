import { afterEach, describe, expect, it } from "vitest";

import { clearMeetingDraft, emptyMeetingForm, formToDraft, loadMeetingDraft, saveMeetingDraft, toIsoWithOffset, validateMeetingForm } from "./meeting-draft";

describe("meeting-draft", () => {
  afterEach(() => clearMeetingDraft());

  it("defaults to a 60 minute meeting", () => {
    const f = emptyMeetingForm("2026-11-12");
    expect([f.start, f.end, f.meet]).toEqual(["10:00", "11:00", true]);
  });
  it("requires a title and an end after the start", () => {
    const f = { ...emptyMeetingForm("2026-11-12"), title: " ", end: "09:00" };
    expect(validateMeetingForm(f)).toEqual({ title: "Escribe un título.", end: "El fin debe ser después del inicio." });
    expect(validateMeetingForm({ ...f, title: "Revisión", end: "10:00" }).end).toBeTruthy();
    expect(validateMeetingForm({ ...f, title: "Revisión", end: "11:30" })).toEqual({});
  });
  it("builds the draft with an offset and trimmed fields", () => {
    expect(toIsoWithOffset("2026-11-12", "10:00")).toMatch(/^2026-11-12T10:00:00[+-]\d{2}:\d{2}$/);
    const d = formToDraft({ ...emptyMeetingForm("2026-11-12"), title: " Revisión ", location: " " }, { meet: false });
    expect(d.title).toBe("Revisión");
    expect(d.location).toBeNull();
    expect(d.meet).toBe(false);
  });
  it("keeps the draft in sessionStorage for the grant return", () => {
    saveMeetingDraft({ ...emptyMeetingForm("2026-11-12"), title: "Revisión" });
    expect(loadMeetingDraft()?.title).toBe("Revisión");
    clearMeetingDraft();
    expect(loadMeetingDraft()).toBeNull();
  });
});
