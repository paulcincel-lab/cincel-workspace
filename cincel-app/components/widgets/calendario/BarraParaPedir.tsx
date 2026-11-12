"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { useBarraProposal } from "@/components/calendario/use-barra-proposal";
import { useProposal } from "@/components/calendario/use-proposal";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { StyleView } from "@/components/widgets/StyleView";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { AssistantCalendarContext, Proposal } from "@/lib/types/calendario";

import { ProposalCard } from "./ProposalCard";
import { ProposalTable } from "./ProposalTable";

export type BarraParaPedirProps = {
  context: AssistantCalendarContext;
  examples: string[];
  onProposal?(proposal: Proposal): void;
};

type BarraVariant = "visual" | "esencial" | "analitico";

const LABEL = "Pide algo para tu calendario";
const PLACEHOLDER = "Pide algo: “Junta con el cliente de Madrid 22 mañana a las 10”";

/**
 * The bar to ask the asistente for a change (FE §7.2). Visual: bar plus the
 * proposal card under it (the overlay draws on the grid); Esencial: a soft
 * input and one big Aplicar; Analítico: the bar and the checkbox table.
 */
export function BarraParaPedir(props: BarraParaPedirProps) {
  return (
    <StyleView
      visual={() => <BarraBody {...props} variant="visual" />}
      esencial={() => <BarraBody {...props} variant="esencial" />}
      analitico={() => <BarraBody {...props} variant="analitico" />}
    />
  );
}

function BarraBody({ context, examples, onProposal, variant }: BarraParaPedirProps & { variant: BarraVariant }): ReactNode {
  const draft = useCalendarioUi((s) => s.barDraft);
  const setDraft = useCalendarioUi((s) => s.setBarDraft);
  const toggleChange = useCalendarioUi((s) => s.toggleChange);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { proposal, checked, stale } = useProposal();
  const flow = useBarraProposal(context, { onProposal, onError: setError });

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || flow.pending) return;
    setDraft(trimmed);
    flow.ask(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(draft);
    } else if (e.key === "Escape") {
      setDraft("");
      setError("");
    }
  };

  const edit = () => {
    if (proposal) flow.cancel(proposal.id);
    inputRef.current?.focus();
  };

  return (
    <section aria-label="Barra para pedir" data-slot="barra-para-pedir" data-variant={variant} className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <span aria-hidden className="text-primary">
          ✦
        </span>
        <Input
          ref={inputRef}
          type="text"
          aria-label={LABEL}
          aria-describedby={error ? "barra-error" : undefined}
          aria-invalid={error ? true : undefined}
          placeholder={PLACEHOLDER}
          value={draft}
          disabled={flow.pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className={variant === "esencial" ? "h-12 min-w-0 flex-1 rounded-full" : "min-w-0 flex-1"}
        />
        <Button type="button" onClick={() => submit(draft)} disabled={flow.pending || draft.trim() === ""}>
          {flow.pending ? (
            <>
              <LoaderCircleIcon aria-hidden className="animate-spin motion-reduce:animate-none" />
              Pensando…
            </>
          ) : (
            "Pedir"
          )}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ejemplos">
        <span className="text-xs text-muted-foreground">Ejemplos</span>
        {examples.map((example) => (
          <Button
            key={example}
            type="button"
            variant="outline"
            size="sm"
            disabled={flow.pending}
            onClick={() => {
              setDraft(example);
              submit(example);
            }}
          >
            {example}
          </Button>
        ))}
      </div>
      {error ? (
        <p id="barra-error" role="alert" className="text-sm text-destructive-ink">
          {error}
        </p>
      ) : null}
      {proposal ? (
        variant === "analitico" ? (
          <ProposalTable
            proposal={proposal}
            checked={checked}
            variant={variant}
            onToggle={toggleChange}
            onApply={() => flow.apply(proposal.id, checked)}
            onCancel={() => flow.cancel(proposal.id)}
            onEdit={edit}
            stale={stale}
            onRetry={edit}
            pending={flow.applying}
          />
        ) : (
          <ProposalCard
            proposal={proposal}
            checked={checked}
            variant={variant}
            onToggle={toggleChange}
            onApply={() => flow.apply(proposal.id, checked)}
            onCancel={() => flow.cancel(proposal.id)}
            onEdit={edit}
            stale={stale}
            onRetry={edit}
            pending={flow.applying}
          />
        )
      ) : null}
    </section>
  );
}
