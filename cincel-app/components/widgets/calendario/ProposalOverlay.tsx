import type { ReactNode } from "react";

import { overlayEntries, originalItemIds, type OverlayEntry } from "@/lib/calendario/proposal-view";
import type { CalendarioRange, Proposal } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { PROPOSAL_LEGEND } from "./proposal-parts";

export type ProposalOverlayProps = {
  proposal: Proposal;
  range?: CalendarioRange;
  checked: string[];
  /** Lanes and grids (#1090, Mes, Semana, Día) draw the entries themselves. */
  children?(entries: OverlayEntry[], originals: Set<string>): ReactNode;
};

/** Classes of an item the proposal moves: greyed and struck. Pair with a screen-reader note "Se moverá". */
export const PROPOSAL_ORIGINAL_CLASS = "opacity-40 line-through";
export const PROPOSAL_ORIGINAL_DESCRIPTION = "Se moverá";
/** Classes of a proposed item: 2 px dashed primary outline with a 5 % tint. */
export const PROPOSAL_DASHED_CLASS = "border-2 border-dashed border-primary bg-primary/5";

/**
 * Draws the open proposal on the calendar body: the proposed items dashed with
 * a text tag, the originals struck, and the legend line (FE §7.1). The state is
 * announced by the tag and the legend, never by colour alone.
 */
export function ProposalOverlay({ proposal, range, checked, children }: ProposalOverlayProps) {
  const entries = overlayEntries(proposal, checked);
  const originals = originalItemIds(proposal, checked);
  const ghosts = range ? range.items.filter((item) => originals.has(item.id)) : [];
  return (
    <section aria-label="Propuesta del asistente" data-slot="proposal-overlay" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{PROPOSAL_LEGEND}</p>
      {children ? (
        children(entries, originals)
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ghosts.map((item) => (
            <li
              key={`original:${item.id}`}
              data-slot="proposal-original"
              className={cn("rounded-md border px-2 py-1 text-sm", PROPOSAL_ORIGINAL_CLASS)}
            >
              {item.title}
              <span className="sr-only"> ({PROPOSAL_ORIGINAL_DESCRIPTION})</span>
            </li>
          ))}
          {entries.map((entry) => (
            <li key={entry.changeId} data-slot="proposal-item" className={cn("flex flex-col rounded-md px-2 py-1 text-sm", PROPOSAL_DASHED_CLASS)}>
              <span>{entry.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{entry.tag}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
