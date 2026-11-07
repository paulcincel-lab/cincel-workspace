"use client";

import { AttentionListWidget } from "@/components/widgets/AttentionListWidget";

import { toAttentionItems } from "./widget-adapters";

type Props = {
  title: string;
  items: string[];
};

/**
 * `render_list` (redesign FE §3.9, §4.11.1): a short titled enumeration as a
 * library `AttentionListWidget`, which renders the user's style.
 */
export function AssistantListMessage({ title, items }: Props) {
  return <AttentionListWidget title={title} items={toAttentionItems(items)} totalCount={items.length} />;
}
