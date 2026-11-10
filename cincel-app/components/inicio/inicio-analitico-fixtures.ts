/**
 * `InicioData` for the Inicio Analítico tests (#991), shaped like the frame
 * `Inicio-Analitico`: two projects in Atención (Oficina Polanco with 3
 * overdue tasks over two tramos plus one blocked, Depto Roma with 1), 12
 * weeks of pace, three people (one saturated), three tramos and today's
 * agenda (two events, one delivery).
 */
import type { InicioData } from "@/lib/types/redesign";
import type { AttentionItem } from "@/lib/types/widgets";

import { INICIO_NON_ADMIN } from "./inicio-fixtures";

const LUIS = { id: "s-2", name: "Luis Pérez", initials: "LP" };
const ANA = { id: "s-3", name: "Ana Ruiz", initials: "AR" };
const MARTA = { id: "s-4", name: "Marta Gil", initials: "MG" };

function task(
  id: string,
  title: string,
  projectId: string,
  project: string,
  tramo: string,
  assignee: AttentionItem["assignee"],
  daysLate: number | null,
  status: NonNullable<AttentionItem["status"]>,
): AttentionItem {
  return {
    id,
    title,
    href: `/tareas?tarea=${id}`,
    project,
    projectId,
    tramo,
    reason: daysLate === null ? "Bloqueada" : "Vencida",
    tone: daysLate === null ? "warn" : "critical",
    assignee,
    due: daysLate === null ? "2026-11-20" : "2026-10-28",
    daysLate,
    status,
  };
}

const PENDIENTE = { value: "pendiente", label: "Pendiente" } as const;
const EN_PROCESO = { value: "en_proceso", label: "En proceso" } as const;
const BLOQUEADO = { value: "bloqueado", label: "Bloqueado" } as const;

/** INICIO_NON_ADMIN's 12 weeks with one week at Neto −5 (2026-10-19). */
const WEEKLY_PACE = INICIO_NON_ADMIN.weeklyPace.map((w) => (w.weekStart === "2026-10-19" ? { ...w, created: 21, completed: 16 } : w));

export const ANALITICO_DATA: InicioData = {
  ...INICIO_NON_ADMIN,
  weeklyPace: WEEKLY_PACE,
  kpis: [
    { key: "proyectos_activos", label: "Proyectos activos", value: 4, delta: { value: 0, good: true, caption: "vs. semana pasada" } },
    { key: "vencidas", label: "Vencidas", value: 7, delta: { value: -1, good: true, caption: "vs. semana pasada" } },
    { key: "bloqueadas", label: "Bloqueadas", value: 1 },
    { key: "revisiones_7d", label: "Revisiones · 7 días", value: 3 },
    { key: "completadas_semana", label: "Completadas · semana", value: 11, delta: { value: 1, good: true, caption: "vs. semana pasada" }, visibleIn: ["analitico"] },
    { key: "abiertas", label: "Abiertas", value: 23, delta: { value: 2, good: false, caption: "vs. semana pasada" } },
    {
      key: "retraso_promedio",
      label: "Retraso promedio",
      value: 6.3,
      display: "6.3 d",
      delta: { value: 0.8000000000000007, good: false, caption: "vs. semana pasada" },
      visibleIn: ["analitico"],
    },
  ],
  tasksByTramo: [
    { key: "presale", label: "Presale", value: 6, colorVar: "var(--chart-1)", secondary: 1, extra: { diasProm: 4 } },
    { key: "diseno", label: "Diseño", value: 10, colorVar: "var(--chart-2)", secondary: 4, extra: { diasProm: 7 } },
    { key: "construccion", label: "Construcción", value: 7, colorVar: "var(--chart-3)", secondary: 2, extra: { diasProm: 9 } },
  ],
  attention: [
    task("t-1", "Planos de instalación eléctrica", "p-1", "Oficina Polanco", "diseno", ANA, 12, EN_PROCESO),
    task("t-2", "Cotización de cancelería", "p-1", "Oficina Polanco", "presale", LUIS, 9, PENDIENTE),
    task("t-3", "Render del lobby", "p-1", "Oficina Polanco", "diseno", ANA, 3, EN_PROCESO),
    task("t-4", "Permiso de obra ante alcaldía", "p-1", "Oficina Polanco", "construccion", MARTA, null, BLOQUEADO),
    task("t-5", "Acabados de baño", "p-2", "Depto Roma", "construccion", MARTA, 4, PENDIENTE),
    // Not in Analítico's Atención (reason).
    { ...task("t-6", "Sin responsable", "p-2", "Depto Roma", "diseno", null, null, PENDIENTE), reason: "Sin responsable" },
  ],
  projectsProgress: [
    { id: "p-1", label: "Oficina Polanco", real: 40, open: 6, overdue: 4, atRisk: true },
    { id: "p-2", label: "Depto Roma", real: 20, open: 4, overdue: 1, atRisk: false },
  ],
  workload: [
    { id: ANA.id, name: ANA.name, initials: ANA.initials, open: 10, overdue: 4, occupancyPct: 125, inProgress: 5, avgDaysLate: 7.5 },
    { id: LUIS.id, name: LUIS.name, initials: LUIS.initials, open: 7, overdue: 1, occupancyPct: 70, inProgress: 2, avgDaysLate: 9 },
    { id: MARTA.id, name: MARTA.name, initials: MARTA.initials, open: 6, overdue: 2, occupancyPct: 60, inProgress: 1, avgDaysLate: null },
  ],
  tasksByTramoAssignee: [
    { tramo: "presale", assigneeId: LUIS.id, open: 6, overdue: 1, ageDays: 24 },
    { tramo: "diseno", assigneeId: ANA.id, open: 10, overdue: 4, ageDays: 70 },
    { tramo: "construccion", assigneeId: MARTA.id, open: 6, overdue: 2, ageDays: 54 },
    { tramo: "construccion", assigneeId: LUIS.id, open: 1, overdue: 0, ageDays: 9 },
  ],
  todayAgenda: [
    { id: "d-1", title: "Entrega de planos", start: "2026-11-09", allDay: true, project: "Oficina Polanco", tramo: "diseno", kind: "entrega", assignee: ANA },
    { id: "e-2", title: "Visita de obra", start: "2026-11-09T12:00", project: "Depto Roma", tramo: "construccion", kind: "evento", assignee: MARTA },
    { id: "e-1", title: "Junta de diseño", start: "2026-11-09T10:30", project: "Oficina Polanco", tramo: "diseno", kind: "evento", assignee: LUIS },
  ],
  sections: { showTeamWorkload: true, showProjectRisk: true },
};

export const ANALITICO_PEOPLE = { LUIS, ANA, MARTA };
