/**
 * History groups of the full `/asistente` page (redesign FE §3.9): Hoy,
 * Esta semana (from Monday) and Anteriores, in the viewer's local time.
 * Pure and client-safe.
 */
import type { AssistantThreadSummary } from "@/lib/types/redesign";

export type AssistantThreadGroupKey = "hoy" | "semana" | "anteriores";

export type AssistantThreadGroup = {
  key: AssistantThreadGroupKey;
  label: string;
  threads: AssistantThreadSummary[];
};

const GROUP_LABELS: Record<AssistantThreadGroupKey, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  anteriores: "Anteriores",
};

const GROUP_ORDER: readonly AssistantThreadGroupKey[] = ["hoy", "semana", "anteriores"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday 00:00 of the week that contains `date`. */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const sinceMonday = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
}

export function threadGroupKey(updatedAt: string, now: Date = new Date()): AssistantThreadGroupKey {
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return "anteriores";
  if (at >= startOfDay(now)) return "hoy";
  if (at >= startOfWeek(now)) return "semana";
  return "anteriores";
}

/** Threads newest first inside each group; empty groups are left out. */
export function groupAssistantThreads(
  threads: readonly AssistantThreadSummary[],
  now: Date = new Date(),
): AssistantThreadGroup[] {
  const buckets: Record<AssistantThreadGroupKey, AssistantThreadSummary[]> = { hoy: [], semana: [], anteriores: [] };
  const sorted = [...threads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const thread of sorted) buckets[threadGroupKey(thread.updatedAt, now)].push(thread);
  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    threads: buckets[key],
  }));
}

const TIME_FORMAT = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("es-MX", { weekday: "short" });
const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

/** "08:30" today, "jue" this week, "6 oct" before (lowercase es-MX, FE §13). */
export function threadTimeLabel(updatedAt: string, group: AssistantThreadGroupKey): string {
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return "";
  const raw =
    group === "hoy" ? TIME_FORMAT.format(at) : group === "semana" ? WEEKDAY_FORMAT.format(at) : DATE_FORMAT.format(at);
  return raw.replace(/\./g, "").toLowerCase();
}
