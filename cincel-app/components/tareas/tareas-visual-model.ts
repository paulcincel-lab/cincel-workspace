/**
 * Tareas Visual (frame `Tareas-Visual`): pure helpers that turn the trend
 * (`qk.tareas.trend(f)`) and the board (`qk.tareas.board(f)`) into the props
 * of the summary cards. Client-safe, no React.
 */
import type { DonutSegment, KpiSparkTile, WeekStripDay } from "@/components/widgets/TaskSummaryCards";
import type { TareasBoardData, TareasTrend, TareasTrendKey } from "@/lib/tareas/page-data";
import { BASE_STATUS_COLOR, BASE_STATUS_LABEL, customStatusBase, parseStatusValue, statusColorVar } from "@/lib/tasks/status-options";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { TaskStatus } from "@/lib/types/core";

export const TAREAS_VISUAL_DESCRIPTION = "El tablero del equipo. Arrastra para cambiar el estatus.";
export const TAREAS_VISUAL_SUMMARY_LABEL = "Resumen";
export const TAREAS_DONUT_TITLE = "Por estatus";
export const TAREAS_WEEK_TITLE = "Esta semana";

/** Cards each column shows before "Ver N más" (the board still loads `TAREAS_BOARD_PER_COLUMN`). */
export const TAREAS_VISUAL_VISIBLE_CARDS = 4;

/** Integers with a space every three digits ("1 234"); a no-break space keeps them on one line. */
export function formatCount(n: number): string {
  const sign = n < 0 ? "−" : "";
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Line color and value tone of each tile. */
const TILE_STYLE: Record<TareasTrendKey, { color: string; alert?: boolean }> = {
  abiertas: { color: "var(--chart-1)" },
  vencidas: { color: "var(--destructive)", alert: true },
  en_proceso: { color: "var(--chart-2)" },
  completadas: { color: "var(--success)" },
};

/** "+3", "−2", "0". */
function signed(n: number): string {
  if (n > 0) return `+${formatCount(n)}`;
  if (n < 0) return `−${formatCount(-n)}`;
  return "0";
}

/**
 * The four tiles, in the trend's order. Captions: "+3 esta semana", "+2
 * desde el lunes", "5 personas trabajando", "+2 vs. semana pasada"; the delta
 * is `success` when good, `destructive` when bad and plain at 0.
 */
export function trendTiles(trend: TareasTrend): KpiSparkTile[] {
  return trend.kpis.map((kpi) => {
    const style = TILE_STYLE[kpi.key];
    const tile: KpiSparkTile = {
      key: kpi.key,
      label: kpi.label,
      value: kpi.display ?? formatCount(kpi.value),
      alert: style.alert,
      points: kpi.series7 ?? [],
      color: style.color,
    };
    if (kpi.delta) {
      const tone = kpi.delta.value === 0 ? null : kpi.delta.good ? "good" : "bad";
      tile.caption = { lead: signed(kpi.delta.value), tone, rest: kpi.delta.caption };
    } else if (kpi.key === "en_proceso") {
      const n = trend.activeAssignees;
      tile.caption = { lead: formatCount(n), rest: n === 1 ? "persona trabajando" : "personas trabajando" };
    } else if (kpi.caption) {
      tile.caption = { lead: "", rest: kpi.caption };
    }
    return tile;
  });
}

/** Donut order: Pendiente, En proceso, Bloqueado, Completado. */
const DONUT_ORDER: TaskStatus[] = ["pendiente", "en_proceso", "bloqueado", "completado"];

/**
 * "Por estatus" from the board's column totals (every matching task, not just
 * the loaded cards): one segment per base status, a custom column counted
 * under the base status it reads as. The segments add up to the board total.
 */
export function donutSegmentsOfBoard(board: TareasBoardData): DonutSegment[] {
  const totals: Record<TaskStatus, number> = { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 };
  for (const [key, column] of Object.entries(board.columns)) {
    const parsed = parseStatusValue(key);
    let base: TaskStatus;
    if (parsed.kind === "base") base = parsed.status;
    else {
      const custom = board.statuses.find((s) => s.id === parsed.id);
      base = column.rows[0]?.status ?? (custom ? customStatusBase(custom) : "en_proceso");
    }
    totals[base] += column.total;
  }
  return DONUT_ORDER.map((status) => ({
    key: status,
    label: BASE_STATUS_LABEL[status],
    value: totals[status],
    color: statusColorVar(BASE_STATUS_COLOR[status]),
  }));
}

const DAY_SHORT = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const DAY_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Monday = 0 … Sunday = 6 of a `YYYY-MM-DD`. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

function monthShort(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
}

/** "1 entrega", "9 entregas". */
export function entregasText(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "entrega" : "entregas"}`;
}

/** "9 – 15 nov · 9 entregas"; across months "28 oct – 3 nov · …". */
export function weekMeta(week: TareasTrend["week"]): string {
  const range =
    week.from.slice(0, 7) === week.to.slice(0, 7)
      ? `${dayOfMonth(week.from)} – ${dayOfMonth(week.to)} ${monthShort(week.to)}`
      : `${dayOfMonth(week.from)} ${monthShort(week.from)} – ${dayOfMonth(week.to)} ${monthShort(week.to)}`;
  return `${range} · ${entregasText(week.total)}`;
}

/** Bar height: 4 px when nothing is due, else `round(2 + 36 · n / max)` (max 38). */
export function weekBarHeight(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 4;
  return Math.round(2 + (36 * count) / max);
}

/**
 * The week strip's days: name, number, count, bar, and the per-day label
 * ("Lunes 9, 1 entrega (hoy)", "Martes 10, sin entregas"). Today is
 * flagged; the busiest day (the first with the most tasks due, when any) too.
 * The bar takes the dominant tramo's color, `border` when nothing is due.
 */
export function weekStripDays(week: TareasTrend["week"], today: string): WeekStripDay[] {
  const max = Math.max(0, ...week.days.map((d) => d.due));
  const busiestDate = max > 0 ? week.days.find((d) => d.due === max)?.date : undefined;
  return week.days.map((day) => {
    const i = weekdayIndex(day.date);
    const isToday = day.date === today;
    const count = day.due > 0 ? entregasText(day.due) : "sin entregas";
    return {
      date: day.date,
      name: DAY_SHORT[i],
      number: dayOfMonth(day.date),
      count: day.due,
      ariaLabel: `${DAY_LONG[i]} ${dayOfMonth(day.date)}, ${count}${isToday ? " (hoy)" : ""}`,
      barHeight: weekBarHeight(day.due, max),
      barColor: day.due === 0 ? "var(--border)" : day.tramoKey ? tramoColorVar(day.tramoKey) : "var(--muted-foreground)",
      today: isToday,
      busiest: day.date === busiestDate,
    };
  });
}
