/** Pure formatting and rules of meetings (FE §5, §6.2). Client-safe. */
import { GOOGLE_STATE_ACTION, GOOGLE_STATE_COPY, GOOGLE_STATE_COPY_ALONE } from "@/components/calendario/meeting-copy";
import type { CalEventItem, GoogleSyncError } from "@/lib/types/calendario";

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "HH:mm" of an ISO string with offset, as written (the org wall clock). */
export function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** Weekday index (0 = domingo) of a YYYY-MM-DD, without time zones. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "mié 11 nov". */
export function shortDate(date: string): string {
  const { m, d } = parts(date);
  return `${DAYS[weekdayOf(date)].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
}

/** "Hoy, 10:00 – 11:00" or "Viernes 13 nov, 12:00 – 13:00". */
export function whenLabel(item: Pick<CalEventItem, "date" | "start" | "end" | "allDay">, today: string): string {
  const { m, d } = parts(item.date);
  const day = item.date === today ? "Hoy" : `${DAYS[weekdayOf(item.date)][0].toUpperCase()}${DAYS[weekdayOf(item.date)].slice(1)} ${d} ${MONTHS[m - 1]}`;
  if (item.allDay) return `${day}, todo el día`;
  return `${day}, ${timeOf(item.start)} – ${timeOf(item.end)}`;
}

/** The "Cómo llegar" target (default of the decision: Google Maps search of the place). */
export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** "5 min", "2 h", "3 d" since `iso` at `now`. */
export function agoLabel(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / (60 * 24))} d`;
}

export type GoogleState = {
  /** Soft note, null when the meeting is in Google (or an event of Google). */
  note: string | null;
  /** The retry / reconnect action, only for the organizer. */
  action: { label: string; kind: "retry" | "connect" } | null;
};

/** Google state of a meeting (FE §6.2): the note and its one action. */
/**
 * Whether anyone besides the organizer is on the meeting. Without the
 * attendee list (older callers) it assumes there is someone.
 */
export function invitesOthers(item: Partial<Pick<CalEventItem, "attendees" | "organizer">>): boolean {
  if (!item.attendees) return true;
  const organizerId = item.organizer?.id ?? null;
  return item.attendees.some((a) => !(organizerId && a.staffId === organizerId));
}

export function googleStateOf(
  item: Pick<CalEventItem, "source" | "syncError" | "canEdit"> & Partial<Pick<CalEventItem, "attendees" | "organizer">>,
): GoogleState {
  if (item.source !== "cincel" || !item.syncError) return { note: null, action: null };
  const code = item.syncError as GoogleSyncError;
  const alone = invitesOthers(item) ? null : GOOGLE_STATE_COPY_ALONE[code as keyof typeof GOOGLE_STATE_COPY_ALONE];
  const note = alone ?? GOOGLE_STATE_COPY[code as keyof typeof GOOGLE_STATE_COPY] ?? null;
  if (!note) return { note: null, action: null };
  const label = GOOGLE_STATE_ACTION[code as keyof typeof GOOGLE_STATE_ACTION];
  if (!label || !item.canEdit) return { note, action: null };
  const kind = code === "NO_GRANT" || code === "REAUTH" ? "connect" : "retry";
  return { note, action: { label, kind } };
}

/** Read-only: a Google event the viewer does not organize. */
export function isReadOnlyMeeting(item: Pick<CalEventItem, "source" | "canEdit">): boolean {
  return item.source === "google" && !item.canEdit;
}

/** "Ana García +2" (Analítico ASISTENTES). */
export function attendeesLabel(item: Pick<CalEventItem, "attendees" | "attendeeCount">): string {
  const first = item.attendees[0]?.name;
  if (!first) return "—";
  const rest = Math.max(0, item.attendeeCount - 1);
  return rest > 0 ? `${first} +${rest}` : first;
}

/** Link of the grant flow (F10): back to the dialog, or to the meeting for a retry. */
export function connectGoogleHref(returnTo: string): string {
  return `/api/auth/google/start?scope=calendar_events&return_to=${encodeURIComponent(returnTo)}`;
}
