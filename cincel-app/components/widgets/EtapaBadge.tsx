"use client";

import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { AreaBadge, AreaDot } from "@/components/v2/status/AreaBadge";
import { StyleView } from "@/components/widgets/StyleView";
import { etapaColorSlot, etapaLabel, type EtapaColorSlot } from "@/lib/etapas/compat";
import type { WorkflowRef } from "@/lib/types/core";

/**
 * Etapa badge of the library (redesign FE §4.10.1, §21.2): `AreaBadge` wrapped
 * through `lib/etapas/compat.ts` (`etapaColorSlot`, `etapaLabel`).
 *
 * Variants: `chip` (tint + ink), `dot` (color dot + name), `text` (name only).
 * Visual renders the requested variant (default chip). Esencial has no tinted
 * chips, so `chip` reads as plain text and `dot` uses the 6 px muted dot;
 * Analítico shows the etapa as an 8 px color dot, so `chip` reads as
 * dot + text (§15.2). The name is always shown, so the
 * color is never the only cue. `etapa: null` renders `emptyText`.
 */
export type EtapaBadgeVariant = "chip" | "dot" | "text";

export type EtapaBadgeProps = {
  etapa: WorkflowRef | null;
  variant?: EtapaBadgeVariant;
  /** Shown when there is no etapa. */
  emptyText?: string;
  loading?: boolean;
};

export const ETAPA_BADGE_EMPTY_TEXT = "Sin etapa";

/** Label and color slot of an etapa: compat label for the known etapas, the row's own name otherwise. */
export function etapaBadgeModel(etapa: WorkflowRef): { label: string; slot: EtapaColorSlot | null } {
  const slot = etapaColorSlot(etapa.key);
  const label = slot ? etapaLabel(etapa.key) : etapa.name;
  return { label: label || etapa.name, slot };
}

function EtapaMark({
  variant,
  label,
  slot,
  mutedDot = false,
}: {
  variant: EtapaBadgeVariant;
  label: string;
  slot: EtapaColorSlot | null;
  /** Esencial: 6 px `muted-foreground` dot instead of the 8 px etapa color. */
  mutedDot?: boolean;
}) {
  if (variant === "chip") {
    return (
      <span data-slot="etapa-badge" data-variant="chip" data-color-slot={slot ?? ""} className="inline-flex">
        <AreaBadge name={label} colorSlot={slot} tinted />
      </span>
    );
  }
  if (variant === "dot") {
    return (
      <span data-slot="etapa-badge" data-variant="dot" data-color-slot={slot ?? ""} className="inline-flex items-center gap-1.5">
        <AreaDot colorSlot={mutedDot ? null : slot} className={mutedDot ? undefined : "size-2"} />
        {label}
      </span>
    );
  }
  return (
    <span data-slot="etapa-badge" data-variant="text" data-color-slot={slot ?? ""}>
      {label}
    </span>
  );
}

export function EtapaBadge({ etapa, variant = "chip", emptyText = ETAPA_BADGE_EMPTY_TEXT, loading = false }: EtapaBadgeProps) {
  if (loading) return <LoadingSkeleton variant="list" rows={1} />;
  if (!etapa) {
    return (
      <span data-slot="etapa-badge" data-empty="" className="text-muted-foreground">
        {emptyText}
      </span>
    );
  }
  const { label, slot } = etapaBadgeModel(etapa);
  return (
    <StyleView
      visual={() => <EtapaMark variant={variant} label={label} slot={slot} />}
      esencial={() => <EtapaMark variant={variant === "chip" ? "text" : variant} label={label} slot={slot} mutedDot />}
      analitico={() => <EtapaMark variant={variant === "chip" ? "dot" : variant} label={label} slot={slot} />}
    />
  );
}
