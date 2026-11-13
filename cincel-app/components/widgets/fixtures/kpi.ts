/**
 * `KpiWidget` fixture (redesign FE §4.10.1, §17; frames `Estilos`,
 * `Dashboard`, `InicioEsencial`, `InicioAnalitico`): the Inicio indicators.
 * The same numbers are rendered in Visual, Esencial and Analítico;
 * "Completadas · semana" is Analítico only (`visibleIn`). Data shapes come
 * only from `lib/types/widgets.ts`.
 */
import type { KpiDatum } from "@/lib/types/widgets";

export const kpiFixture: KpiDatum[] = [
  {
    key: "activeProjects",
    label: "Proyectos activos",
    value: 12,
    delta: { value: 2, good: true, caption: "vs. semana pasada" },
    series7: [9, 10, 10, 11, 11, 12, 12],
    avg30: 10.4,
    min30: 8,
    max30: 12,
    split: [
      { etapa: "presale", share: 0.25 },
      { etapa: "diseno", share: 0.33 },
      { etapa: "construccion", share: 0.42 },
    ],
    caption: "3 inician este mes",
    href: "/proyectos",
  },
  {
    key: "overdue",
    label: "Vencidas",
    value: 31,
    // Fewer overdue tasks is good: a negative delta with `good: true`.
    delta: { value: -4, good: true, caption: "vs. semana pasada" },
    series7: [38, 37, 36, 35, 34, 33, 31],
    avg30: 34.2,
    min30: 31,
    max30: 40,
    href: "/tareas?vencidas=1",
  },
  {
    key: "blocked",
    label: "Bloqueadas",
    value: 5,
    // More blocked tasks is bad: a positive delta with `good: false`.
    delta: { value: 3, good: false, caption: "vs. semana pasada" },
    series7: [2, 2, 3, 2, 3, 4, 5],
    avg30: 2.8,
    min30: 1,
    max30: 5,
  },
  {
    key: "reviews7d",
    label: "Revisiones · 7 días",
    value: 1240,
    display: "1240",
    series7: [150, 170, 160, 190, 180, 200, 190],
    avg30: 172.5,
    min30: 140,
    max30: 210,
  },
  {
    key: "completedWeek",
    label: "Completadas · semana",
    value: 18,
    delta: { value: -1, good: false, caption: "vs. semana pasada" },
    series7: [2, 3, 1, 4, 3, 2, 3],
    avg30: 17.6,
    min30: 12,
    max30: 22,
    visibleIn: ["analitico"],
  },
];

/** The headline numbers of the fixture, as every style renders them. */
export const kpiFixtureValues: Record<string, string> = {
  activeProjects: "12",
  overdue: "31",
  blocked: "5",
  reviews7d: "1240",
  completedWeek: "18",
};

/** Keys shown in Visual and Esencial (the Analítico-only item is filtered out). */
export const kpiFixtureSharedKeys = ["activeProjects", "overdue", "blocked", "reviews7d"] as const;
