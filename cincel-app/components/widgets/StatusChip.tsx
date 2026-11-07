"use client";

import type { TaskStatusRef } from "@/lib/types/redesign";

/**
 * Task status chip (redesign FE §4.10.1): adapter over
 * `components/v2/status/StatusBadge` `{ label, token }`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type StatusChipProps = { status: TaskStatusRef; size?: "sm" | "md" };

export function StatusChip(props: StatusChipProps) {
  void props;
  return null;
}
