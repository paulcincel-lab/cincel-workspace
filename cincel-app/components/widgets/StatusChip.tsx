"use client";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { StyleView } from "@/components/widgets/StyleView";
import { statusColorToken, taskStatusLabel, type StatusColorToken } from "@/lib/tasks/status-options";
import type { TaskStatusRef } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * Task status chip (redesign FE §4.10.1): thin adapter over
 * `components/v2/status/StatusBadge` `{ label, token }`. Visual renders the
 * tinted chip; Esencial and Analítico render the label as plain text (§15.2).
 * `status: null` renders `emptyText`; `loading` renders the list skeleton.
 */
export type StatusChipProps = {
  status: TaskStatusRef | null;
  size?: "sm" | "md";
  /** Shown when there is no status. */
  emptyText?: string;
  loading?: boolean;
};

export const STATUS_CHIP_EMPTY_TEXT = "Sin estatus";

/** Maps a status (custom name over base label; custom status colored by its base) to `{ label, token }`. */
export function statusChipModel(status: TaskStatusRef): { label: string; token: StatusColorToken } {
  return { label: taskStatusLabel(status), token: statusColorToken(status) };
}

export function StatusChip({ status, size = "sm", emptyText = STATUS_CHIP_EMPTY_TEXT, loading = false }: StatusChipProps) {
  if (loading) return <LoadingSkeleton variant="list" rows={1} />;
  if (!status) {
    return (
      <span data-slot="status-chip" data-empty="" className="text-muted-foreground">
        {emptyText}
      </span>
    );
  }
  const { label, token } = statusChipModel(status);
  const text = (
    <span data-slot="status-chip" data-token={token} className={cn(size === "md" && "text-sm")}>
      {label}
    </span>
  );
  return (
    <StyleView
      visual={() => (
        <span data-slot="status-chip" data-token={token} className="inline-flex">
          <StatusBadge label={label} token={token} size={size} />
        </span>
      )}
      esencial={() => text}
      analitico={() => text}
    />
  );
}
