/** Draft rules of the Nueva reunión dialog (FE §6.1). Client-safe. */
import { MEETING_DIALOG_COPY as C } from "@/components/calendario/meeting-copy";
import { timeOf } from "@/components/calendario/meeting-format";
import type { CalEventItem, MeetingDraft } from "@/lib/types/calendario";

export const MEETING_DRAFT_KEY = "calendario.meetingDraft";

export type MeetingForm = {
  title: string;
  date: string;
  start: string;
  end: string;
  projectId: string | null;
  location: string;
  meet: boolean;
  attendees: MeetingDraft["attendees"];
  description: string;
};

export type MeetingFormErrors = Partial<Record<"title" | "date" | "end", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string): boolean => EMAIL.test(v.trim());

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function validateMeetingForm(f: MeetingForm): MeetingFormErrors {
  const errors: MeetingFormErrors = {};
  if (!f.title.trim()) errors.title = C.titleRequired;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = C.dateRequired;
  if (!/^\d{2}:\d{2}$/.test(f.start) || !/^\d{2}:\d{2}$/.test(f.end) || f.end <= f.start) errors.end = C.endAfterStart;
  return errors;
}

/** `2026-11-12` + `10:00` → `2026-11-12T10:00:00-06:00` with the offset of the browser at that moment. */
export function toIsoWithOffset(date: string, time: string): string {
  const local = new Date(`${date}T${time}:00`);
  const off = -local.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function formToDraft(f: MeetingForm, opts: { meet: boolean }): MeetingDraft {
  return {
    title: f.title.trim(),
    start: toIsoWithOffset(f.date, f.start),
    end: toIsoWithOffset(f.date, f.end),
    projectId: f.projectId,
    location: f.location.trim() || null,
    meet: opts.meet,
    attendees: f.attendees,
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
  };
}

export function emptyMeetingForm(today: string, defaults?: Partial<MeetingDraft>): MeetingForm {
  const date = defaults?.start ? defaults.start.slice(0, 10) : today;
  const start = defaults?.start ? timeOf(defaults.start) : "10:00";
  const end = defaults?.end ? timeOf(defaults.end) : addMinutes(start, 60);
  return {
    title: defaults?.title ?? "",
    date,
    start,
    end,
    projectId: defaults?.projectId ?? null,
    location: defaults?.location ?? "",
    meet: defaults?.meet ?? true,
    attendees: defaults?.attendees ?? [],
    description: defaults?.description ?? "",
  };
}

export function formOfEvent(e: CalEventItem): MeetingForm {
  return {
    title: e.title,
    date: e.date,
    start: timeOf(e.start),
    end: timeOf(e.end),
    projectId: e.project?.id ?? null,
    location: e.location ?? "",
    meet: Boolean(e.meetUrl),
    attendees: e.attendees.map((a) => ({ ...(a.staffId ? { staffId: a.staffId } : {}), email: "", name: a.name })),
    description: "",
  };
}

/** The draft survives the Google grant redirect in `sessionStorage`; any failure just means no draft. */
export function saveMeetingDraft(f: MeetingForm): void {
  try {
    window.sessionStorage.setItem(MEETING_DRAFT_KEY, JSON.stringify(f));
  } catch {
    /* no storage: the dialog reopens empty */
  }
}

export function loadMeetingDraft(): MeetingForm | null {
  try {
    const raw = window.sessionStorage.getItem(MEETING_DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MeetingForm>;
    if (typeof v.title !== "string" || typeof v.date !== "string") return null;
    return { ...emptyMeetingForm(v.date), ...v } as MeetingForm;
  } catch {
    return null;
  }
}

export function clearMeetingDraft(): void {
  try {
    window.sessionStorage.removeItem(MEETING_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
