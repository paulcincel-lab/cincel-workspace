"use client";

import { useId, useMemo, type CSSProperties, type ReactNode } from "react";

import { computeSCurve } from "@/lib/cronograma/metrics";
import type { PaymentRow, SCurvePoint, ScheduleTask } from "@/lib/types/schedule";

/**
 * "Avance contra plan" (Visual Resumen): the schedule's S-curve
 * (`computeSCurve`, weekly points) as a 580×220 SVG: gridlines every 20 %, y
 * labels up to the max rounded up to the next 20, first-of-month x labels,
 * the dashed plan line, the real line (`draw`), the today rule, end dots and
 * the end label "{real} % · plan {plan} %". A visually hidden table carries
 * the weekly points. Renders nothing with fewer than 2 points (the card is
 * hidden and the grid reflows).
 */
export type SCurveWidgetProps = {
  schedule: { tasks: ScheduleTask[]; payments: PaymentRow[] } | null;
  /** YYYY-MM-DD (project timezone). */
  today: string;
  /** Real line and legend color: the current tramo's (a CSS token value). */
  color?: string;
  title?: string;
  /** Classes and style of the card (the layout's entrance motion). */
  className?: string;
  style?: CSSProperties;
};

const W = 580;
const H = 220;
const PAD_L = 40;
const PAD_R = 24;
const PAD_T = 22;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function dayOf(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** "9 nov" */
function shortDay(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "9 de noviembre" */
function longDay(iso: string): string {
  return `${Number(iso.slice(8, 10))} de ${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]}`;
}

export type SCurveSummary = {
  points: SCurvePoint[];
  /** Real and plan of the last week with real progress (rounded). */
  real: number;
  plan: number;
  /** Y axis max: the highest value rounded up to the next 20 (at least 20, at most 100). */
  yMax: number;
};

/** The weekly points of the schedule and the end values; null with fewer than 2 points. */
export function sCurveSummary(
  schedule: SCurveWidgetProps["schedule"],
  today: string,
): SCurveSummary | null {
  if (!schedule) return null;
  const points = computeSCurve({ tasks: schedule.tasks, payments: schedule.payments }, new Date(`${today}T12:00:00`));
  if (points.length < 2) return null;
  const withReal = points.filter((p) => p.real !== null);
  const last = withReal.at(-1) ?? null;
  const max = Math.max(...points.map((p) => Math.max(p.planned, p.real ?? 0)));
  return {
    points,
    real: Math.round(last?.real ?? 0),
    plan: Math.round(last?.planned ?? points[0]!.planned),
    yMax: Math.min(100, Math.max(20, Math.ceil(max / 20) * 20)),
  };
}

export function SCurveWidget({
  schedule,
  today,
  color = "var(--primary)",
  title = "Avance contra plan",
  className,
  style,
}: SCurveWidgetProps): ReactNode {
  const headingId = useId();
  const summary = useMemo(() => sCurveSummary(schedule, today), [schedule, today]);
  if (!summary) return null;
  const { points, real, plan, yMax } = summary;

  const start = dayOf(points[0]!.weekStart);
  const end = dayOf(points.at(-1)!.weekStart) + 6 * 86_400_000;
  const span = Math.max(1, end - start);
  // Each point is its week's end (the plan counts tasks due by then).
  const x = (ms: number) => PAD_L + ((Math.min(Math.max(ms, start), end) - start) / span) * PLOT_W;
  const xOfPoint = (p: SCurvePoint) => x(dayOf(p.weekStart) + 6 * 86_400_000);
  const y = (v: number) => PAD_T + PLOT_H - (Math.min(v, yMax) / yMax) * PLOT_H;

  const planPts = points.map((p) => `${xOfPoint(p).toFixed(1)},${y(p.planned).toFixed(1)}`).join(" ");
  const realPoints = points.filter((p) => p.real !== null);
  const realPts = realPoints.map((p) => `${xOfPoint(p).toFixed(1)},${y(p.real ?? 0).toFixed(1)}`).join(" ");
  const lastReal = realPoints.at(-1) ?? null;

  const gridValues: number[] = [];
  for (let v = 0; v <= yMax; v += 20) gridValues.push(v);

  const months: { ms: number; label: string }[] = [];
  const first = new Date(start);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1), 1);
  while (cursor <= end) {
    const d = new Date(cursor);
    months.push({ ms: cursor, label: `1 ${MONTHS[d.getUTCMonth()]}`.toUpperCase() });
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }

  const todayMs = dayOf(today);
  const showToday = todayMs >= start && todayMs <= end;
  const todayX = x(todayMs);
  const endX = lastReal ? xOfPoint(lastReal) : PAD_L;
  const endLabelAnchor = endX > W - 140 ? "end" : "start";

  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px] text-card-foreground shadow-(--shadow-card) ${className ?? ""}`}
      style={style}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        <div aria-hidden="true" className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="4">
              <line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2" />
            </svg>
            Real
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="4">
              <line x1="0" y1="2" x2="18" y2="2" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Plan
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="240"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Avance real ${real} % contra plan ${plan} % al ${longDay(today)}`}
        className="block h-auto max-h-[240px] w-full"
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--border)" : "var(--accent)"}
              strokeWidth="1"
            />
            <text x={PAD_L - 8} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
              {v} %
            </text>
          </g>
        ))}
        {months.map((m) => (
          <text key={m.ms} x={x(m.ms)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
            {m.label}
          </text>
        ))}
        <polyline points={planPts} fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="6 5" />
        {realPoints.length > 0 ? (
          <polyline
            className="draw"
            pathLength={1}
            points={realPts}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {showToday ? (
          <g>
            <line x1={todayX} x2={todayX} y1={PAD_T - 6} y2={PAD_T + PLOT_H} stroke="var(--primary)" strokeWidth="1" strokeDasharray="2 3" />
            <text x={todayX} y={PAD_T - 10} textAnchor="middle" className="fill-primary font-mono text-[10px]">
              Hoy · {shortDay(today)}
            </text>
          </g>
        ) : null}
        {lastReal ? (
          <g>
            <circle cx={endX} cy={y(lastReal.planned)} r="5" fill="var(--muted-foreground)" stroke="var(--card)" strokeWidth="2" />
            <circle cx={endX} cy={y(lastReal.real ?? 0)} r="5" fill={color} stroke="var(--card)" strokeWidth="2" />
            <text
              x={endLabelAnchor === "end" ? endX - 10 : endX + 10}
              y={Math.min(y(lastReal.real ?? 0), y(lastReal.planned)) - 8}
              textAnchor={endLabelAnchor}
              className="fill-foreground font-mono text-[11px]"
            >
              {real} % · plan {plan} %
            </text>
          </g>
        ) : null}
      </svg>
      <table className="sr-only">
        <caption>Avance semanal real y plan</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Plan</th>
            <th scope="col">Real</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.weekStart}>
              <th scope="row">{shortDay(p.weekStart)}</th>
              <td>{Math.round(p.planned)} %</td>
              <td>{p.real === null ? "—" : `${Math.round(p.real)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
