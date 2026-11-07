"use client";

import type { ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { EntityCard, RecordTableData } from "@/lib/types/widgets";

/**
 * Card grid in three styles (redesign FE §4.10.1); Esencial / Analítico render
 * `table` (or one built from title, subtitle and meta).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type EntityCardGridProps = {
  items: EntityCard[];
  table?: RecordTableData;
  footer?: (item: EntityCard) => ReactNode;
  minWidth?: number;
  emptyState?: EmptyStateProps;
};

export function EntityCardGrid(props: EntityCardGridProps) {
  void props;
  return null;
}
