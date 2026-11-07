import { cn } from "@/lib/utils";

/**
 * Tiny 7-point trend line of the widget library (redesign FE §15.2): Visual
 * tiles and the Analítico "Tendencia 7 días" column (72 × 18, `foreground`
 * stroke). An image with the points in its label; the numbers are always
 * available as text next to it.
 */
export type SparklineProps = {
  points: number[];
  label: string;
  width?: number;
  height?: number;
  className?: string;
};

const PAD = 1.5;

export function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length === 0) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const stepX = points.length > 1 ? (width - PAD * 2) / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = PAD + i * stepX;
      const y = range === 0 ? height / 2 : PAD + (1 - (p - min) / range) * (height - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ points, label, width = 72, height = 18, className }: SparklineProps) {
  if (points.length === 0) return null;
  return (
    <svg
      role="img"
      aria-label={label}
      data-slot="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible text-foreground", className)}
    >
      <path
        d={sparklinePath(points, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
