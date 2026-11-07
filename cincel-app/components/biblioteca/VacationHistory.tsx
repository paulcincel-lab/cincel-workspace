"use client";

import type { VacationRequest } from "@/lib/types/redesign";

export type VacationHistoryProps = { requests: VacationRequest[]; onCancelled(id: string): void };

/**
 * Vacation history with status chips and cancel (redesign FE §3.7) on
 * `RecordTable`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function VacationHistory(props: VacationHistoryProps) {
  void props;
  return null;
}
