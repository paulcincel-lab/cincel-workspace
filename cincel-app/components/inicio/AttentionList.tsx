"use client";

import { AttentionListWidget } from "@/components/widgets/AttentionListWidget";
import type { AttentionItem } from "@/lib/types/widgets";

import { EmptyWidgetCard } from "./EmptyWidgetCard";

export type AttentionListProps = {
  items: AttentionItem[];
  /**
   * Not read: `AttentionListWidget` renders the current style from
   * `StyleProvider` (FE §4.10, §18 item 15). Kept for the §4.3 contract.
   */
  variant?: "visual" | "esencial" | "analitico";
  totalCount?: number;
};

const TITLE = "Requiere atención";

/** "Requiere atención" (redesign FE §3.2, §4.3): an instance of `AttentionListWidget`. */
export function AttentionList({ items, totalCount }: AttentionListProps) {
  if (items.length === 0) return <EmptyWidgetCard title={TITLE} text="Nada requiere atención hoy" />;
  return (
    <AttentionListWidget
      title={TITLE}
      items={items}
      totalCount={totalCount ?? items.length}
      moreHref="/tareas?vista=lista&responsable=yo"
    />
  );
}
