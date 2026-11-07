/**
 * Inicio header block copy (redesign FE §3.2, §13): greeting by hour, the
 * lowercase es-MX date line and initials. Pure and client-safe; server and
 * client format in the organization time zone so both render the same text.
 */

/** The organization's time zone (General settings default). */
export const INICIO_TIME_ZONE = "America/Mexico_City";

function hourIn(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(date);
  return Number.parseInt(hour, 10) % 24;
}

/** "Buenos días" before 12:00, "Buenas tardes" from 12:00, "Buenas noches" from 19:00. */
export function greetingFor(date: Date, timeZone: string = INICIO_TIME_ZONE): string {
  const hour = hourIn(date, timeZone);
  if (hour >= 19) return "Buenas noches";
  if (hour >= 12) return "Buenas tardes";
  return "Buenos días";
}

/** "viernes, 6 de noviembre" (`Intl.DateTimeFormat("es-MX")`, lowercase, no title case). */
export function formatInicioDate(date: Date, timeZone: string = INICIO_TIME_ZONE): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone })
    .format(date)
    .toLocaleLowerCase("es-MX");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "viernes, 6 de noviembre · 3 eventos hoy · 2 tareas vencidas". */
export function inicioDateLine(
  date: Date,
  counts: { eventsToday: number; overdueTasks: number },
  timeZone: string = INICIO_TIME_ZONE,
): string {
  return [
    formatInicioDate(date, timeZone),
    plural(counts.eventsToday, "evento hoy", "eventos hoy"),
    plural(counts.overdueTasks, "tarea vencida", "tareas vencidas"),
  ].join(" · ");
}

/** First word of a name ("Ana López" → "Ana"). */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Up to two initials, uppercase ("ana maría lópez" → "AL"; "Ana" → "A"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("es-MX");
}
