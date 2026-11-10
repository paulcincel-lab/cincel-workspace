import { cn } from "@/lib/utils";

interface LoadBarSegment {
  /** 0-100, all segments together should sum to <= 100. */
  percent: number;
  /** Relative emphasis, 0-1 — lets segments share one hue instead of one color per category. */
  opacity?: number;
  label?: string;
  /** Fill, a CSS color such as "var(--chart-1)"; defaults to `foreground`. */
  color?: string;
}

interface LoadBarProps {
  segments: LoadBarSegment[];
  /** Fill color by load level; `default` keeps the monochrome `foreground` fill. */
  tone?: "default" | "ok" | "warn" | "critical";
  className?: string;
  /** Extra classes on every segment (e.g. a grow animation); the width stays inline. */
  segmentClassName?: string;
}

const TONE_FILL = {
  default: "bg-foreground",
  ok: "bg-success",
  warn: "bg-[var(--warning,var(--chart-3))]",
  critical: "bg-destructive",
} as const;

/**
 * A stacked bar showing a mix (e.g. department load by pipeline phase) using
 * opacity steps on a single hue instead of one color per category — keeps
 * the monochrome token system intact while still reading as distinct bands.
 */
export function LoadBar({ segments, tone = "default", className, segmentClassName }: LoadBarProps) {
  return (
    <div className={cn("flex h-2 overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((seg, i) => (
        <span
          key={i}
          title={seg.label}
          className={cn("h-full", TONE_FILL[tone], segmentClassName)}
          style={{
            width: `${seg.percent}%`,
            opacity: seg.opacity ?? 1,
            ...(seg.color ? { backgroundColor: seg.color } : {}),
          }}
        />
      ))}
    </div>
  );
}
