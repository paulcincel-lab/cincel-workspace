"use client";

import type { TicketDraft } from "@/lib/types/soporte";

export type ReportarDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled values, e.g. from an error page. */
  prefill?: Partial<TicketDraft>;
};

/** "Reportar o sugerir" (stub: #1110). */
export function ReportarDialog(_props: ReportarDialogProps) {
  return null;
}
