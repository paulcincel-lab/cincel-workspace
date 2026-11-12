"use client";

import { Button } from "@/components/ui/shadcn/button";

export const PROPOSAL_LEGEND = "Cambio propuesto por el asistente (sin aplicar)";
export const PROPOSAL_STALE_TEXT = "Esta propuesta ya no está vigente.";

export type ProposalVariant = "visual" | "esencial" | "analitico";

/** Stale or expired card: the text and one way out. */
export function ProposalStaleNotice({ onRetry }: { onRetry?(): void }) {
  return (
    <div role="status" data-slot="proposal-stale" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>{PROPOSAL_STALE_TEXT}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Pedir de nuevo
        </Button>
      ) : null}
    </div>
  );
}

/** Label of the main button: "Aplicar" for a card, "Aplicar y avisar" when invitations go out. */
export function applyLabel(kind: "card" | "table" | "notify"): string {
  if (kind === "notify") return "Aplicar y avisar";
  if (kind === "table") return "Aplicar cambios";
  return "Aplicar";
}
