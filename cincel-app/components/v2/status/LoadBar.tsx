import { cn } from "@/lib/utils";

interface LoadBarSegment {
  /** 0-100, all segments together should sum to <= 100. */
  percent: number;
  /** Relative emphasis, 0-1 — lets segments share one hue instead of one color per category. */
  opacity?: number;
  label?: string;
}

interface LoadBarProps {
  segments: LoadBarSegment[];
  className?: string;
}

/**
 * A stacked bar showing a mix (e.g. department load by pipeline phase) using
 * opacity steps on a single hue instead of one color per category — keeps
 * the monochrome token system intact while still reading as distinct bands.
 */
export function LoadBar({ segments, className }: LoadBarProps) {
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((seg, i) => (
        <span
          key={i}
          title={seg.label}
          className="h-full bg-foreground"
          style={{ width: `${seg.percent}%`, opacity: seg.opacity ?? 1 }}
        />
      ))}
    </div>
  );
}
