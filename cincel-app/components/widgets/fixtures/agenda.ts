/**
 * `AgendaWidget` fixture (redesign FE §4.10.1, §17): one week of events
 * (lunes 9 – domingo 15 de noviembre de 2026) rendered with the same numbers in
 * Visual, Esencial and Analítico. Times carry no zone suffix, so they read as
 * local time wherever the tests run. Data shapes come only from
 * `lib/types/widgets.ts`.
 */
import type { AgendaItem } from "@/lib/types/widgets";

export type AgendaFixture = {
  title: string;
  /** Day the week / month / day views are anchored on (`YYYY-MM-DD`). */
  anchorDate: string;
  items: AgendaItem[];
};

export const agendaFixture: AgendaFixture = {
  title: "Agenda de la semana",
  anchorDate: "2026-11-09",
  items: [
    {
      id: "ev-planos",
      title: "Revisión de planos",
      start: "2026-11-09T09:00:00",
      end: "2026-11-09T10:30:00",
      project: "Casa Lomas",
      etapa: "diseno",
      attendees: ["Ana Ruiz", "Luis Pérez"],
      href: "/tareas?tarea=t-planos",
      meetingUrl: "https://cutto.example.com/reuniones/r-planos",
    },
    {
      id: "ev-obra",
      title: "Visita de obra",
      start: "2026-11-09T12:00:00",
      end: "2026-11-09T14:00:00",
      project: "Torre Norte",
      etapa: "construccion",
      attendees: ["Marco Díaz"],
      href: "/tareas?tarea=t-obra",
    },
    {
      id: "ev-render",
      title: "Entrega de render",
      start: "2026-11-09",
      allDay: true,
      project: "Casa Lomas",
      etapa: "diseno",
      href: "/tareas?tarea=t-render",
    },
    {
      id: "ev-cliente",
      title: "Llamada con cliente",
      start: "2026-11-11T16:00:00",
      end: "2026-11-11T16:30:00",
      estimated: true,
      project: "Residencia Valle",
      etapa: "presale",
      href: "/tareas?tarea=t-cliente",
    },
    {
      id: "ev-junta",
      title: "Junta de seguimiento",
      start: "2026-11-13T10:00:00",
      end: "2026-11-13T11:00:00",
      etapa: null,
      attendees: ["Ana Ruiz", "Marco Díaz", "Sofía León"],
    },
  ],
};

/** Events per day of the fixture week, as every style must count them. */
export const agendaFixtureDayCounts: Record<string, number> = {
  "2026-11-09": 3,
  "2026-11-11": 1,
  "2026-11-13": 1,
};

export const agendaEmptyFixture: AgendaFixture = {
  ...agendaFixture,
  items: [],
};
