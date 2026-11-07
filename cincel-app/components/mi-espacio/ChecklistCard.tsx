"use client";

import type { Checklist } from "@/lib/types/redesign";

export type ChecklistCardProps = { checklist: Checklist; onChange(c: Checklist): void };

/**
 * One checklist (redesign FE §3.3): n/m, progress, toggles, add item. Reuses
 * the task checklist rows.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ChecklistCard(props: ChecklistCardProps) {
  void props;
  return null;
}
