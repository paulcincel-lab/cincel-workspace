"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import {
  EMPTY_TEXT,
  GithubChip,
  KindChip,
  PriorityChip,
  TicketAvatar,
  type MejorasViewProps,
} from "@/components/widgets/mejoras/mejoras-parts";
import { useMejorasRows } from "@/components/widgets/mejoras/use-triage";
import { timeAgo } from "@/lib/my-space/my-tasks";
import { BOARD_FILTERS, BOARD_STATUSES, groupByStatus } from "@/lib/soporte/mejoras-triage";
import { AREA_LABEL, STATUS_LABEL } from "@/lib/types/soporte";

export const REVIEW_LABEL = "Revisar";

/**
 * Mejoras, Esencial style (frame `Mejoras-Esencial`): the solicitudes in a
 * list grouped by status, each row with one primary action, "Revisar", which
 * opens the detail where the admin triages and answers.
 */
export function MejorasEsencial({ onOpen }: MejorasViewProps) {
  const { rows, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useMejorasRows(BOARD_FILTERS);
  const [now] = useState(() => new Date());

  if (error && rows.length === 0) throw error;
  if (isPending) return <LoadingSkeleton variant="list" />;

  const groups = groupByStatus(rows);
  const visible = BOARD_STATUSES.filter((status) => groups[status].length > 0);
  if (visible.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{EMPTY_TEXT}</p>;

  return (
    <div className="flex flex-col gap-4">
      {visible.map((status) => (
        <Card key={status} data-status={status}>
          <CardHeader>
            <CardTitle id={`mejoras-group-${status}`} className="flex items-center gap-2" role="heading" aria-level={2}>
              {STATUS_LABEL[status]}
              <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{groups[status].length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {groups[status].map((row) => (
                <li key={row.id} data-ticket={row.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] tracking-[.08em] text-muted-foreground">{row.code}</span>
                      <KindChip kind={row.kind} />
                      <PriorityChip priority={row.priority} />
                      <GithubChip row={row} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{row.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <TicketAvatar person={row.author} />
                      {row.author.name} · {AREA_LABEL[row.area]} · {timeAgo(row.createdAt, now)}
                    </span>
                  </div>
                  <Button type="button" size="sm" onClick={() => onOpen(row.code)} aria-label={`${REVIEW_LABEL} ${row.code}: ${row.title}`}>
                    {REVIEW_LABEL}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {hasNextPage ? (
        <Button type="button" variant="outline" className="self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          Cargar más
        </Button>
      ) : null}
    </div>
  );
}
