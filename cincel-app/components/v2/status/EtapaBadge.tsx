import { Badge } from "@/components/ui/shadcn/badge";
import { etapaColorClass } from "@/lib/etapas/etapa-color";
import type { WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

export const NO_ETAPA_BADGE_LABEL = "Sin etapa";

/** An etapa label: outline badge with the etapa's color dot and its name, so the
 * color is never the only cue. Without an etapa it reads "Sin etapa" with the
 * neutral (muted) dot. */
export function EtapaBadge({ etapa }: { etapa: WorkflowRef | null }) {
  return (
    <Badge variant="outline">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", etapaColorClass(etapa))} />
      {etapa ? etapa.name : NO_ETAPA_BADGE_LABEL}
    </Badge>
  );
}
