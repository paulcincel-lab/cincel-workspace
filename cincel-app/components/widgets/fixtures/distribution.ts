/**
 * `DistributionWidget` fixture (redesign FE §4.10.1, §17; frames `Dashboard`,
 * `InicioEsencial`, `InicioAnalitico`): "Tareas por etapa" with open and
 * overdue counts. The same numbers are rendered in Visual, Esencial and
 * Analítico. Data shapes come only from `lib/types/widgets.ts`.
 */
import type { DistributionSegment } from "@/lib/types/widgets";

export type DistributionFixture = {
  title: string;
  segments: DistributionSegment[];
  totalLabel?: string;
  secondaryLabel?: string;
  extraColumns?: { key: string; label: string }[];
};

export const distributionFixture: DistributionFixture = {
  title: "Tareas por etapa",
  totalLabel: "Abiertas",
  secondaryLabel: "Vencidas",
  extraColumns: [{ key: "diasProm", label: "Días prom." }],
  segments: [
    { key: "presale", label: "Presale", value: 9, colorVar: "var(--chart-1)", secondary: 5, extra: { diasProm: 3.1 } },
    { key: "diseno", label: "Diseño", value: 14, colorVar: "var(--chart-2)", secondary: 8, extra: { diasProm: 5.4 } },
    { key: "construccion", label: "Construcción", value: 22, colorVar: "var(--chart-3)", secondary: 14, extra: { diasProm: 9.8 } },
    { key: "decoracion", label: "Decoración", value: 6, colorVar: "var(--chart-4)", secondary: 4, extra: { diasProm: 4.2 } },
  ],
};

/** Expected numbers for the fixture above (sum 51, overdue 31). */
export const distributionFixtureExpected = {
  total: 51,
  secondaryTotal: 31,
  /** Share of the total per segment, rounded %. */
  share: { presale: 18, diseno: 27, construccion: 43, decoracion: 12 },
  /** `secondary / value`, rounded %. */
  ratio: { presale: 56, diseno: 57, construccion: 64, decoracion: 67 },
  ratioTotal: 61,
} as const;

/** A distribution without the secondary measure (Analítico shows the share %). */
export const distributionShareFixture: DistributionFixture = {
  title: "Proyectos por etapa",
  segments: [
    { key: "presale", label: "Presale", value: 3, colorVar: "var(--chart-1)" },
    { key: "diseno", label: "Diseño", value: 1, colorVar: "var(--chart-2)" },
  ],
};

export const distributionEmptyFixture: DistributionFixture = {
  ...distributionFixture,
  segments: [],
};
