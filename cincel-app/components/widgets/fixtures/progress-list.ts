/**
 * `ProgressListWidget` fixture (redesign FE §4.10.1, §17): the same numbers are
 * rendered in Visual, Esencial and Analítico. Data shapes come only from
 * `lib/types/widgets.ts`.
 */
import type { ProgressItem } from "@/lib/types/widgets";

export type ProgressListFixture = {
  title: string;
  items: ProgressItem[];
};

export const progressListFixture: ProgressListFixture = {
  title: "Avance de proyectos activos",
  items: [
    {
      id: "p-casa-lomas",
      label: "Casa Lomas",
      sublabel: "Construcción",
      real: 62,
      plan: 70,
      budgetPct: 58,
      colorVar: "var(--chart-3)",
      href: "/proyectos/p-casa-lomas",
      next: { title: "Entrega de cocina", date: "2026-11-20" },
    },
    {
      id: "p-depto-roma",
      label: "Depto Roma",
      sublabel: "Diseño",
      real: 45,
      plan: 40,
      budgetPct: 30,
      colorVar: "var(--chart-2)",
      href: "/proyectos/p-depto-roma",
      next: { title: "Revisión de planos", date: "2026-11-12" },
    },
    {
      id: "p-oficina-polanco",
      label: "Oficina Polanco",
      sublabel: "Presale",
      real: 18,
      plan: 18,
      budgetPct: null,
      colorVar: "var(--chart-1)",
      next: null,
    },
  ],
};

export const progressListEmptyFixture: ProgressListFixture = {
  ...progressListFixture,
  items: [],
};
