/**
 * Pure helpers of the Asistente Esencial layout (frame `Asistente-Esencial`):
 * the conversation time line, task rows out of read tools, the short
 * confirmation question and where a grouped confirmation stands. Built on the
 * shared step model (`lib/assistant/tool-steps.ts`). Client-safe.
 */
import type { UIMessage } from "ai";

import { ORG_TIME_ZONE } from "@/lib/my-space/zoned-time";
import {
  taskCardsOf,
  todayIso,
  unwrapOutput,
  type ToolApprovalGroup,
  type ToolStep,
} from "@/lib/assistant/tool-steps";
import { previewTitle, summarizeToolCall, toolPreviews } from "@/lib/assistant/tool-summaries";

// ── Times ────────────────────────────────────────────────────────────────────

function localDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function localTime(at: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: ORG_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

/** "hoy, 10:38", "ayer, 18:02", "6 nov, 09:15" (org time zone); null for a missing or invalid date. */
export function conversationTimeLabel(iso: string | undefined | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = localDay(at);
  const time = localTime(at);
  if (day === localDay(now)) return `hoy, ${time}`;
  if (day === localDay(new Date(now.getTime() - 86_400_000))) return `ayer, ${time}`;
  const date = new Intl.DateTimeFormat("es-MX", { timeZone: ORG_TIME_ZONE, day: "numeric", month: "short" })
    .format(at)
    .replace(/\./g, "");
  return `${date}, ${time}`;
}

/** The first message's `metadata.createdAt`, if any. */
export function firstMessageTime(messages: readonly UIMessage[]): string | null {
  for (const message of messages) {
    const meta = message.metadata as { createdAt?: unknown } | undefined;
    if (meta && typeof meta.createdAt === "string") return meta.createdAt;
  }
  return null;
}

// ── Task lists from read tools ───────────────────────────────────────────────

export type LateTone = "destructive" | "warning" | "muted";

export type EsencialTaskRow = {
  key: string;
  title: string;
  href?: string;
  tramo: { key: string; name: string; sortOrder: number } | null;
  /** Trailing label: "12 d tarde" or the short due date. */
  trailing: { label: string; tone: LateTone } | null;
};

export type EsencialTaskList = { rows: EsencialTaskRow[]; total: number };

/** ≥ 10 d destructive, 5–9 d warning, < 5 d muted. */
export function lateTone(daysLate: number): LateTone {
  if (daysLate >= 10) return "destructive";
  if (daysLate >= 5) return "warning";
  return "muted";
}

function shortDate(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(d).replace(/\./g, "");
}

function rawItems(output: unknown): unknown[] {
  const value = unwrapOutput(output);
  if (Array.isArray(value)) return value;
  const tasks = value && typeof value === "object" ? (value as { tasks?: unknown }).tasks : undefined;
  return Array.isArray(tasks) ? tasks : [];
}

function text(item: unknown, key: string): string | null {
  const value = item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The rows of a task-list result (`taskCardsOf`: `list_my_tasks`,
 * `list_activities_due`), each with its link to the task when the tool
 * gives one; null when the result isn't a task list.
 */
export function taskListOf(output: unknown, today: string = todayIso()): EsencialTaskList | null {
  const cards = taskCardsOf(output, today);
  if (!cards || cards.length === 0) return null;
  const items = rawItems(output);
  const rows = cards.map((card, index): EsencialTaskRow => {
    const item = items[index];
    const id = text(item, "id");
    const href = text(item, "url") ?? (id ? `/tareas?tarea=${encodeURIComponent(id)}` : undefined);
    const trailing =
      card.daysLate !== null
        ? { label: `${card.daysLate} d tarde`, tone: lateTone(card.daysLate) }
        : card.dueDate
          ? { label: shortDate(card.dueDate), tone: "muted" as const }
          : null;
    return { key: id ?? `${index}-${card.title}`, title: card.title, href, tramo: card.tramo, trailing };
  });
  const value = unwrapOutput(output);
  const count = value && typeof value === "object" ? (value as { count?: unknown }).count : undefined;
  return { rows, total: typeof count === "number" ? Math.max(count, rows.length) : rows.length };
}

// ── Grouped confirmation ─────────────────────────────────────────────────────

/** Approval ids of the group still waiting for an answer. */
export function pendingIdsOf(group: ToolApprovalGroup): string[] {
  return group.steps.flatMap((step) => (step.state === "needs-confirmation" && step.approvalId ? [step.approvalId] : []));
}

export type ApprovalOutcome =
  | { kind: "pending" }
  | { kind: "running" }
  | { kind: "done"; done: number; total: number }
  | { kind: "denied" }
  /** `errorText`: user-facing text of the first failure. */
  | { kind: "error"; done: number; total: number; errorText: string };

/** Where a group stands after its answer: "Hecho", "Cancelado", "3 de 4 hechas" or the error. */
export function approvalOutcome(group: ToolApprovalGroup): ApprovalOutcome {
  const steps: ToolStep[] = group.steps;
  if (steps.some((s) => s.state === "needs-confirmation")) return { kind: "pending" };
  if (steps.every((s) => s.state === "denied")) return { kind: "denied" };
  if (steps.some((s) => s.state === "confirmed" || s.state === "running")) return { kind: "running" };
  const answered = steps.filter((s) => s.state !== "denied");
  const errors = answered.filter((s) => s.state === "error");
  const done = answered.length - errors.length;
  if (errors.length > 0) return { kind: "error", done, total: answered.length, errorText: errors[0].errorText ?? "" };
  return { kind: "done", done, total: answered.length };
}

/** Infinitive → first person for the summaries without preview copy ("Mover" → "Muevo"). */
const IRREGULAR: Record<string, string> = {
  mover: "muevo",
  enviar: "envío",
  poner: "pongo",
  hacer: "hago",
  convertir: "convierto",
  pedir: "pido",
  dar: "doy",
  ver: "veo",
};

/** "Crear 4 tareas en «X»" → "Creo 4 tareas en «X»"; a sentence not starting with an infinitive stays. */
export function asFirstPerson(sentence: string): string {
  const match = /^(\S+)(.*)$/s.exec(sentence.trim());
  if (!match) return sentence;
  const [, word, rest] = match;
  if (!/^[a-záéíóúñ]+(ar|er|ir)$/i.test(word)) return sentence;
  const lower = word.toLowerCase();
  const conj = IRREGULAR[lower] ?? `${lower.slice(0, -2)}o`;
  return `${conj.charAt(0).toUpperCase()}${conj.slice(1)}${rest}`;
}

/**
 * The Esencial question and its plain detail: "¿Creo 4 tareas para el vie
 * 13 nov?" (`previewTitle` question form, with the date every row shares)
 * and, for one call, its summary ("Crear la tarea «Revisión» en «Casa Lomas»").
 * Tools without preview copy ask with their summary in first person.
 */
export function esencialQuestion(group: ToolApprovalGroup, inputs: readonly unknown[]): { question: string; detail: string } {
  const n = group.steps.length;
  const summary = summarizeToolCall(group.toolName, inputs[0]).replace(/[.\s]+$/, "");
  const fallbackDetail = "Nada cambia hasta que confirmes.";
  if (toolPreviews[group.toolName]) {
    const rows = group.preview;
    const date = rows.length === n && rows[0]?.date && rows.every((r) => r.date === rows[0].date) ? rows[0].date : undefined;
    return { question: previewTitle(group.toolName, n, "question", date), detail: n === 1 ? `${summary}.` : fallbackDetail };
  }
  const sentence = asFirstPerson(`${summary.charAt(0).toUpperCase()}${summary.slice(1)}`);
  return { question: `¿${sentence}${n > 1 ? ` (${n} veces)` : ""}?`, detail: fallbackDetail };
}
