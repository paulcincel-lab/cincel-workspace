"use client";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import { StyleView } from "@/components/widgets/StyleView";
import { statusTone } from "@/components/widgets/esencial-tokens";
import { statusColorToken, taskStatusLabel, type StatusColorToken } from "@/lib/tasks/status-options";
import type { TaskStatusRef } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

/**
 * Task status chip (redesign FE §4.10.1): thin adapter over
 * `components/v2/status/StatusBadge` `{ label, token }`. Visual renders the
 * tinted chip; Esencial and Analítico render the label as plain text (§15.2).
 * `status: null` renders `emptyText`; `loading` renders the list skeleton.
 * `variant="dot"` renders dot + ink label in every style (`statusTone`).
 */
export type StatusChipProps = {
  status: TaskStatusRef | null;
  size?: "sm" | "md";
  /** Shown when there is no status. */
  emptyText?: string;
  loading?: boolean;
  /**
   * `auto` (default): the per-style rendering above. `dot`: a 7 px status dot
   * and the label in the status ink, the same in every style (Esencial rows).
   */
  variant?: "auto" | "dot";
};

export const STATUS_CHIP_EMPTY_TEXT = "Sin estatus";

/** Maps a status (custom name over base label; custom status colored by its base) to `{ label, token }`. */
export function statusChipModel(status: TaskStatusRef): { label: string; token: StatusColorToken } {
  return { label: taskStatusLabel(status), token: statusColorToken(status) };
}

export function StatusChip({
  status,
  size = "sm",
  emptyText = STATUS_CHIP_EMPTY_TEXT,
  loading = false,
  variant = "auto",
}: StatusChipProps) {
  if (loading) return <LoadingSkeleton variant="list" rows={1} />;
  if (!status) {
    return (
      <span data-slot="status-chip" data-empty="" className="text-muted-foreground">
        {emptyText}
      </span>
    );
  }
  const { label, token } = statusChipModel(status);
  if (variant === "dot") {
    const tone = statusTone(status);
    return (
      <span
        data-slot="status-chip"
        data-token={token}
        data-variant="dot"
        className={cn("inline-flex items-center gap-1.5 font-medium whitespace-nowrap", size === "md" && "text-sm")}
        style={{ color: tone.ink }}
      >
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
        {label}
      </span>
    );
  }
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
