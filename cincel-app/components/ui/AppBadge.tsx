import { Badge as ShadcnBadge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";

export type AppBadgeColor = "yellow" | "green" | "blue" | "red" | "gray" | "purple";

type Props = {
  label: string;
  color: AppBadgeColor;
};

/**
 * No off-palette hues (brand is strictly black/white/gray) — only
 * destructive/success carry real semantic meaning as tokens; the rest map to
 * neutral surfaces at different weights so callers keep a visual distinction
 * even though "yellow"/"blue"/"purple" no longer resolve to real colors.
 */
const colorClasses: Record<AppBadgeColor, string> = {
  yellow: "bg-foreground/10 text-foreground",
  green: "bg-success/10 text-success",
  blue: "bg-primary/10 text-primary",
  red: "bg-destructive/10 text-destructive",
  gray: "bg-muted text-muted-foreground",
  purple: "bg-muted text-foreground",
};

export default function AppBadge({ label, color }: Props) {
  return (
    <ShadcnBadge
      variant="outline"
      className={cn("h-auto rounded-full border-transparent px-3 py-1 text-xs font-semibold", colorClasses[color])}
    >
      {label}
    </ShadcnBadge>
  );
}
