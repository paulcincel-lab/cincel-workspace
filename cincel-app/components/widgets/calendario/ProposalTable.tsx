"use client";

import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Button } from "@/components/ui/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { proposalRows, proposalTableTitle } from "@/lib/calendario/proposal-view";
import type { Proposal } from "@/lib/types/calendario";

import { applyLabel, ProposalStaleNotice, type ProposalVariant } from "./proposal-parts";

export type ProposalTableProps = {
  proposal: Proposal;
  checked: string[];
  variant?: ProposalVariant;
  onToggle?(changeId: string): void;
  onApply?(): void;
  onCancel?(): void;
  onEdit?(): void;
  stale?: boolean;
  onRetry?(): void;
  pending?: boolean;
};

/** The open proposal as a table with a checkbox per change; unchecked rows stay out of Aplicar (FE §7.1). */
export function ProposalTable({ proposal, checked, onToggle, onApply, onCancel, onEdit, stale, onRetry, pending }: ProposalTableProps) {
  const rows = proposalRows(proposal);
  const count = rows.filter((r) => checked.includes(r.changeId)).length;
  const notifies = proposal.changes.some((c) => (c.type === "event_update" || c.type === "event_cancel") && c.notify);
  return (
    <section aria-label="Propuesta" data-slot="proposal-table" className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      {stale ? (
        <ProposalStaleNotice onRetry={onRetry} />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{proposalTableTitle(proposal)}</h3>
            {proposal.line ? <p className="text-sm text-muted-foreground">{proposal.line}</p> : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Incluir</span>
                </TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Antes → Después</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const on = checked.includes(row.changeId);
                return (
                  <TableRow key={row.changeId} data-state={on ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={on}
                        aria-label={`Incluir ${row.title}`}
                        disabled={pending}
                        onCheckedChange={() => onToggle?.(row.changeId)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal">{row.title}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{row.project}</TableCell>
                    <TableCell className="whitespace-normal">
                      {row.before ? (
                        <>
                          <span className="text-destructive-ink line-through">{row.before}</span>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> cambia a </span>
                        </>
                      ) : null}
                      <span>{row.after}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {proposal.deferred.length > 0 ? (
            <div className="text-sm">
              <p className="font-medium">No cupo</p>
              <ul className="text-muted-foreground">
                {proposal.deferred.map((d) => (
                  <li key={d.taskId}>
                    {d.title}: {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onEdit ? (
              <Button type="button" variant="outline" onClick={onEdit} disabled={pending}>
                Editar
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={onApply} disabled={pending || count === 0}>
              {applyLabel(notifies ? "notify" : "table")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
