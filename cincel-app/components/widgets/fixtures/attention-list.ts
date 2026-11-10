/**
 * `AttentionListWidget` fixture (redesign FE §4.10.1, §17): the same numbers are
 * rendered in Visual, Esencial and Analítico. Data shapes come only from
 * `lib/types/widgets.ts`.
 */
import type { AttentionItem } from "@/lib/types/widgets";

export type AttentionListFixture = {
  title: string;
  items: AttentionItem[];
  totalCount: number;
  moreHref: string;
};

export const attentionListFixture: AttentionListFixture = {
  title: "Requiere atención",
  totalCount: 7,
  moreHref: "/tareas?atencion=1",
  items: [
    {
      id: "t-planos-cocina",
      title: "Planos de cocina",
      href: "/tareas?tarea=t-planos-cocina",
      project: "Casa Lomas",
      tramo: "diseno",
      reason: "Vencida",
      tone: "critical",
      assignee: { id: "u-ana", name: "Ana Torres", initials: "AT" },
      due: "2026-11-02",
      daysLate: 5,
    },
    {
      id: "t-cotizacion-herreria",
      title: "Cotización de herrería",
      href: "/tareas?tarea=t-cotizacion-herreria",
      project: "Depto Roma",
      tramo: "construccion",
      reason: "Bloqueada",
      tone: "critical",
      assignee: { id: "u-luis", name: "Luis Méndez", initials: "LM" },
      due: "2026-11-05",
      daysLate: 2,
    },
    {
      id: "t-render-sala",
      title: "Render de sala",
      href: "/tareas?tarea=t-render-sala",
      project: "Casa Lomas",
      tramo: "diseno",
      reason: "En revisión",
      tone: "warn",
      assignee: { id: "u-ana", name: "Ana Torres", initials: "AT" },
      due: "2026-11-09",
      daysLate: null,
    },
    {
      id: "t-propuesta-cliente",
      title: "Propuesta para cliente",
      href: "/tareas?tarea=t-propuesta-cliente",
      project: "Oficinas Polanco",
      tramo: "presale",
      reason: "Sin responsable",
      tone: "warn",
      assignee: null,
      due: "2026-11-10",
      daysLate: null,
    },
    {
      id: "t-levantamiento",
      title: "Levantamiento de medidas",
      href: "/tareas?tarea=t-levantamiento",
      project: "Casa Coyoacán",
      tramo: null,
      reason: "Sin fecha",
      tone: "default",
      assignee: { id: "u-sofia", name: "Sofía Ruiz", initials: "SR" },
      due: null,
      daysLate: null,
    },
  ],
};

export const attentionListEmptyFixture: AttentionListFixture = {
  ...attentionListFixture,
  totalCount: 0,
  items: [],
};
