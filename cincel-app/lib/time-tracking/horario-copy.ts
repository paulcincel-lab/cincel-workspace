/**
 * Spanish copy and number formats of Ajustes › Control de horario (redesign
 * FE §3.8, §3.10, §9, §13): dates as "6 nov" / "4 ene 2027" (lowercase,
 * es-MX), hours as "8.5 h", the ClockInPrompt text and the trial timeline.
 * Pure and client-safe.
 */
import { addDays, dayOfWeek, weekDates } from "@/lib/time-tracking/local-time";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Short weekday labels, 0 = domingo … 6 = sábado. */
export const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

/** One-letter work day toggles, Monday first (value = day of week). */
export const WORK_DAY_TOGGLES: readonly { day: number; letter: string; label: string }[] = [
  { day: 1, letter: "L", label: "Lunes" },
  { day: 2, letter: "M", label: "Martes" },
  { day: 3, letter: "X", label: "Miércoles" },
  { day: 4, letter: "J", label: "Jueves" },
  { day: 5, letter: "V", label: "Viernes" },
  { day: 6, letter: "S", label: "Sábado" },
  { day: 0, letter: "D", label: "Domingo" },
];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** "2 nov". */
export function formatDayMonth(date: string): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

/** "4 ene 2027". */
export function formatDayMonthYear(date: string): string {
  const { y } = parts(date);
  return `${formatDayMonth(date)} ${y}`;
}

/** Day of week of a calendar date (0 = domingo). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const HOURS_FORMAT = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** "8.5 h", "40 h". */
export function formatHours(hours: number): string {
  return `${HOURS_FORMAT.format(Math.round(hours * 10) / 10)} h`;
}

/** "+1.5 h", "−4.8 h" (minus sign), "0 h". */
export function formatHoursDelta(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  if (rounded === 0) return "0 h";
  return `${rounded > 0 ? "+" : "−"}${HOURS_FORMAT.format(Math.abs(rounded))} h`;
}

export const TEAM_HOURS_STATUS_LABEL: Record<TeamHoursRow["status"], string> = {
  completo: "Al día",
  incompleto: "Revisar",
  sin_registro: "Sin registro",
};

/** "Salida sin registrar": a day of the week was closed automatically. */
export const NEEDS_REVIEW_LABEL = "Salida sin registrar";

export type TeamHoursStatusTone = "success" | "warning" | "destructive" | "neutral";

/**
 * Estado of one person in "Horas del equipo" (canvas `Ajustes-Horario`): an
 * auto-closed day wins ("Salida sin registrar", destructive), then
 * completo → "Al día" (success), incompleto → "Revisar" (warning),
 * sin_registro → "Sin registro" (neutral).
 */
export function teamHoursStatus(row: Pick<TeamHoursRow, "status" | "needsReview">): {
  label: string;
  tone: TeamHoursStatusTone;
} {
  if (row.needsReview) return { label: NEEDS_REVIEW_LABEL, tone: "destructive" };
  if (row.status === "completo") return { label: TEAM_HOURS_STATUS_LABEL.completo, tone: "success" };
  if (row.status === "incompleto") return { label: TEAM_HOURS_STATUS_LABEL.incompleto, tone: "warning" };
  return { label: TEAM_HOURS_STATUS_LABEL.sin_registro, tone: "neutral" };
}

/** Hours of a report cell: one decimal, "—" without a record. */
export function formatHoursCell(hours: number | null | undefined): string {
  return hours && hours > 0 ? (Math.round(hours * 10) / 10).toFixed(1) : "—";
}

/** Total − meta, one decimal with its sign ("+1.5", "−4.8" with a minus sign, "0.0"). */
export function formatHoursDiff(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/**
 * The day columns of "Horas del equipo" for the week starting `weekStart`:
 * the work days, plus any other day someone has hours on.
 */
export function reportDays(weekStart: string, workDays: number[], rows: Pick<TeamHoursRow, "days">[]): string[] {
  return weekDates(weekStart).filter(
    (date) =>
      workDays.includes(dayOfWeek(date)) || rows.some((row) => row.days.some((day) => day.date === date && day.hours > 0)),
  );
}

/** "3 – 7 nov", or "29 sep – 3 oct" across months. */
export function formatDateRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.m === b.m && a.y === b.y) return `${a.d} – ${formatDayMonth(to)}`;
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

/** True when `date` is a trial day: the feature has no mandatory date yet, or `date` is before it. */
export function isTrialDay(date: string, requiredFrom: string | null): boolean {
  return requiredFrom === null || date < requiredFrom;
}

/** The first day `requiredFrom` may take on a change: tomorrow. */
export function minRequiredFrom(today: string): string {
  return addDays(today, 1);
}

// ── ClockInPrompt copy (FE §3.10) ───────────────────────────────────────────

export type ClockInPromptCopy = {
  title: string;
  body: string;
  primary: string;
  /** "Ahora no" while registering is optional; null once it is mandatory. */
  dismiss: string | null;
};

/** The text of the first-login-of-the-day prompt for `today`. */
export function clockInPromptCopy(name: string, requiredFrom: string | null, today: string): ClockInPromptCopy {
  const optional = isTrialDay(today, requiredFrom);
  const until = optional && requiredFrom ? ` Opcional hasta el ${formatDayMonthYear(requiredFrom)}.` : "";
  return {
    title: `Buenos días, ${name}`,
    body: `Registra tu entrada para empezar el día.${until}`,
    primary: "Registrar entrada",
    dismiss: optional ? "Ahora no" : null,
  };
}

// ── Switch state and timeline (FE §3.8) ─────────────────────────────────────

export type EnabledStateCopy = { title: string; description: string };

export function enabledStateCopy(settings: Pick<TimeTrackingSettings, "enabled" | "requiredFrom">, today: string): EnabledStateCopy {
  if (!settings.enabled) {
    return {
      title: "Control de horario desactivado",
      description: "Nadie ve el reloj de jornada ni la ventana de registro al iniciar sesión.",
    };
  }
  if (settings.requiredFrom === null) {
    return {
      title: "Control de horario activado",
      description: "En prueba: registrar entrada y salida es opcional mientras no elijas una fecha obligatoria.",
    };
  }
  if (today < settings.requiredFrom) {
    return {
      title: "Control de horario activado",
      description: `En prueba hasta el ${formatDayMonthYear(settings.requiredFrom)}. Después, registrar entrada y salida será obligatorio.`,
    };
  }
  return {
    title: "Control de horario activado",
    description: `Registrar entrada y salida es obligatorio desde el ${formatDayMonthYear(settings.requiredFrom)}.`,
  };
}

export type TimelineSegment = { key: "hoy" | "prueba" | "obligatorio"; label: string };

/** Hoy · Prueba · Obligatorio desde {fecha}; the trial segment is absent once the date has passed. */
export function timelineSegments(today: string, requiredFrom: string | null): TimelineSegment[] {
  const segments: TimelineSegment[] = [{ key: "hoy", label: `Hoy · ${formatDayMonth(today)}` }];
  if (isTrialDay(today, requiredFrom)) {
    segments.push({ key: "prueba", label: "Prueba: registro opcional, sin alertas ni reportes de nómina" });
  }
  if (requiredFrom !== null) {
    segments.push({ key: "obligatorio", label: `Obligatorio desde el ${formatDayMonthYear(requiredFrom)}` });
  }
  return segments;
}

// ── Control mode and the login prompt preview (canvas `Ajustes-Horario`) ────

/** Desactivado · En prueba (no mandatory date) · Obligatorio (from a date). */
export type ControlMode = "off" | "prueba" | "obligatorio";

export function controlMode(settings: Pick<TimeTrackingSettings, "enabled" | "requiredFrom">): ControlMode {
  if (!settings.enabled) return "off";
  return settings.requiredFrom ? "obligatorio" : "prueba";
}

export const CONTROL_MODE_OPTIONS: readonly { value: ControlMode; title: string; description: string }[] = [
  { value: "off", title: "Desactivado", description: "Nadie registra entrada ni salida." },
  { value: "prueba", title: "En prueba", description: "Los datos son informativos y no salen en reportes de nómina." },
  { value: "obligatorio", title: "Obligatorio", description: "Obligatorio a partir de una fecha." },
];

/** The status pill next to "Activar control de horario". */
export const CONTROL_MODE_PILL: Record<ControlMode, { label: string; tone: "neutral" | "warning" | "success" }> = {
  off: { label: "Desactivado", tone: "neutral" },
  prueba: { label: "Activado · en prueba", tone: "warning" },
  obligatorio: { label: "Activado · obligatorio", tone: "success" },
};

/** Work day pills, Monday first: "Lun" … "Dom". */
export const WORK_DAY_PILLS: readonly { day: number; label: string }[] = WORK_DAY_TOGGLES.map((toggle) => {
  const short = WEEKDAY_SHORT[toggle.day];
  return { day: toggle.day, label: short.charAt(0).toUpperCase() + short.slice(1) };
});

/** Text of the prompt preview: "Buenos días, Ana" / "Son las 09:00. ¿Registramos tu entrada?". */
export function loginPromptPreview(
  name: string,
  dayStart: string,
  requiredFrom: string | null,
  today: string,
): { title: string; body: string; primary: string; dismiss: string | null } {
  return {
    title: name ? `Buenos días, ${name}` : "Buenos días",
    body: `Son las ${dayStart}. ¿Registramos tu entrada?`,
    primary: "Registrar entrada",
    dismiss: isTrialDay(today, requiredFrom) ? "Más tarde" : null,
  };
}
