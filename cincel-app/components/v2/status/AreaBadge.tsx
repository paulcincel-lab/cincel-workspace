import { Badge } from "@/components/ui/shadcn/badge";
import { areaColorClass, areaTintClass } from "@/lib/areas/area-color";
import { cn } from "@/lib/utils";

/** An área label: outline badge with the área's color dot. The text keeps the
 * normal foreground color, so the color is never the only cue. With `tinted`
 * the badge is a tinted chip (tint + ink) instead of an outline. */
export function AreaBadge({
  name,
  colorSlot,
  tinted = false,
}: {
  name: string;
  colorSlot: number | null | undefined;
  tinted?: boolean;
}) {
  return (
    <Badge variant="outline" className={tinted ? cn("border-transparent", areaTintClass(colorSlot)) : undefined}>
      <AreaDot colorSlot={colorSlot} />
      {name}
    </Badge>
  );
}

/** The área's color dot alone; always pair it with its name. */
export function AreaDot({ colorSlot, className }: { colorSlot: number | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", areaColorClass(colorSlot), className)} />;
}
