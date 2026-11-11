/** Spanish copy built on the server: lead paragraphs, reasons and toasts (BE §6.3, §10.1). Pure. Bodies belong to the Phase 4 issue. */
import { notImplemented } from "@/lib/stubs";
import type { ApplyProposalResult, DaySummary, UndoProposalResult, WeekSummary } from "@/lib/types/calendario";

/** "Buenos días" < 12:00, "Buenas tardes" < 19:00, else "Buenas noches" (org time). */
export function greeting(hour: number, firstName: string): string {
  return notImplemented("greeting", hour, firstName);
}

export function dayLead(input: { meetings: number; due: number; firstRisk: string | null }): string {
  return notImplemented("dayLead", input);
}

export function weekLead(input: { meetings: number; due: number; overloaded: { date: string; hours: number }[]; overdueLastWeek: number }): string {
  return notImplemented("weekLead", input);
}

export function applyToast(result: Pick<ApplyProposalResult, "applied" | "skipped">, kind: string): string {
  return notImplemented("applyToast", result, kind);
}

export function undoToast(result: Pick<UndoProposalResult, "restored" | "skipped">): string {
  return notImplemented("undoToast", result);
}

export function summaryLead(summary: Pick<DaySummary | WeekSummary, "lead">): string {
  return notImplemented("summaryLead", summary);
}
