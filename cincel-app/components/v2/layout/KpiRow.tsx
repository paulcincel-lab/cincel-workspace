import Link from "next/link";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { hasSparklineData, Sparkline } from "@/components/widgets/Sparkline";
import { DELTA_UNCHANGED, formatSignedDelta } from "@/lib/metrics/series";
import type { KpiDeltaTone } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "ok";
  /**
   * Widget extras (redesign FE §4.10.1, `KpiWidget` Visual). Legacy callers
   * omit them and the tile renders exactly as before.
   */
  id?: string;
  size?: "default" | "lg";
  /** 7 points, oldest → newest. */
  series7?: number[];
  /**
   * Week-over-week; `good` picks the color whatever the sign. `label` /
   * `tone` are the chip text and color when the producer set them.
   */
  delta?: KpiDelta;
  /** Shares 0–1 with an already resolved label and color (`var(--chart-N)`). */
  split?: { key: string; label: string; share: number; colorVar: string }[];
  caption?: string;
  href?: string;
  /**
   * Selectable tile (dashboard KPI selection): with `onToggle` the large tile
   * is a toggle button (`aria-pressed` = `pressed`) instead of a link.
   */
  pressed?: boolean;
  onToggle?(): void;
  /** Extra classes and inline style on the large tile's root (e.g. an entrance animation and its delay). */
  className?: string;
  style?: CSSProperties;
}

export type KpiDelta = { value: number; good: boolean; caption: string; label?: string; tone?: KpiDeltaTone };

/** Signed delta text ("+3", "−2", "0") in es-MX. */
export function formatKpiDelta(value: number): string {
  return formatSignedDelta(value);
}

/** Chip tone: the producer's, else `neutral` for zero and `good` / `bad` otherwise. */
export function kpiDeltaTone(delta: KpiDelta): KpiDeltaTone {
  if (delta.tone) return delta.tone;
  if (delta.value === 0) return "neutral";
  return delta.good ? "good" : "bad";
}

/** Chip text: the producer's label, else "sin cambio" for zero or the signed value. Never empty. */
export function kpiDeltaLabel(delta: KpiDelta): string {
  if (delta.label) return delta.label;
  return delta.value === 0 ? DELTA_UNCHANGED : formatSignedDelta(delta.value);
}

const DELTA_BADGE: Record<KpiDeltaTone, "success" | "destructive" | "outline"> = {
  good: "success",
  bad: "destructive",
  neutral: "outline",
};

/** Text color of a tone (sparkline stroke, Analítico Δ cell). */
export const DELTA_TEXT: Record<KpiDeltaTone, string> = {
  good: "text-success",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

function pct(share: number): number {
  return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

function SplitBar({ split }: { split: NonNullable<KpiTileProps["split"]> }) {
  const label = split.map((s) => `${s.label} ${pct(s.share)} %`).join(", ");
  return (
    <div
      role="img"
      aria-label={split.length > 0 ? `Por tramo: ${label}` : "Por tramo: sin datos"}
      data-slot="kpi-split"
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
    >
      {split.map((s) => (
        <span key={s.key} className="h-full" style={{ width: `${pct(s.share)}%`, background: s.colorVar }} />
      ))}
    </div>
  );
}

function LargeTile({
  label,
  value,
  tone = "default",
  series7,
  delta,
  split,
  caption,
  href,
  pressed,
  onToggle,
  className: extraClassName,
  style,
}: KpiTileProps) {
  const deltaToneKey = delta ? kpiDeltaTone(delta) : "neutral";
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
        {delta ? (
          <Badge
            data-slot="kpi-delta"
            data-good={delta.good}
            data-tone={deltaToneKey}
            variant={DELTA_BADGE[deltaToneKey]}
            title={delta.caption}
          >
            {kpiDeltaLabel(delta)}
          </Badge>
        ) : null}
      </div>
      <span
        data-slot="kpi-value"
        className={cn(
          "text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums",
          tone === "warn" && "text-destructive",
          tone === "ok" && "text-success-foreground"
        )}
      >
        {value}
      </span>
      {hasSparklineData(series7) ? (
        <Sparkline
          points={series7}
          label={`Tendencia 7 días de ${label}: ${series7.join(", ")}`}
          width={240}
          height={28}
          area
          strokeWidth={2}
          className={cn("h-auto w-full", DELTA_TEXT[deltaToneKey])}
        />
      ) : null}
      {split ? <SplitBar split={split} /> : null}
      {caption ? (
        <span data-slot="kpi-context" className="text-xs text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex flex-col gap-2.5 rounded-lg border border-border bg-card px-5 py-[18px] shadow-sm",
    extraClassName
  );
  if (onToggle) {
    return (
      <button
        type="button"
        data-slot="kpi-tile"
        aria-pressed={pressed ?? false}
        onClick={onToggle}
        style={style}
        className={cn(
          className,
          "text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:border-ring aria-pressed:bg-muted/40"
        )}
      >
        {body}
      </button>
    );
  }
  return href ? (
    <Link
      href={href}
      data-slot="kpi-tile"
      style={style}
      className={cn(
        className,
        "transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      )}
    >
      {body}
    </Link>
  ) : (
    <div data-slot="kpi-tile" className={className} style={style}>
      {body}
    </div>
  );
}

/**
 * One KPI tile ("Proyectos activos", "Vencidas", "Saturados"…). `tone` is the
 * only place color earns its keep on a KPI strip — everything else stays
 * monochrome. Use inside <KpiRow>. `size="lg"` is the redesign tile
 * (`KpiWidget` Visual): 30 px value, sparkline, delta pill, split bar.
 */
export function KpiTile(props: KpiTileProps) {
  if (props.size === "lg") return <LargeTile {...props} />;
  const { label, value, tone = "default" } = props;
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "warn" && "text-destructive",
          tone === "ok" && "text-success-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

interface KpiRowProps {
  tiles: KpiTileProps[];
  /** Redesign layout (no bottom margin, wider gap); legacy callers omit it. */
  spacing?: "default" | "widget";
}

/** A responsive row of KpiTile — the KPI strip repeated across v2 pages. */
export function KpiRow({ tiles, spacing = "default" }: KpiRowProps) {
  return (
    <div
      className={
        spacing === "widget"
          ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          : "mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      }
    >
      {tiles.map((tile) => (
        <KpiTile key={tile.id ?? tile.label} {...tile} />
      ))}
    </div>
  );
}
