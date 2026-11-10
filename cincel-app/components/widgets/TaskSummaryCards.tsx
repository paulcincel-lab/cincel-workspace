"use client";

import type { CSSProperties, ReactNode } from "react";

import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { sparklinePath } from "@/components/widgets/Sparkline";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Summary cards of a Visual board page (frame `Tareas-Visual`, "Resumen"):
 * KPI tiles with a 7-day sparkline, a status donut and a week strip. Visual
 * only: the page renders them in its `visual` slot, so they carry the motion
 * (`anim-in`, `draw`, `ring`, `grow`) without branching on the style.
 * Every color comes in as a token (`var(--chart-1)`, …).
 */

/** The card every summary part sits on: radius 14, border, card shadow, entrance. */
export const SUMMARY_CARD_CLASS =
  "anim-in rounded-[14px] border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]";

// ── KPI tiles ──────────────────────────────────────────────────────────────

export type KpiSparkTile = {
  key: string;
  label: string;
  /** The value as shown ("1 234"). */
  value: string;
  /** The value in the destructive color (Vencidas). */
  alert?: boolean;
  /** Last 7 days, oldest first. */
  points: number[];
  /** Line color, a CSS color from a token (`var(--chart-1)`). */
  color: string;
  /** Caption: the lead in a 500-weight span (the delta, colored by `tone`), then the rest. */
  caption?: { lead: string; tone?: "good" | "bad" | null; rest: string };
};

const TONE_CLASS = { good: "text-success", bad: "text-destructive" } as const;

/** Full-width 7-point line (28 px high): the shared sparkline path, stretched, drawn in with `draw`. */
function TileSparkline({ points, color, label }: { points: number[]; color: string; label: string }) {
  const width = 100;
  const height = 28;
  return (
    <svg
      role="img"
      aria-label={label}
      data-slot="kpi-tile-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-7 w-full overflow-visible"
      style={{ color }}
    >
      {points.length > 0 ? (
        <path
          d={sparklinePath(points, width, height)}
          pathLength={1}
          className="draw"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

/** Four KPI tiles in a 2 × 2 grid (gap 12); tiles are not focusable. */
export function KpiSparkTiles({ tiles }: { tiles: KpiSparkTile[] }) {
  return (
    <ul data-slot="kpi-spark-tiles" className="grid grid-cols-2 gap-3">
      {tiles.map((tile, i) => (
        <li
          key={tile.key}
          data-slot="kpi-spark-tile"
          className={cn(SUMMARY_CARD_CLASS, "flex min-w-0 flex-col gap-1.5 p-4")}
          style={staggerStyle(i, 40)}
        >
          <span className="truncate text-[12.5px] text-muted-foreground">{tile.label}</span>
          <span
            data-slot="kpi-spark-value"
            className={cn(
              "text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums",
              tile.alert ? "text-destructive" : "text-foreground",
            )}
          >
            {tile.value}
          </span>
          <TileSparkline
            points={tile.points}
            color={tile.color}
            label={`${tile.label}, últimos 7 días: ${tile.points.join(", ")}`}
          />
          {tile.caption ? (
            <span data-slot="kpi-spark-caption" className="truncate text-xs text-muted-foreground">
              <span className={cn("font-medium", tile.caption.tone ? TONE_CLASS[tile.caption.tone] : undefined)}>
                {tile.caption.lead}
              </span>{" "}
              {tile.caption.rest}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Loading state of the tiles: four 104 px skeletons. */
export function KpiSparkTilesSkeleton() {
  return (
    <div data-slot="kpi-spark-tiles-loading" className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[104px] rounded-[14px]" />
      ))}
    </div>
  );
}

// ── Status donut ───────────────────────────────────────────────────────────

export type DonutSegment = { key: string; label: string; value: number; color: string };

const DONUT_SIZE = 132;
const DONUT_R = 42;
const DONUT_STROKE = 14;

/**
 * "Por estatus": a 132 px hand-SVG donut (r 42, stroke 14, `muted` track),
 * one `ring` circle per segment (`pathLength` 100, `--ring-offset` = 100 −
 * share, rotated to where the segment starts), the total in the center and a
 * legend with the counts.
 */
export function StatusDonutCard({
  title,
  segments,
  total,
  totalText,
  unit,
}: {
  title: string;
  segments: DonutSegment[];
  total: number;
  /** The total as shown ("1 234"). */
  totalText: string;
  /** Under the total ("tareas"). */
  unit: string;
}) {
  const c = DONUT_SIZE / 2;
  const arcs = segments.reduce<((typeof segments)[number] & { share: number; start: number })[]>((out, s) => {
    const previous = out[out.length - 1];
    const start = previous ? previous.start + previous.share : 0;
    const share = total > 0 ? (s.value / total) * 100 : 0;
    return [...out, { ...s, share, start }];
  }, []);
  const imageLabel = `${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`;

  return (
    <section aria-labelledby="status-donut-title" className={cn(SUMMARY_CARD_CLASS, "flex flex-col gap-3 px-[18px] py-4")}>
      <h2 id="status-donut-title" className="text-[15px] font-semibold">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative size-[132px] shrink-0">
          <svg role="img" aria-label={imageLabel} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="size-full">
            <circle cx={c} cy={c} r={DONUT_R} fill="none" stroke="var(--muted)" strokeWidth={DONUT_STROKE} />
            {arcs
              .filter((a) => a.share > 0)
              .map((a, i) => (
                <circle
                  key={a.key}
                  data-slot="donut-segment"
                  cx={c}
                  cy={c}
                  r={DONUT_R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={DONUT_STROKE}
                  pathLength={100}
                  className="ring"
                  transform={`rotate(${-90 + a.start * 3.6} ${c} ${c})`}
                  style={{ "--ring-offset": `${100 - a.share}`, ...staggerStyle(i, 80) } as CSSProperties}
                />
              ))}
          </svg>
          <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] leading-none font-semibold tabular-nums">{totalText}</span>
            <span className="text-[11.5px] text-muted-foreground">{unit}</span>
          </div>
        </div>
        <ul data-slot="donut-legend" className="flex min-w-[140px] flex-1 flex-col gap-2 text-[13px]">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="font-mono text-muted-foreground tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Week strip ─────────────────────────────────────────────────────────────

export type WeekStripDay = {
  date: string;
  /** "LUN" … "DOM". */
  name: string;
  /** Day of the month. */
  number: number;
  count: number;
  /** "Lunes 9, 1 entrega (hoy)". */
  ariaLabel: string;
  /** Bar height in px (4 when 0, else up to 38). */
  barHeight: number;
  /** Bar color (a token); ignored on today, whose bar takes the text color. */
  barColor: string;
  today?: boolean;
  busiest?: boolean;
};

/**
 * "Esta semana": seven days (gap 8), each with its name, number, a 10 px bar
 * (`grow`) and the count. Today is `primary`; the busiest day the warning
 * tint with the `chart-3` ink. Not interactive (`role="list"`).
 */
export function WeekStripCard({ title, meta, days }: { title: string; meta: string; days: WeekStripDay[] }) {
  return (
    <section aria-labelledby="week-strip-title" className={cn(SUMMARY_CARD_CLASS, "flex flex-col gap-3 px-[18px] py-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="week-strip-title" className="text-[15px] font-semibold">
          {title}
        </h2>
        <span data-slot="week-strip-meta" className="text-[12.5px] text-muted-foreground">
          {meta}
        </span>
      </div>
      <ul role="list" data-slot="week-strip" className="grid grid-cols-7 gap-2">
        {days.map((day, i) => (
          <li
            key={day.date}
            aria-label={day.ariaLabel}
            data-today={day.today || undefined}
            data-busiest={day.busiest || undefined}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-[10px] px-1 py-2",
              day.today ? "bg-primary text-primary-foreground" : day.busiest ? "bg-tint-warning" : "bg-muted",
            )}
            style={!day.today && day.busiest ? { color: "var(--chart-3-ink)" } : undefined}
          >
            <span aria-hidden="true" className={cn("text-[11px]", day.today || day.busiest ? "opacity-80" : "text-muted-foreground")}>
              {day.name}
            </span>
            <span aria-hidden="true" className="text-lg leading-none font-semibold tabular-nums">
              {day.number}
            </span>
            <span aria-hidden="true" className="flex h-[38px] items-end">
              <span
                data-slot="week-strip-bar"
                className={cn("grow block w-[10px] rounded-[4px]", day.today && "bg-primary-foreground")}
                style={{
                  height: day.barHeight,
                  ...(day.today ? {} : { backgroundColor: day.barColor }),
                  ...staggerStyle(i, 40),
                }}
              />
            </span>
            <span aria-hidden="true" className="font-mono text-[11px] tabular-nums">
              {day.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Loading state of the donut and week cards. */
export function SummaryCardSkeleton({ label }: { label?: ReactNode }) {
  return (
    <div data-slot="summary-card-loading" className={cn(SUMMARY_CARD_CLASS, "flex flex-col gap-3 px-[18px] py-4")}>
      {label ? <span className="text-[15px] font-semibold">{label}</span> : <Skeleton className="h-4 w-24" />}
      <Skeleton className="h-[132px] w-full rounded-[10px]" />
    </div>
  );
}
