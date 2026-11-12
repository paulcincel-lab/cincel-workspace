/**
 * Meeting prep rules (Calendario BE §10.2). Pure and client-safe: progress against the plan,
 * the proposed agenda and the template summary. The loader feeds these with rows.
 */

export const AGENDA_MAX_ITEMS = 8;
export const AGENDA_ITEM_MAX_LENGTH = 200;
/** Deliveries due within this many days after the meeting are agenda items. */
export const DELIVERY_WINDOW_DAYS = 14;

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `YYYY-MM-DD` → "28 oct". */
export function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS_SHORT[Number(match[2]) - 1] ?? ""}`.trim();
}

function utcDay(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(utcDay(to) - utcDay(from));
}

/** `YYYY-MM-DD` plus `n` days. */
export function addDaysIso(iso: string, n: number): string {
  return new Date((utcDay(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Points ahead (+) or behind (−) the plan. The plan is linear between the project's start and end
 * dates (Decision: default baseline); null without both dates.
 */
export function planDelta(input: { progress: number; startDate: string | null; endDate: string | null; today: string }): number | null {
  const { progress, startDate, endDate, today } = input;
  if (!startDate || !endDate) return null;
  const total = daysBetween(startDate, endDate);
  const elapsed = daysBetween(startDate, today);
  if (Number.isNaN(total) || Number.isNaN(elapsed)) return null;
  const expected = total <= 0 ? (elapsed >= 0 ? 100 : 0) : Math.min(100, Math.max(0, (elapsed / total) * 100));
  return Math.round(progress - expected);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= AGENDA_ITEM_MAX_LENGTH ? clean : `${clean.slice(0, AGENDA_ITEM_MAX_LENGTH - 1).trimEnd()}…`;
}

export type AgendaInput = {
  /** Open tasks due before the meeting, most late first. */
  overdue: { taskId: string; title: string }[];
  /** Open points of the project's last minutes. */
  openPoints: { text: string; date: string }[];
  /** Open tasks with a delivery date in the next 14 days. */
  deliveries: { taskId: string; title: string }[];
  max?: number;
};

/** One item per overdue task, per open point of the last minutes and per delivery; deduplicated, at most 8. */
export function buildAgenda(input: AgendaInput): string[] {
  const overdueIds = new Set(input.overdue.map((t) => t.taskId));
  const candidates: string[] = [
    ...input.overdue.map((t) => `Avance y nueva fecha de ${t.title}`),
    ...input.openPoints.map((p) => `${p.text} (pendiente del ${formatShortDate(p.date)})`),
    ...input.deliveries.filter((t) => !overdueIds.has(t.taskId)).map((t) => `Fechas de entrega de ${lowerFirst(t.title)}`),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const item = clip(raw);
    const key = normalize(item);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= (input.max ?? AGENDA_MAX_ITEMS)) break;
  }
  return out;
}

export type PrepSummaryInput = {
  hasProject: boolean;
  delta: number | null;
  /** Overdue tasks, most late first. */
  overdue: { title: string; daysLate: number }[];
  overdueCount: number;
  lastMeeting: { date: string; openPoints: string[] } | null;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The default paragraph of the prep (no model): progress against the plan, what is late, what stayed open. */
export function prepSummary(input: PrepSummaryInput): string {
  const { delta, overdue, overdueCount, lastMeeting } = input;
  const sentences: string[] = [];
  const top = overdue[0];

  if (!input.hasProject) {
    sentences.push("Esta reunión no tiene proyecto.");
  } else if (delta !== null && delta < 0) {
    const by = top ? ` por ${top.title} (vencida ${top.daysLate} ${plural(top.daysLate, "día", "días")})` : "";
    sentences.push(`El proyecto va ${-delta} ${plural(-delta, "punto", "puntos")} atrás del plan${by}.`);
  } else if (delta !== null && delta > 0) {
    sentences.push(`El proyecto va ${delta} ${plural(delta, "punto", "puntos")} adelante del plan.`);
  } else if (delta === 0) {
    sentences.push("El proyecto va al día con el plan.");
  }

  const mentionedTop = input.hasProject && delta !== null && delta < 0 && top !== undefined;
  if (overdueCount === 0) {
    sentences.push("No hay tareas vencidas.");
  } else if (!mentionedTop || overdueCount > 1) {
    sentences.push(`Hay ${overdueCount} ${plural(overdueCount, "tarea vencida", "tareas vencidas")} antes de la reunión.`);
  }

  const first = lastMeeting?.openPoints[0];
  if (lastMeeting && first) {
    const when = formatShortDate(lastMeeting.date);
    sentences.push(
      lastMeeting.openPoints.length === 1
        ? `En la junta del ${when} quedó abierto: ${lowerFirst(first)}.`
        : `En la junta del ${when} quedaron abiertos ${lastMeeting.openPoints.length} puntos; el primero: ${lowerFirst(first)}.`,
    );
  }
  return sentences.join(" ");
}

const WEEKDAYS = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" });

/** "jueves 12 nov, 10:00 – 11:00" in the event's time zone. */
export function formatMeetingWhen(input: { start: { date: string; time: string }; end: { date: string; time: string } }): string {
  const { start, end } = input;
  const weekday = WEEKDAYS.format(new Date(utcDay(start.date) * 86_400_000));
  const head = `${weekday} ${formatShortDate(start.date)}, ${start.time}`;
  return start.date === end.date ? `${head} – ${end.time}` : `${head} – ${formatShortDate(end.date)}, ${end.time}`;
}
