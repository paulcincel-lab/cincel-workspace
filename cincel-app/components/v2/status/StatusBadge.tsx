import { Badge } from "@/components/ui/shadcn/badge";
import { statusDotClass, statusTintClass, type StatusColorToken } from "@/lib/tasks/status-options";
import { cn } from "@/lib/utils";

/** A task status label: outline badge with a light status tint and the status
 * color dot. The label is always shown, so the color is never the only cue. */
export function StatusBadge({ label, token }: { label: string; token: StatusColorToken }) {
  return (
    <Badge variant="outline" className={statusTintClass(token)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", statusDotClass(token))} />
      {label}
    </Badge>
  );
}

/** A small status color dot for lists and legends; always pair it with a label. */
export function StatusDot({ token }: { token: StatusColorToken }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", statusDotClass(token))} />;
}
