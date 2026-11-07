"use client";

import type { WorkflowRef } from "@/lib/types/core";

/**
 * Tramo badge of the library (redesign FE §4.10.1, §21.2): chip, dot or text,
 * over the v2 badge through `lib/tramos/compat.ts`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type TramoBadgeProps = { tramo: WorkflowRef; variant?: "chip" | "dot" | "text" };

export function TramoBadge(props: TramoBadgeProps) {
  void props;
  return null;
}
