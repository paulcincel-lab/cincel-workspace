"use client";

import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/lib/types/calendario";

import { applyLabel, ProposalStaleNotice, type ProposalVariant } from "./proposal-parts";

export type ProposalCardProps = {
  proposal: Proposal;
  checked: string[];
  variant?: ProposalVariant;
  onToggle?(changeId: string): void;
  onApply?(): void;
  onCancel?(): void;
  onEdit?(): void;
  /** Stale or expired: the card says so and offers "Pedir de nuevo". */
  stale?: boolean;
  onRetry?(): void;
  pending?: boolean;
};

/** The open proposal as a soft card: title, line, one big Aplicar, Editar and Cancelar (FE §7.1). */
export function ProposalCard({ proposal, checked, variant = "visual", onApply, onCancel, onEdit, stale, onRetry, pending }: ProposalCardProps) {
  const esencial = variant === "esencial";
  const notifies = proposal.changes.some((c) => (c.type === "event_update" || c.type === "event_cancel") && c.notify);
  return (
    <section
      aria-label="Propuesta"
      data-slot="proposal-card"
      data-variant={variant}
      className={cn("flex flex-col gap-3 border bg-card text-card-foreground", esencial ? "rounded-2xl p-5" : "rounded-xl p-4")}
    >
      {stale ? (
        <ProposalStaleNotice onRetry={onRetry} />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs text-muted-foreground">Propuesta</p>
            <h3 className="text-base font-semibold">{proposal.title}</h3>
            {proposal.line ? <p className="text-sm text-muted-foreground">{proposal.line}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={onApply}
              disabled={pending || checked.length === 0}
              className={esencial ? "h-[54px] px-6 text-base" : undefined}
            >
              {applyLabel(notifies ? "notify" : "card")}
            </Button>
            {onEdit ? (
              <Button type="button" variant="outline" onClick={onEdit} disabled={pending} className={esencial ? "h-[54px]" : undefined}>
                Editar
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} className={esencial ? "h-[54px]" : undefined}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
