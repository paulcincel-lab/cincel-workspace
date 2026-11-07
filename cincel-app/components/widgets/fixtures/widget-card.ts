/**
 * `WidgetCard` fixture (redesign FE §4.10.1, §17): the same numbers are rendered
 * in Visual, Esencial and Analítico. Data shapes come only from `lib/types/widgets.ts`.
 */
import type { KpiDatum, Tone } from "@/lib/types/widgets";

export type WidgetCardFixture = {
  title: string;
  tone: Tone;
  moreHref: string;
  items: KpiDatum[];
};

export const widgetCardFixture: WidgetCardFixture = {
  title: "Ritmo semanal",
  tone: "ok",
  moreHref: "/tareas?vista=lista",
  items: [
    { key: "creadas", label: "Creadas", value: 24, display: "24" },
    { key: "completadas", label: "Completadas", value: 18, display: "18" },
    { key: "vencidas", label: "Vencidas", value: 3, display: "3" },
  ],
};

export const widgetCardEmptyFixture: WidgetCardFixture = {
  ...widgetCardFixture,
  tone: "default",
  items: [],
};
