"use client";

import { KpiTiles, type KpiTilesProps } from "./KpiTiles";

export type KpiTableProps = KpiTilesProps;

/**
 * Inicio KPIs, Analítico name (redesign FE §4.3): the same `KpiWidget`
 * instance as `KpiTiles` (the widget renders the table in Analítico), kept so
 * both contract names resolve to one implementation.
 */
export function KpiTable(props: KpiTableProps) {
  return <KpiTiles {...props} />;
}
