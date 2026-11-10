/**
 * Inicio Visual copy and ordering (#989): the greeting hero sentence and
 * date, the KPI tile deltas, the attention card chips and captions, and the
 * project card chips. Pure and client-safe; dates format in the organization
 * time zone so server and client render the same text.
 */
import { agendaSortKey } from "@/lib/dashboard/inicio";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { INICIO_TIME_ZONE } from "@/lib/inicio/header";
import { formatSignedDelta } from "@/lib/metrics/series";
import { ATTENTION_REASON } from "@/lib/metrics/widgets";
import type { InicioHero } from "@/lib/types/redesign";
import type { AttentionItem, KpiDatum, ProgressItem } from "@/lib/types/widgets";

/** Avatars shown before the "+N" one (hero and project cards keep their own caps). */
export const HERO_AVATAR_CAP = 4;
export const PROJECT_AVATAR_CAP = 3;
/** Cards and rows shown per section before "Ver todas" / "Ver todos" / "Ver agenda". */
export const ATTENTION_CAP = 3;
export const PROJECTS_CAP = 4;
export const AGENDA_CAP = 6;
/** Days late from which the late chip uses the destructive tint (warning below). */
export const LATE_CRITICAL_DAYS = 10;

function part(date: Date, options: Intl.DateTimeFormatOptions, timeZone: string): string {
  return cachedDateTimeFormat("es-MX", { ...options, timeZone }).format(date);
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("es-MX") + text.slice(1) : text;
}

/** "lunes 9 nov" (shown uppercase by the hero's `uppercase` class). */
export function heroDateLabel(date: Date, timeZone: string = INICIO_TIME_ZONE): string {
  const weekday = part(date, { weekday: "long" }, timeZone).toLocaleLowerCase("es-MX");
  const day = part(date, { day: "numeric" }, timeZone);
  const month = part(date, { month: "short" }, timeZone).replace(".", "").toLocaleLowerCase("es-MX");
  return `${weekday} ${day} ${month}`;
}

/** "Lunes 9 de noviembre · cómo va el despacho, de un vistazo." */
export function visualHeaderDescription(date: Date, timeZone: string = INICIO_TIME_ZONE): string {
  const weekday = part(date, { weekday: "long" }, timeZone).toLocaleLowerCase("es-MX");
  const day = part(date, { day: "numeric" }, timeZone);
  const month = part(date, { month: "long" }, timeZone).toLocaleLowerCase("es-MX");
  return `${capitalize(weekday)} ${day} de ${month} · cómo va el despacho, de un vistazo.`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "Hoy vencen 4 entregas y hay 7 tareas atrasadas en 3 proyectos. Oficina
 * Polanco necesita atención." Singular forms: "vence 1 entrega", "1 tarea
 * atrasada en 1 proyecto". With nothing due or late: "Hoy no vence ninguna
 * entrega y no hay tareas atrasadas."
 */
export function heroSentence(hero: InicioHero): string {
  const due =
    hero.dueToday === 0
      ? "Hoy no vence ninguna entrega"
      : `Hoy ${hero.dueToday === 1 ? "vence" : "vencen"} ${plural(hero.dueToday, "entrega", "entregas")}`;
  const late =
    hero.overdue === 0
      ? "no hay tareas atrasadas"
      : `hay ${plural(hero.overdue, "tarea atrasada", "tareas atrasadas")} en ${plural(hero.overdueProjects, "proyecto", "proyectos")}`;
  const focus = hero.overdue > 0 && hero.focusProject ? ` ${hero.focusProject.name} necesita atención.` : "";
  return `${due} y ${late}.${focus}`;
}

/** "entregas hoy" / "entrega hoy" under the hero's big number. */
export function dueTodayCaption(count: number): string {
  return count === 1 ? "entrega hoy" : "entregas hoy";
}

/** "8 personas con jornada abierta". */
export function openShiftsCaption(count: number): string {
  return `${plural(count, "persona", "personas")} con jornada abierta`;
}

/** The first `cap` items and how many more there are (the "+N" avatar). */
export function capAvatars<T>(people: readonly T[], cap: number): { shown: T[]; extra: number } {
  return { shown: people.slice(0, cap), extra: Math.max(0, people.length - cap) };
}

export type DeltaTone = "bad" | "good" | "neutral";

/** The tile's delta pill: "+3", "−2", "±0" ("+4 h" for hours) and its tone. Null without a delta. */
export function tileDelta(kpi: KpiDatum): { text: string; tone: DeltaTone; caption: string } | null {
  if (!kpi.delta) return null;
  const { value, good, caption } = kpi.delta;
  const unit = kpi.key === "horas_semana" ? " h" : "";
  if (value === 0) return { text: "±0", tone: "neutral", caption };
  return { text: `${formatSignedDelta(value)}${unit}`, tone: kpi.delta.tone ?? (good ? "good" : "bad"), caption };
}

/** "Tareas abiertas: 23, +3 vs. semana pasada". */
export function tileAriaLabel(kpi: KpiDatum, valueText: string): string {
  const delta = tileDelta(kpi);
  return delta ? `${kpi.label}: ${valueText}, ${delta.text} ${delta.caption}` : `${kpi.label}: ${valueText}`;
}

/** A blocked attention item: its reason, or the task status when the item carries one. */
export function attentionBlocked(item: AttentionItem): boolean {
  const status = (item as AttentionItem & { status?: { value?: string } }).status;
  return item.reason === ATTENTION_REASON.bloqueada || status?.value === "bloqueado";
}

/** "12 d tarde" with its tint: destructive from `LATE_CRITICAL_DAYS`, warning below. Null when not late. */
export function lateChip(daysLate: number | null): { text: string; tone: "destructive" | "warning" } | null {
  if (daysLate === null || daysLate <= 0) return null;
  return { text: `${daysLate} d tarde`, tone: daysLate >= LATE_CRITICAL_DAYS ? "destructive" : "warning" };
}

/**
 * The attention card caption: "2 de 5 subtareas", "Sin subtareas", and for a
 * blocked task that is also late "0 de 3 subtareas · 7 d tarde" (the chip row
 * shows "Bloqueado" instead of the late chip).
 */
export function attentionCaption(item: AttentionItem): string {
  const subtasks = item.subtasks ? `${item.subtasks.done} de ${item.subtasks.total} subtareas` : "Sin subtareas";
  const late = lateChip(item.daysLate);
  return attentionBlocked(item) && late ? `${subtasks} · ${late.text}` : subtasks;
}

/** "Oficina Polanco · Ana Ruiz" (the project alone without a responsable). */
export function attentionMeta(item: AttentionItem): string {
  return item.assignee ? `${item.project} · ${item.assignee.name}` : item.project;
}

/** "4 vencidas" (destructive) or "Al día" (success). */
export function projectChip(item: ProgressItem): { text: string; tone: "destructive" | "success" } {
  const overdue = item.overdue ?? 0;
  return overdue > 0
    ? { text: plural(overdue, "vencida", "vencidas"), tone: "destructive" }
    : { text: "Al día", tone: "success" };
}

/** "28 nov" for a `YYYY-MM-DD` date. */
export function shortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return cachedDateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

/** "Diseño · entrega 28 nov" (the tramo alone without a delivery date). */
export function projectMeta(item: ProgressItem): string {
  const parts = [item.sublabel, item.deliveryDate ? `entrega ${shortDate(item.deliveryDate)}` : null].filter(Boolean);
  return parts.join(" · ");
}

/** Projects by most overdue first, then the soonest delivery (none last), then the name. */
export function sortProjects(items: readonly ProgressItem[]): ProgressItem[] {
  return [...items].sort(
    (a, b) =>
      (b.overdue ?? 0) - (a.overdue ?? 0) ||
      (a.deliveryDate ?? "9999-12-31").localeCompare(b.deliveryDate ?? "9999-12-31") ||
      a.label.localeCompare(b.label, "es"),
  );
}

/** "09:00" of an agenda start, in the organization time zone. */
export function agendaTime(start: string, timeZone: string = INICIO_TIME_ZONE): string {
  return agendaSortKey(start, timeZone).slice(11, 16);
}
