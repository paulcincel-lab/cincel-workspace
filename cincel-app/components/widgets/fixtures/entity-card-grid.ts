/**
 * `EntityCardGrid` fixtures (redesign FE §4.10.1, §17): the same numbers are
 * rendered in Visual, Esencial and Analítico. Data shapes come only from
 * `lib/types/widgets.ts`. Frames `Proyectos`, `ProyectosEsencial`, `Biblioteca`.
 */
import type { EntityCard, RecordTableData } from "@/lib/types/widgets";

/** Proyectos: cards with an etapa (tinted head), progress, badges and meta. */
export const entityCardProjectsFixture: EntityCard[] = [
  {
    id: "p-local-espinopapa",
    title: "Local Espinopapa",
    subtitle: "Local comercial · CDMX",
    href: "/proyectos/p-local-espinopapa",
    iconName: "folder-kanban",
    etapa: "construccion",
    progress: 82,
    badges: [{ label: "14 vencidas", tone: "critical" }],
    meta: [
      { label: "Abiertas", value: "9" },
      { label: "Vencidas", value: "14" },
      { label: "Próxima entrega", value: "2 oct" },
    ],
  },
  {
    id: "p-guadalajara-83",
    title: "Guadalajara 83",
    subtitle: "Departamento · Condesa",
    href: "/proyectos/p-guadalajara-83",
    etapa: "diseno",
    progress: 58,
    badges: [{ label: "En tiempo", tone: "ok" }],
    meta: [
      { label: "Abiertas", value: "6" },
      { label: "Vencidas", value: "0" },
      { label: "Próxima entrega", value: "12 nov" },
    ],
  },
  {
    id: "p-salim-ortopedia",
    title: "Salim Ortopedia",
    subtitle: "Consultorio · Polanco",
    href: "/proyectos/p-salim-ortopedia",
    etapa: "presale",
    progress: 24,
    badges: [{ label: "Sin anticipo", tone: "warn" }],
    meta: [
      { label: "Abiertas", value: "4" },
      { label: "Vencidas", value: "1" },
      { label: "Próxima entrega", value: "24 nov" },
    ],
  },
];

/** Biblioteca index: no etapa, icon chip by `iconName`, meta only. */
export const entityCardLibraryFixture: EntityCard[] = [
  {
    id: "s-book",
    title: "Book",
    subtitle: "Portafolio de proyectos terminados para clientes.",
    href: "/biblioteca/book",
    iconName: "book-open",
    meta: [
      { label: "Archivos", value: "24" },
      { label: "Actualizado", value: "28 oct" },
    ],
  },
  {
    id: "s-manual",
    title: "Manual de la empresa",
    subtitle: "Procesos y políticas internas.",
    href: "/biblioteca/manual",
    iconName: "FileText",
    badges: [{ label: "Nuevo", tone: "default" }],
    meta: [
      { label: "Archivos", value: "12" },
      { label: "Actualizado", value: "1 nov" },
    ],
  },
];

/** The page's own Analítico table for the projects fixture (same numbers). */
export const entityCardProjectsTableFixture: RecordTableData = {
  columns: [
    { key: "title", label: "Proyecto" },
    { key: "progress", label: "Avance", align: "right", mono: true, format: "percent" },
    { key: "open", label: "Abiertas", align: "right", mono: true, format: "count" },
    { key: "overdue", label: "Vencidas", align: "right", mono: true, format: "count" },
  ],
  rows: [
    { id: "p-local-espinopapa", title: "Local Espinopapa", progress: 82, open: 9, overdue: 14 },
    { id: "p-guadalajara-83", title: "Guadalajara 83", progress: 58, open: 6, overdue: 0 },
    { id: "p-salim-ortopedia", title: "Salim Ortopedia", progress: 24, open: 4, overdue: 1 },
  ],
};

export const entityCardEmptyFixture: EntityCard[] = [];
