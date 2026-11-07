/**
 * Reminder date helpers for the Mi espacio UI (redesign FE §3.3, §4.4): the
 * org-local day of a reminder, es-MX lowercase "cuándo" labels, the snooze
 * targets and the date + time inputs ↔ ISO conversion. Pure and client-safe.
 */
import type { Reminder } from "@/lib/types/redesign";

/** The org time zone (the regional setting is fixed to it). */
export const REMINDER_TIME_ZONE = "America/Mexico_City";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatters.set(tz, formatter);
  }
  return formatter;
}

function zoned(date: Date, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local `YYYY-MM-DD` and `HH:mm` of an instant in `tz` (the date + time input values). */
export function toZonedInputs(value: string | Date, tz: string = REMINDER_TIME_ZONE): { date: string; time: string } {
  const p = zoned(typeof value === "string" ? new Date(value) : value, tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Local day key `YYYY-MM-DD` of an instant in `tz`. */
export function zonedDateKey(value: string | Date, tz: string = REMINDER_TIME_ZONE): string {
  return toZonedInputs(value, tz).date;
}

/** `YYYY-MM-DD` plus `days` calendar days. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Local wall time (`YYYY-MM-DD`, `HH:mm`) in `tz` → ISO instant, or null when the inputs are not valid. */
export function zonedInputsToIso(date: string, time: string, tz: string = REMINDER_TIME_ZONE): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset around a DST change.
  let utc = wall;
  for (let i = 0; i < 2; i += 1) {
    const p = zoned(new Date(utc), tz);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utc;
    utc = wall - offset;
  }
  return new Date(utc).toISOString();
}

/** Calendar days between today and the reminder's local day (0 = hoy, 1 = mañana, negative = past). */
export function reminderDayOffset(dueAt: string, now: Date, tz: string = REMINDER_TIME_ZONE): number {
  const [ay, am, ad] = zonedDateKey(now, tz).split("-").map(Number);
  const [by, bm, bd] = zonedDateKey(dueAt, tz).split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** "9:00" — hour without a leading zero, 24 h. */
export function formatReminderTime(dueAt: string, tz: string = REMINDER_TIME_ZONE): string {
  const p = zoned(new Date(dueAt), tz);
  return `${p.hour}:${pad(p.minute)}`;
}

/** es-MX lowercase label: "hoy 9:00", "mañana 9:00", else "vie 15 nov 9:00". */
export function formatReminderWhen(dueAt: string, now: Date, tz: string = REMINDER_TIME_ZONE): string {
  const time = formatReminderTime(dueAt, tz);
  const offset = reminderDayOffset(dueAt, now, tz);
  if (offset === 0) return `hoy ${time}`;
  if (offset === 1) return `mañana ${time}`;
  // Built from parts: ICU versions differ in the literals ("vie 15 nov" vs "vie, 15 de nov.").
  const parts = new Intl.DateTimeFormat("es-MX", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })
    .formatToParts(new Date(dueAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((x) => x.type === type)?.value ?? "").replace(/\./g, "").trim().toLowerCase();
  return `${part("weekday")} ${part("day")} ${part("month")} ${time}`;
}

/** Open (not fired, not cancelled) reminders due today or tomorrow in `tz`, by `dueAt`. */
export function remindersForTodayAndTomorrow(
  reminders: Reminder[],
  now: Date,
  tz: string = REMINDER_TIME_ZONE
): Reminder[] {
  return reminders
    .filter((r) => r.cancelledAt === null && r.firedAt === null)
    .filter((r) => {
      const offset = reminderDayOffset(r.dueAt, now, tz);
      return offset === 0 || offset === 1;
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

/** "Posponer 1 h": one hour after the later of now and the current due time. */
export function snoozeOneHourTarget(dueAt: string, now: Date): string {
  return new Date(Math.max(Date.parse(dueAt), now.getTime()) + HOUR_MS).toISOString();
}

/** "Mañana": tomorrow at 9:00 local time. */
export function snoozeTomorrowTarget(now: Date, tz: string = REMINDER_TIME_ZONE): string {
  return zonedInputsToIso(addDaysToDateKey(zonedDateKey(now, tz), 1), "09:00", tz) as string;
}

/** Same rule as the server's `PAST_TIME` (dueAt < now − 60 s). */
export function isPastReminderTime(dueAt: string, now: Date): boolean {
  return Date.parse(dueAt) < now.getTime() - 60_000;
}

/** "Repetir" options (FE §3.3). */
export const REMINDER_REPEAT_LABELS: Record<Reminder["repeat"], string> = {
  none: "No se repite",
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
};

/** "Avisar por" options (FE §3.3). */
export const REMINDER_CHANNEL_LABELS: Record<Reminder["channels"][number], string> = {
  app: "En la app",
  email: "Correo",
};
