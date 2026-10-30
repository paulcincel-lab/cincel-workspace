import { Badge } from "@/components/ui/shadcn/badge";
import { areaColorClass } from "@/lib/areas/area-color";
import { cn } from "@/lib/utils";

/** An área label: outline badge with the área's color dot. The text keeps the
 * normal foreground color, so the color is never the only cue. */
export function AreaBadge({ name, colorSlot }: { name: string; colorSlot: number | null | undefined }) {
  return (
    <Badge variant="outline">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", areaColorClass(colorSlot))} />
      {name}
    </Badge>
  );
}
