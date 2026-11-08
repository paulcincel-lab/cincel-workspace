import Link from "next/link";

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

function LargeTile({ label, value, tone = "default", series7, delta, split, caption, href }: KpiTileProps) {
  const deltaToneKey = delta ? kpiDeltaTone(delta) : "neutral";
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-foreground/80">{label}</span>
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
      <div className="flex items-end justify-between gap-3">
        <span
          data-slot="kpi-value"
          className={cn(
            "text-[30px] leading-none font-medium tabular-nums",
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
            width={120}
            height={36}
            area
            strokeWidth={2}
            className={DELTA_TEXT[deltaToneKey]}
          />
        ) : null}
      </div>
      {split ? <SplitBar split={split} /> : null}
      {caption ? (
        <span data-slot="kpi-context" className="text-xs text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </>
  );
  const className = "flex flex-col gap-2.5 rounded-lg border border-border bg-card px-5 py-[18px] shadow-sm";
  return href ? (
    <Link
      href={href}
      data-slot="kpi-tile"
      className={cn(
        className,
        "transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      )}
    >
      {body}
    </Link>
  ) : (
    <div data-slot="kpi-tile" className={className}>
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
