import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * SVG progress ring of the Visual widgets (`EntityCardGrid` head ring,
 * `ProgressListWidget` rings). The fill circle has `pathLength="100"`, so its
 * dash offset is `100 − percent` (`--ring-offset`); with `animated` it fills
 * in through the shared `ring` utility (1.1 s, `--ease-emph`), static under
 * reduced motion. The ring is one image labelled "{n} % de avance"; the
 * centered children are what sighted users read.
 */
export type ProgressRingProps = {
  /** 0–100; rounded and clamped. */
  percent: number;
  /** Diameter in px. */
  size: number;
  /** Stroke width in px. */
  stroke?: number;
  /** Fill color, e.g. "var(--chart-1)". */
  color: string;
  /** Track color; defaults to `muted`. */
  track?: string;
  animated?: boolean;
  /** Accessible name; defaults to "{n} % de avance". */
  label?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  "data-slot"?: string;
};

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function progressRingLabel(percent: number): string {
  return `${clampPercent(percent)} % de avance`;
}

export function ProgressRing({
  percent,
  size,
  stroke = 5,
  color,
  track = "var(--muted)",
  animated = false,
  label,
  className,
  style,
  children,
  "data-slot": dataSlot,
}: ProgressRingProps) {
  const pct = clampPercent(percent);
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const offset = 100 - pct;
  return (
    <span
      role="img"
      aria-label={label ?? progressRingLabel(pct)}
      data-slot={dataSlot}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
    >
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          data-slot="progress-ring-fill"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={offset}
          className={animated ? "ring" : undefined}
          style={{ "--ring-offset": String(offset) } as CSSProperties}
        />
      </svg>
      {children}
    </span>
  );
}
