/**
 * History groups of the full `/asistente` page (redesign FE §3.9): Hoy,
 * Esta semana (from Monday) and Anteriores, in the viewer's local time; or,
 * in `mode: "pinned"` (Visual rail), Fijadas then Recientes. Also the rail's
 * search and status line. Pure and client-safe.
 */
import type { AssistantThreadSummary } from "@/lib/types/redesign";

export type AssistantThreadGroupKey = "hoy" | "semana" | "anteriores" | "fijadas" | "recientes";

/** `date`: Hoy / Esta semana / Anteriores. `pinned`: Fijadas (newest pin first) then Recientes (newest first). */
export type AssistantThreadGroupMode = "date" | "pinned";

export type AssistantThreadGroup = {
  key: AssistantThreadGroupKey;
  label: string;
  threads: AssistantThreadSummary[];
};

const GROUP_LABELS: Record<AssistantThreadGroupKey, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  anteriores: "Anteriores",
  fijadas: "Fijadas",
  recientes: "Recientes",
};

const GROUP_ORDER: readonly ("hoy" | "semana" | "anteriores")[] = ["hoy", "semana", "anteriores"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday 00:00 of the week that contains `date`. */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const sinceMonday = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
}

export function threadGroupKey(updatedAt: string, now: Date = new Date()): "hoy" | "semana" | "anteriores" {
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return "anteriores";
  if (at >= startOfDay(now)) return "hoy";
  if (at >= startOfWeek(now)) return "semana";
  return "anteriores";
}

function time(value: string | null | undefined): number {
  const at = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
}

/** Fijadas (only when one is pinned) newest pin first, then Recientes newest first. */
function groupByPin(threads: readonly AssistantThreadSummary[]): AssistantThreadGroup[] {
  const pinned = threads.filter((t) => t.pinnedAt).sort((a, b) => time(b.pinnedAt) - time(a.pinnedAt));
  const recent = threads.filter((t) => !t.pinnedAt).sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  const groups: AssistantThreadGroup[] = [];
  if (pinned.length > 0) groups.push({ key: "fijadas", label: GROUP_LABELS.fijadas, threads: pinned });
  if (recent.length > 0) groups.push({ key: "recientes", label: GROUP_LABELS.recientes, threads: recent });
  return groups;
}

/** Threads newest first inside each group; empty groups are left out. */
export function groupAssistantThreads(
  threads: readonly AssistantThreadSummary[],
  now: Date = new Date(),
  mode: AssistantThreadGroupMode = "date",
): AssistantThreadGroup[] {
  if (mode === "pinned") return groupByPin(threads);
  const buckets: Record<"hoy" | "semana" | "anteriores", AssistantThreadSummary[]> = { hoy: [], semana: [], anteriores: [] };
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

/**
 * "08:30" today, "jue" this week, "6 oct" before (lowercase es-MX, FE §13).
 * For the Visual rail groups (Fijadas, Recientes): "08:30" today, "vie 6 nov"
 * this week, "28 oct" before.
 */
export function threadTimeLabel(updatedAt: string, group: AssistantThreadGroupKey, now: Date = new Date()): string {
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return "";
  const key = group === "fijadas" || group === "recientes" ? threadGroupKey(updatedAt, now) : group;
  const rail = group === "fijadas" || group === "recientes";
  const raw =
    key === "hoy"
      ? TIME_FORMAT.format(at)
      : key === "semana"
        ? rail
          ? `${WEEKDAY_FORMAT.format(at)} ${DATE_FORMAT.format(at)}`
          : WEEKDAY_FORMAT.format(at)
        : DATE_FORMAT.format(at);
  return raw.replace(/\./g, "").replace(/,/g, "").toLowerCase();
}

/** The status line of a rail row and its tone: pending confirmation, new reply, or the time. */
export type ThreadStatusLine = { tone: "warning" | "muted"; text: string; emphasis: boolean };

export function threadStatusLine(thread: AssistantThreadSummary, now: Date = new Date()): ThreadStatusLine {
  const at = new Date(thread.updatedAt);
  const clock = Number.isNaN(at.getTime()) ? "" : TIME_FORMAT.format(at);
  const withClock = (text: string) => (clock ? `${text} · ${clock}` : text);
  if (thread.pendingApprovals > 0) return { tone: "warning", text: withClock("Confirmación pendiente"), emphasis: true };
  if (thread.unread) return { tone: "muted", text: withClock("Nueva respuesta"), emphasis: true };
  return { tone: "muted", text: threadTimeLabel(thread.updatedAt, "recientes", now), emphasis: false };
}

/** Lowercase, without accents (á → a, ñ → n), trimmed: the search key of a title. */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Threads whose title contains `query`, ignoring case and accents; every thread for an empty query. */
export function filterAssistantThreads(
  threads: readonly AssistantThreadSummary[],
  query: string,
): AssistantThreadSummary[] {
  const needle = searchKey(query);
  if (!needle) return [...threads];
  return threads.filter((thread) => searchKey(thread.title).includes(needle));
}
