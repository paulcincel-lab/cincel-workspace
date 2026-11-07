import { Badge } from "@/components/ui/shadcn/badge";
import { tramoColorClass } from "@/lib/tramos/tramo-color";
import type { WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

export const NO_TRAMO_BADGE_LABEL = "Sin tramo";

/** A tramo label: outline badge with the tramo's color dot and its name, so the
 * color is never the only cue. Without a tramo it reads "Sin tramo" with the
 * neutral (muted) dot. */
export function TramoBadge({ tramo }: { tramo: WorkflowRef | null }) {
  return (
    <Badge variant="outline">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tramoColorClass(tramo))} />
      {tramo ? tramo.name : NO_TRAMO_BADGE_LABEL}
    </Badge>
  );
}
