/** Spanish copy built on the server: lead paragraphs, reasons and toasts (BE §6.3, §10.1). Pure. Bodies belong to the Phase 4 issue. */
import type { ApplyProposalResult, DaySummary, UndoProposalResult, WeekSummary } from "@/lib/types/calendario";

/** "Buenos días" < 12:00, "Buenas tardes" < 19:00, else "Buenas noches" (org time), then ", {nombre}". */
export function greeting(hour: number, firstName: string): string {
  const base = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const name = firstName.trim();
  return name ? `${base}, ${name}` : base;
}

const countPlural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "{n} reuniones y {m} entregas. Lo más urgente: {first risk or first overdue}." */
export function dayLead(input: { meetings: number; due: number; firstRisk: string | null }): string {
  const counts =
    input.meetings === 0 && input.due === 0
      ? "No tienes reuniones ni entregas."
      : `${countPlural(input.meetings, "reunión", "reuniones")} y ${countPlural(input.due, "entrega", "entregas")}.`;
  return input.firstRisk ? `${counts} Lo más urgente: ${input.firstRisk}.` : counts;
}

const weekdayOf = (isoDate: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));

const hoursText = (hours: number) => String(Number(hours.toFixed(1)));

/** "4 reuniones y 11 entregas. El jueves está sobrecargado (9.5 h) y tienes 3 tareas vencidas de la semana pasada." */
export function weekLead(input: { meetings: number; due: number; overloaded: { date: string; hours: number }[]; overdueLastWeek: number }): string {
  const counts =
    input.meetings === 0 && input.due === 0
      ? "No tienes reuniones ni entregas."
      : `${countPlural(input.meetings, "reunión", "reuniones")} y ${countPlural(input.due, "entrega", "entregas")}.`;
  const first = input.overloaded[0];
  const overload = first
    ? input.overloaded.length === 1
      ? `El ${weekdayOf(first.date)} está sobrecargado (${hoursText(first.hours)} h)`
      : `El ${weekdayOf(first.date)} está sobrecargado (${hoursText(first.hours)} h) y otros ${input.overloaded.length - 1} ${input.overloaded.length === 2 ? "día" : "días"} también`
    : null;
  const late = input.overdueLastWeek > 0 ? `${countPlural(input.overdueLastWeek, "tarea vencida", "tareas vencidas")} de la semana pasada` : null;
  if (overload && late) return `${counts} ${overload} y tienes ${late}.`;
  if (overload) return `${counts} ${overload}.`;
  if (late) return `${counts} Tienes ${late}.`;
  return counts;
}

/** "jueves 12 nov." for a YYYY-MM-DD date. */
export function dateLabel(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    new Date(`${isoDate}T00:00:00Z`),
  );
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(/\.$/, "");
  return `${get("weekday")} ${get("day")} ${get("month")}.`;
}

const lowerFirst = (text: string) => (text ? text[0].toLowerCase() + text.slice(1) : text);

/** The reasons of the skipped changes, once each and in lower case: "sin permiso, ya no existe". */
function skipReasons(skipped: { reason: string }[]): string {
  return [...new Set(skipped.map((s) => lowerFirst(s.reason)))].join(", ");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Server toast after applying a proposal (BE §6.3). `date` is the target day of a move, when there is one. */
export function applyToast(result: Pick<ApplyProposalResult, "applied" | "skipped">, kind: string, date?: string | null): string {
  const done = result.applied.length;
  const total = done + result.skipped.length;
  if (done === 0) {
    return result.skipped.length > 0 ? `No apliqué ningún cambio: ${skipReasons(result.skipped)}.` : "No había cambios que aplicar.";
  }
  if (result.skipped.length > 0) {
    const left = result.skipped.length;
    return `Apliqué ${done} de ${plural(total, "cambio", "cambios")}. ${left} ${left === 1 ? "no se pudo" : "no se pudieron"}: ${skipReasons(result.skipped)}.`;
  }
  const when = date ? ` al ${dateLabel(date).replace(/\.$/, "")}` : "";
  switch (kind) {
    case "mover_tareas":
      return `Moví ${plural(done, "tarea", "tareas")}${when}.`;
    case "repartir":
      return `Repartí ${plural(done, "tarea", "tareas")} entre los días con espacio.`;
    case "pasar_a_manana":
      return `Pasé ${plural(done, "tarea", "tareas")}${when || " a mañana"}.`;
    case "planear_semana":
      return `Planeé ${plural(done, "tarea", "tareas")} de la semana.`;
    case "crear_reunion":
      return "Creé la reunión y envié la invitación.";
    case "editar_reunion":
      return "Actualicé la reunión.";
    case "cancelar_reunion":
      return "Cancelé la reunión.";
    case "resolver_traslape":
      return "Moví la reunión para resolver el traslape.";
    case "crear_tareas_minuta":
      return `Creé ${plural(done, "tarea", "tareas")} de la minuta.`;
    default:
      return `Apliqué ${plural(done, "cambio", "cambios")}.`;
  }
}

/** Server toast after undoing a proposal ("Cambio deshecho." is the same text as `UNDONE_TOAST`). */
export function undoToast(result: Pick<UndoProposalResult, "restored" | "skipped">): string {
  if (result.skipped.length === 0) return "Cambio deshecho.";
  const done = result.restored.length;
  const total = done + result.skipped.length;
  if (done === 0) return `No deshice ningún cambio: ${skipReasons(result.skipped)}.`;
  const left = result.skipped.length;
  return `Deshice ${done} de ${total} cambios; ${left} ${left === 1 ? "cambió" : "cambiaron"} después de aplicar.`;
}

export function summaryLead(summary: Pick<DaySummary | WeekSummary, "lead">): string {
  return summary.lead.trim();
}
