import Link from "next/link";

import { Badge } from "@/components/ui/shadcn/badge";
import { Sparkline } from "@/components/widgets/Sparkline";
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
  /** Week-over-week; `good` picks the color whatever the sign. */
  delta?: { value: number; good: boolean; caption: string };
  /** Shares 0–1 with an already resolved label and color (`var(--chart-N)`). */
  split?: { key: string; label: string; share: number; colorVar: string }[];
  caption?: string;
  href?: string;
}

/** Signed delta text ("+3", "−2", "0") in es-MX. */
export function formatKpiDelta(value: number): string {
  const abs = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function pct(share: number): number {
  return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

function SplitBar({ split }: { split: NonNullable<KpiTileProps["split"]> }) {
  const label = split.map((s) => `${s.label} ${pct(s.share)} %`).join(", ");
  return (
    <div
      role="img"
      aria-label={`Por tramo: ${label}`}
      data-slot="kpi-split"
      className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {split.map((s) => (
        <span key={s.key} className="h-full" style={{ width: `${pct(s.share)}%`, background: s.colorVar }} />
      ))}
    </div>
  );
}

function LargeTile({ label, value, tone = "default", series7, delta, split, caption, href }: KpiTileProps) {
  const body = (
    <>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
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
        {series7 && series7.length > 0 ? (
          <Sparkline points={series7} label={`Tendencia 7 días de ${label}: ${series7.join(", ")}`} />
        ) : null}
      </div>
      {delta ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge data-slot="kpi-delta" data-good={delta.good} variant={delta.good ? "success" : "destructive"}>
            {formatKpiDelta(delta.value)}
          </Badge>
          <span className="text-xs text-muted-foreground">{delta.caption}</span>
        </div>
      ) : null}
      {split && split.length > 0 ? <SplitBar split={split} /> : null}
      {caption ? <div className="mt-2 text-xs text-muted-foreground">{caption}</div> : null}
    </>
  );
  const className = "block rounded-lg border border-border bg-card p-4 shadow-sm";
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
