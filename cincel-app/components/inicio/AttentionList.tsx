"use client";

import type { AttentionItem } from "@/lib/types/widgets";

export type AttentionListProps = { items: AttentionItem[]; variant: "visual" | "esencial" | "analitico" };

/**
 * "Requiere atención" (redesign FE §4.3): an instance of `AttentionListWidget`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AttentionList(props: AttentionListProps) {
  void props;
  return null;
}
