"use client";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { AreaBadge, AreaDot } from "@/components/v2/status/AreaBadge";
import { StyleView } from "@/components/widgets/StyleView";
import { tramoColorSlot, tramoLabel, type TramoColorSlot } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";

/**
 * Tramo badge of the library (redesign FE §4.10.1, §21.2): `AreaBadge` wrapped
 * through `lib/tramos/compat.ts` (`tramoColorSlot`, `tramoLabel`).
 *
 * Variants: `chip` (tint + ink), `dot` (color dot + name), `text` (name only).
 * Visual renders the requested variant (default chip). Esencial has no tinted
 * chips, so `chip` reads as plain text and `dot` uses the 6 px muted dot;
 * Analítico shows the tramo as an 8 px color dot, so `chip` reads as
 * dot + text (§15.2). The name is always shown, so the
 * color is never the only cue. `tramo: null` renders `emptyText`.
 */
export type TramoBadgeVariant = "chip" | "dot" | "text";

export type TramoBadgeProps = {
  tramo: WorkflowRef | null;
  variant?: TramoBadgeVariant;
  /** Shown when there is no tramo. */
  emptyText?: string;
  loading?: boolean;
};

export const TRAMO_BADGE_EMPTY_TEXT = "Sin tramo";

/** Label and color slot of a tramo: compat label for the known tramos, the row's own name otherwise. */
export function tramoBadgeModel(tramo: WorkflowRef): { label: string; slot: TramoColorSlot | null } {
  const slot = tramoColorSlot(tramo.key);
  const label = slot ? tramoLabel(tramo.key) : tramo.name;
  return { label: label || tramo.name, slot };
}

function TramoMark({
  variant,
  label,
  slot,
  mutedDot = false,
}: {
  variant: TramoBadgeVariant;
  label: string;
  slot: TramoColorSlot | null;
  /** Esencial: 6 px `muted-foreground` dot instead of the 8 px tramo color. */
  mutedDot?: boolean;
}) {
  if (variant === "chip") {
    return (
      <span data-slot="tramo-badge" data-variant="chip" data-color-slot={slot ?? ""} className="inline-flex">
        <AreaBadge name={label} colorSlot={slot} tinted />
      </span>
    );
  }
  if (variant === "dot") {
    return (
      <span data-slot="tramo-badge" data-variant="dot" data-color-slot={slot ?? ""} className="inline-flex items-center gap-1.5">
        <AreaDot colorSlot={mutedDot ? null : slot} className={mutedDot ? undefined : "size-2"} />
        {label}
      </span>
    );
  }
  return (
    <span data-slot="tramo-badge" data-variant="text" data-color-slot={slot ?? ""}>
      {label}
    </span>
  );
}

export function TramoBadge({ tramo, variant = "chip", emptyText = TRAMO_BADGE_EMPTY_TEXT, loading = false }: TramoBadgeProps) {
  if (loading) return <LoadingSkeleton variant="list" rows={1} />;
  if (!tramo) {
    return (
      <span data-slot="tramo-badge" data-empty="" className="text-muted-foreground">
        {emptyText}
      </span>
    );
  }
  const { label, slot } = tramoBadgeModel(tramo);
  return (
    <StyleView
      visual={() => <TramoMark variant={variant} label={label} slot={slot} />}
      esencial={() => <TramoMark variant={variant === "chip" ? "text" : variant} label={label} slot={slot} mutedDot />}
      analitico={() => <TramoMark variant={variant === "chip" ? "dot" : variant} label={label} slot={slot} />}
    />
  );
}
