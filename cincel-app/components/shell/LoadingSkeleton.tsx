import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";

/**
 * Loading skeleton per page shape (redesign FE §4.2, §3, frame
 * `EstadosSistema`), built on shadcn `Skeleton`. The wrapper is a polite
 * `status` region with `aria-busy="true"` and a screen-reader label.
 *
 * `rows`: number of items for `kpis` (cards, default 4), `cards` (default 6),
 * `list` (default 5), `table` (body rows, default 5), `board` (cards per
 * column, default 3) and `calendar` (weeks, default 5).
 */
export type LoadingSkeletonProps = {
  variant: "kpis" | "cards" | "list" | "table" | "board" | "calendar";
  rows?: number;
};

export const LOADING_LABEL = "Cargando…";

const DEFAULT_ROWS: Record<LoadingSkeletonProps["variant"], number> = {
  kpis: 4,
  cards: 6,
  list: 5,
  table: 5,
  board: 3,
  calendar: 5,
};

const BOARD_COLUMNS = 4;
const TABLE_COLUMNS = 4;
const WEEK_DAYS = 7;

function count(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function Kpis({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {count(rows).map((i) => (
        <Card key={i} size="sm" data-skeleton="item">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Cards({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {count(rows).map((i) => (
        <Card key={i} data-skeleton="item">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function List({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      {count(rows).map((i) => (
        <div key={i} data-skeleton="item" className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

function Table({ rows }: { rows: number }) {
  const widths = ["w-3/10", "w-1/5", "w-3/20", "w-1/10"];
  return (
    <div className="flex flex-col gap-3">
      <div data-skeleton="header" className="flex gap-3">
        {count(TABLE_COLUMNS).map((c) => (
          <Skeleton key={c} className={`h-2.5 ${widths[c]}`} />
        ))}
      </div>
      {count(rows).map((i) => (
        <div key={i} data-skeleton="item" className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function Board({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {count(BOARD_COLUMNS).map((c) => (
        <div key={c} data-skeleton="column" className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
          <Skeleton className="h-4 w-1/2" />
          {count(rows).map((i) => (
            <Card key={i} size="sm" data-skeleton="item">
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function Calendar({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div data-skeleton="header" className="grid grid-cols-7 gap-2">
        {count(WEEK_DAYS).map((d) => (
          <Skeleton key={d} className="h-3" />
        ))}
      </div>
      {count(rows).map((w) => (
        <div key={w} data-skeleton="item" className="grid grid-cols-7 gap-2">
          {count(WEEK_DAYS).map((d) => (
            <Skeleton key={d} className="h-16 sm:h-20" />
          ))}
        </div>
      ))}
    </div>
  );
}

const VARIANTS: Record<LoadingSkeletonProps["variant"], (p: { rows: number }) => ReactNode> = {
  kpis: Kpis,
  cards: Cards,
  list: List,
  table: Table,
  board: Board,
  calendar: Calendar,
};

export function LoadingSkeleton({ variant, rows }: LoadingSkeletonProps) {
  const n = rows !== undefined && Number.isFinite(rows) ? Math.max(1, Math.floor(rows)) : DEFAULT_ROWS[variant];
  const Variant = VARIANTS[variant];
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-slot="loading-skeleton" data-variant={variant}>
      <span className="sr-only">{LOADING_LABEL}</span>
      <div aria-hidden="true">
        <Variant rows={n} />
      </div>
    </div>
  );
}
