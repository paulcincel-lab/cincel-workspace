import type { ReactNode } from "react";

import type { HistoryEvent } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

type Props = {
  /** Events rendered in the given order; callers sort them. */
  events: HistoryEvent[];
  /** Rendered instead of the list when there are no events. */
  empty: ReactNode;
  /** Draws a border around each entry. */
  bordered?: boolean;
};

/** One-line text for a bitácora entry: the comment, or the field change. */
export function historyEventText(item: HistoryEvent): string {
  return item.kind === "comentario"
    ? (item.comment ?? "")
    : `Cambió ${item.field ?? "un campo"}: ${item.beforeValue ?? "—"} → ${item.afterValue ?? "—"}`;
}

/** Bitácora entries (date, author and text), shared by the task, contact and project bitácoras. */
export function HistoryEventList({ events, empty, bordered = false }: Props) {
  if (events.length === 0) return <>{empty}</>;
  return (
    <div className="space-y-2">
      {events.map((item) => (
        <div
          key={item.id}
          className={`rounded-xl ${bordered ? "border border-border " : ""}bg-muted p-3 text-sm text-muted-foreground`}
        >
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{formatDateDMY(item.eventAt.slice(0, 10))}</span>
            <span>{item.actor?.name ?? "Sistema"}</span>
          </div>
          <p className="mt-2">{historyEventText(item)}</p>
        </div>
      ))}
    </div>
  );
}
