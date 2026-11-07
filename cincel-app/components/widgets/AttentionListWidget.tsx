"use client";

import type { AttentionItem } from "@/lib/types/widgets";

/**
 * "Requiere atención" list in three styles (redesign FE §4.10.1).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type AttentionListWidgetProps = {
  title: string;
  items: AttentionItem[];
  totalCount?: number;
  moreHref?: string;
};

export function AttentionListWidget(props: AttentionListWidgetProps) {
  void props;
  return null;
}
