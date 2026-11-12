import type { CalendarioRange } from "@/lib/types/calendario";

const OVERDUE_EXAMPLE = "Pasa lo vencido al jueves";

/** The project of the latest dated item of the range, the viewer's most recent one. */
export function recentProjectName(range: CalendarioRange): string | null {
  let best: { date: string; name: string } | null = null;
  for (const item of range.items) {
    const name = item.project?.name;
    if (!name) continue;
    if (!best || item.date > best.date) best = { date: item.date, name };
  }
  return best?.name ?? null;
}

/** The example chips of the Barra para pedir (FE §7.2). */
export function barraExamples(projectName: string | null): string[] {
  return [`Junta con el cliente de ${projectName ?? "tu proyecto"} mañana a las 10`, OVERDUE_EXAMPLE];
}
