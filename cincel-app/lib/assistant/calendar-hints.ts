/**
 * What the asistente needs to make its Calendario suggestions and composer
 * placeholder real (BE §11.5): the next delivery date, a teammate and a
 * project of the viewer. Pure and client-safe; `fetchCalendarioAssistantHintsAction`
 * feeds it with the viewer's open tasks.
 */

export type CalendarioAssistantHints = {
  /** The next `deliveryDate` of an open task of the viewer, on or after today. */
  nextDelivery: string | null;
  /** The person the viewer shares most open tasks with. */
  teammate: string | null;
  /** The project of the viewer's most recently updated open task. */
  project: string | null;
};

export const EMPTY_CALENDARIO_HINTS: CalendarioAssistantHints = { nextDelivery: null, teammate: null, project: null };

/** The fields of a task the hints read. */
export type HintTask = {
  status: string;
  deliveryDate: string | null;
  updatedAt: string;
  project: { name: string };
  manager: { id: string; name: string } | null;
  support: { id: string; name: string }[];
};

export function calendarioHintsFrom(tasks: readonly HintTask[], viewerId: string, today: string): CalendarioAssistantHints {
  const open = tasks.filter((task) => task.status !== "completado");
  let nextDelivery: string | null = null;
  for (const task of open) {
    const date = task.deliveryDate;
    if (date && date >= today && (nextDelivery === null || date < nextDelivery)) nextDelivery = date;
  }

  const shared = new Map<string, { name: string; count: number }>();
  for (const task of open) {
    for (const person of [task.manager, ...task.support]) {
      if (!person || person.id === viewerId) continue;
      const entry = shared.get(person.id) ?? { name: person.name, count: 0 };
      entry.count += 1;
      shared.set(person.id, entry);
    }
  }
  const teammate =
    [...shared.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))[0]?.name ?? null;

  const latest = [...open].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return { nextDelivery, teammate, project: latest?.project.name ?? null };
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** `2026-11-17` → `17 nov`. */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return month >= 1 && month <= 12 && day ? `${day} ${MONTHS[month - 1]}` : date;
}

/** First name of a person ("Jorge" for "Jorge Ruiz"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Composer placeholder of the asistente on /calendario. */
export function calendarioComposerPlaceholder(project: string | null): string {
  return `Agenda la visita de sitio de ${project ?? "un proyecto"} el jueves…`;
}

type LineContext = {
  from: string;
  to: string;
  filters: { mostrar: "todo" | "tareas" | "reuniones"; quien: "yo" | "todos"; proyectos: readonly string[]; ocultarCompletadas: boolean };
};

/** `2026-11-09`–`2026-11-15` → `9 – 15 nov`; across months `30 nov – 6 dic`. */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return shortDate(from);
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  return fm === tm ? `${fd} – ${td} ${MONTHS[tm - 1] ?? ""}`.trim() : `${shortDate(from)} – ${shortDate(to)}`;
}

/** "Contexto: Calendario · {rango} · {filtro}" (panel context line, FE §7). */
export function calendarioContextLine(context: LineContext): string {
  const { mostrar, quien, proyectos } = context.filters;
  const what = mostrar === "tareas" ? "tareas" : mostrar === "reuniones" ? "reuniones" : "tareas y reuniones";
  const filter = quien === "todos" ? `Todo el equipo: ${what}` : `Mis ${what}`;
  const projects = proyectos.length > 0 ? ` · ${proyectos.length === 1 ? "1 proyecto" : `${proyectos.length} proyectos`}` : "";
  return `Contexto: Calendario · ${rangeLabel(context.from, context.to)} · ${filter}${projects}`;
}
