/**
 * `InicioData` fixtures for the Inicio tests (redesign FE §17). Numbers are
 * distinct on purpose so a test can find each KPI value in every style.
 * `INICIO_NON_ADMIN` is what `fetchInicioAction` returns to a viewer without
 * `canSeeAdminData` (B8): no admin task and no client / origin field.
 */
import type { InicioData } from "@/lib/types/redesign";

export const KPI_VALUES = {
  proyectos_activos: 37,
  vencidas: 26,
  bloqueadas: 43,
  revisiones_7d: 11,
  completadas_semana: 58,
} as const;

/** Destination of the Vencidas KPI (`INICIO_KPI.vencidas.href`). */
export const VENCIDAS_HREF = "/tareas?vista=lista";

export const INICIO_NON_ADMIN: InicioData = {
  kpis: [
    { key: "proyectos_activos", label: "Proyectos activos", value: KPI_VALUES.proyectos_activos, series7: [30, 31, 33, 34, 35, 36, 37] },
    {
      key: "vencidas",
      label: "Vencidas",
      value: KPI_VALUES.vencidas,
      href: VENCIDAS_HREF,
      delta: { value: -2, good: true, caption: "vs. semana pasada" },
    },
    { key: "bloqueadas", label: "Bloqueadas", value: KPI_VALUES.bloqueadas },
    { key: "revisiones_7d", label: "Revisiones · 7 días", value: KPI_VALUES.revisiones_7d },
    {
      key: "completadas_semana",
      label: "Completadas · semana",
      value: KPI_VALUES.completadas_semana,
      visibleIn: ["analitico"],
    },
  ],
  tasksByTramo: [
    { key: "presale", label: "Presale", value: 14, colorVar: "var(--chart-1)", secondary: 1, extra: { diasProm: 4 } },
    { key: "diseno", label: "Diseño", value: 22, colorVar: "var(--chart-2)", secondary: 2, extra: { diasProm: 7 } },
    { key: "construccion", label: "Construcción", value: 19, colorVar: "var(--chart-3)", secondary: 3, extra: { diasProm: 9 } },
  ],
  // 12 weeks, as the loader returns them (INICIO_PACE_WEEKS); the card shows the last 8 by default.
  weeklyPace: [
    { weekStart: "2026-08-17", created: 7, completed: 6 },
    { weekStart: "2026-08-24", created: 8, completed: 9 },
    { weekStart: "2026-08-31", created: 10, completed: 8 },
    { weekStart: "2026-09-07", created: 11, completed: 7 },
    { weekStart: "2026-09-14", created: 12, completed: 10 },
    { weekStart: "2026-09-21", created: 15, completed: 13 },
    { weekStart: "2026-09-28", created: 9, completed: 12 },
    { weekStart: "2026-10-05", created: 16, completed: 14 },
    { weekStart: "2026-10-12", created: 13, completed: 15 },
    { weekStart: "2026-10-19", created: 17, completed: 16 },
    { weekStart: "2026-10-26", created: 14, completed: 18 },
    { weekStart: "2026-11-02", created: 19, completed: 17 },
  ],
  attention: [
    {
      id: "t-1",
      title: "Revisar planos de cocina",
      href: "/tareas?tarea=t-1",
      project: "Casa Lomas",
      tramo: "diseno",
      reason: "Vencida",
      tone: "critical",
      assignee: { id: "s-2", name: "Luis Pérez", initials: "LP" },
      due: "2026-11-03",
      daysLate: 3,
    },
  ],
  myDay: [
    { id: "e-1", title: "Visita de obra", start: "2026-11-06T16:00:00Z", end: "2026-11-06T17:00:00Z", project: "Casa Lomas", tramo: "construccion" },
    { id: "e-2", title: "Junta de diseño", start: "2026-11-06T19:00:00Z", project: "Depto Roma", tramo: "diseno" },
  ],
  projectsProgress: [
    { id: "p-1", label: "Casa Lomas", real: 64, plan: null, budgetPct: null, href: "/proyectos/p-1", next: { title: "Entrega de planos", date: "2026-11-12" } },
    { id: "p-2", label: "Depto Roma", real: 28, plan: null, budgetPct: null, href: "/proyectos/p-2", next: null },
  ],
  workload: [
    { id: "s-2", name: "Luis Pérez", initials: "LP", open: 8, overdue: 2 },
    { id: "s-3", name: "Marta Ruiz", initials: "MR", open: 5, overdue: 0 },
  ],
};

/** The same day for an admin: one admin task needs attention (only `canSeeAdminData` viewers get it). */
export const ADMIN_TASK_TITLE = "Pagar nómina de contratistas";

export const INICIO_ADMIN: InicioData = {
  ...INICIO_NON_ADMIN,
  attention: [
    ...INICIO_NON_ADMIN.attention,
    {
      id: "t-admin",
      title: ADMIN_TASK_TITLE,
      href: "/tareas?tarea=t-admin",
      project: "Administración",
      tramo: null,
      reason: "Vence hoy",
      tone: "warn",
      assignee: { id: "s-1", name: "Ana López", initials: "AL" },
      due: "2026-11-06",
      daysLate: null,
    },
  ],
};

export const INICIO_EMPTY: InicioData = {
  kpis: [],
  tasksByTramo: [],
  weeklyPace: [],
  attention: [],
  myDay: [],
  projectsProgress: [],
  workload: [],
};
