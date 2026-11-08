/**
 * Assistant tool group "Mi espacio y jornada (6)" (redesign BE §10.3; Phase 7):
 * `create_note`, `create_checklist`, `clock_in`, `pause_or_clock_out`,
 * `get_my_hours`, `team_hours_report`.
 *
 * - `available(ctx)` reads only the `IMPLEMENTED` flags of the actions each
 *   tool calls (Rule 3), so a tool lights up when its phase lands.
 * - None of these tools is "Confirmar"; the writes are declared `write: true`
 *   so they still ask for approval when the turn already holds an untrusted
 *   result (review N4).
 * - Notes, checklists and time entries are owner-only (BE §9.1): nothing is
 *   written to `history_events` (BE §9.9); the audit is `assistant_actions`.
 */
import { z } from "zod";

import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { toolSummaries } from "@/lib/assistant/tool-summaries";
import { IMPLEMENTED as MY_SPACE } from "@/lib/actions/my-space-actions.flags";
import { IMPLEMENTED as TIME_TRACKING } from "@/lib/actions/time-tracking-actions.flags";
import {
  createChecklistAction,
  createNoteAction,
  fetchNotesAction,
  updateNoteAction,
} from "@/lib/actions/my-space-actions";
import { unwrapActionResult } from "@/lib/actions/action-result";
import {
  clockInAction,
  clockOutAction,
  fetchMyTodayAction,
  fetchMyWeekHoursAction,
  fetchTeamHoursAction,
  pauseWorkAction,
} from "@/lib/actions/time-tracking-actions";
import { canViewTeamHours } from "@/lib/auth/permissions";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type { TeamHoursRow, TodayStatus } from "@/lib/types/redesign";

// ── Shared helpers ──────────────────────────────────────────────────────────

type ToolFailure = { ok: false; error: string; message: string; candidates?: string[] };

/** Copy for the time-tracking codes, then the shared action copy (FE §9). */
const TIME_TRACKING_COPY: Record<string, string> = {
  DISABLED: "El control de horario no está activo para ti.",
  ALREADY_ON: "Ya registraste tu entrada de hoy.",
  NOT_ON: "No tienes una jornada en curso.",
};

function failure(err: unknown): ToolFailure {
  const code = actionErrorCode(err) || "ERROR";
  return { ok: false, error: code, message: TIME_TRACKING_COPY[code] ?? actionErrorText(err) };
}

const STATE_LABEL: Record<TodayStatus["state"], string> = {
  off: "sin registrar",
  on: "en jornada",
  pausa: "en pausa",
  done: "jornada terminada",
};

function hoursFromSeconds(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

function todaySummary(status: TodayStatus) {
  return {
    enabled: status.enabled,
    state: status.state,
    stateLabel: STATE_LABEL[status.state],
    startedAt: status.startedAt,
    workedHours: hoursFromSeconds(status.workedSeconds),
    hoursPerDay: status.hoursPerDay,
    required: status.required,
  };
}

/** `YYYY-MM-DD` of today in the org time zone. */
function todayInOrgZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_TRACKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The Monday (`YYYY-MM-DD`) of the week holding `date` (`YYYY-MM-DD`). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const offset = (utc.getUTCDay() + 6) % 7; // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - offset);
  return utc.toISOString().slice(0, 10);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Same matching rule as the assistant's name resolvers: exact, then a unique partial match. */
function matchRowsByName(
  rows: TeamHoursRow[],
  names: string[],
): { ok: true; rows: TeamHoursRow[] } | ToolFailure {
  const picked = new Map<string, TeamHoursRow>();
  for (const name of names) {
    const q = normalize(name);
    if (!q) continue;
    const exact = rows.filter((r) => normalize(r.name) === q);
    const partial = exact.length ? exact : rows.filter((r) => normalize(r.name).includes(q));
    if (partial.length === 0) {
      return { ok: false, error: "NOT_FOUND", message: `No se encontró a "${name}" en el reporte de horas.` };
    }
    if (partial.length > 1) {
      return {
        ok: false,
        error: "AMBIGUOUS",
        message: `"${name}" es ambiguo, coincide con varias personas.`,
        candidates: partial.slice(0, 10).map((r) => r.name),
      };
    }
    picked.set(partial[0].staffId, partial[0]);
  }
  return { ok: true, rows: [...picked.values()] };
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const NOTE_COLOR = z.enum(["neutral", "blue", "amber", "violet", "cyan"]);

// ── create_note ─────────────────────────────────────────────────────────────

const createNoteSchema = z
  .object({
    title: z.string().max(200).optional().describe("Título de la nota"),
    body: z.string().max(20_000).optional().describe("Texto de la nota"),
    pinned: z.boolean().optional().describe("Fijar la nota arriba"),
    color: NOTE_COLOR.optional().describe("Color de la nota"),
    noteId: z.string().uuid().optional().describe("Para agregar texto a una nota existente"),
    append: z.string().max(20_000).optional().describe("Texto a agregar al final de la nota `noteId`"),
  })
  .refine((v) => (v.noteId ? Boolean(v.append?.trim()) : Boolean(v.title?.trim() || v.body?.trim())), {
    message: "Escribe un título o un texto (o noteId + append para agregar).",
  });

const create_note = defineTool({
  name: "create_note",
  description:
    "Crea una nota personal en Mi espacio ({ title, body, pinned?, color? }) o agrega texto a una nota existente ({ noteId, append }). Las notas son privadas del usuario.",
  schema: createNoteSchema,
  capability: () => true,
  available: () => MY_SPACE.createNoteAction && MY_SPACE.updateNoteAction && MY_SPACE.fetchNotesAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.create_note,
  async run(_ctx, input) {
    try {
      if (input.noteId) {
        const notes = await fetchNotesAction();
        const existing = notes.find((n) => n.id === input.noteId);
        if (!existing) return failure(new Error("NOT_FOUND"));
        const addition = (input.append ?? "").trim();
        const body = existing.body.trim() ? `${existing.body}\n${addition}` : addition;
        const note = unwrapActionResult(await updateNoteAction(existing.id, { body }));
        return { ok: true, appended: true, note: { id: note.id, title: note.title }, url: `/mi-espacio/notas/${note.id}` };
      }
      const note = unwrapActionResult(
        await createNoteAction({
          title: input.title?.trim() || undefined,
          body: input.body ?? undefined,
          pinned: input.pinned,
          color: input.color,
        }),
      );
      return { ok: true, appended: false, note: { id: note.id, title: note.title }, url: `/mi-espacio/notas/${note.id}` };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── create_checklist ────────────────────────────────────────────────────────

const createChecklistSchema = z.object({
  title: z.string().trim().min(1).max(200).describe("Título del checklist"),
  items: z.array(z.string().trim().min(1).max(500)).max(100).describe("Elementos del checklist, en orden"),
});

const create_checklist = defineTool({
  name: "create_checklist",
  description: "Crea un checklist personal en Mi espacio con un título y sus elementos en orden.",
  schema: createChecklistSchema,
  capability: () => true,
  available: () => MY_SPACE.createChecklistAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.create_checklist,
  async run(_ctx, input) {
    try {
      const checklist = unwrapActionResult(await createChecklistAction({ title: input.title, items: input.items }));
      return {
        ok: true,
        checklist: { id: checklist.id, title: checklist.title, items: checklist.items.length },
        url: "/mi-espacio",
      };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── clock_in ────────────────────────────────────────────────────────────────

const clock_in = defineTool({
  name: "clock_in",
  description:
    "Registra la entrada del usuario (inicia su jornada). Solo funciona cuando el control de horario está activo para él.",
  schema: z.object({}),
  capability: () => true,
  available: () => TIME_TRACKING.clockInAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.clock_in,
  async run() {
    try {
      const status = unwrapActionResult(await clockInAction({ source: "assistant" }));
      return { ok: true, today: todaySummary(status) };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── pause_or_clock_out ──────────────────────────────────────────────────────

const pauseOrClockOutSchema = z.object({
  action: z.enum(["pausa", "salida"]).describe('"pausa" para pausar la jornada, "salida" para terminarla'),
});

const pause_or_clock_out = defineTool({
  name: "pause_or_clock_out",
  description: "Pausa la jornada en curso del usuario o registra su salida.",
  schema: pauseOrClockOutSchema,
  capability: () => true,
  available: () => TIME_TRACKING.pauseWorkAction && TIME_TRACKING.clockOutAction,
  confirm: false,
  write: true,
  summarize: toolSummaries.pause_or_clock_out,
  async run(_ctx, input) {
    try {
      const status = input.action === "pausa" ? unwrapActionResult(await pauseWorkAction()) : unwrapActionResult(await clockOutAction());
      return { ok: true, action: input.action, today: todaySummary(status) };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── get_my_hours ────────────────────────────────────────────────────────────

const getMyHoursSchema = z.object({
  range: z.enum(["hoy", "semana"]).describe('"hoy" para la jornada de hoy, "semana" para la semana actual'),
});

const get_my_hours = defineTool({
  name: "get_my_hours",
  description: "Consulta las horas trabajadas del usuario: hoy (estado de la jornada) o la semana actual (lunes a domingo).",
  schema: getMyHoursSchema,
  capability: () => true,
  available: () => TIME_TRACKING.fetchMyTodayAction && TIME_TRACKING.fetchMyWeekHoursAction,
  confirm: false,
  write: false,
  summarize: toolSummaries.get_my_hours,
  async run(_ctx, input) {
    try {
      if (input.range === "hoy") {
        const status = await fetchMyTodayAction();
        if (!status.enabled) return { ok: true, range: "hoy", enabled: false, message: TIME_TRACKING_COPY.DISABLED };
        return { ok: true, range: "hoy", today: todaySummary(status) };
      }
      const week = await fetchMyWeekHoursAction();
      return { ok: true, range: "semana", days: week.days, total: week.total, target: week.target };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── team_hours_report ───────────────────────────────────────────────────────

const teamHoursReportSchema = z.object({
  weekStart: DATE.optional().describe("Cualquier día de la semana a consultar (se usa su lunes); por omisión, esta semana"),
  people: z.array(z.string().min(1)).max(50).optional().describe("Nombres para filtrar el reporte"),
});

const team_hours_report = defineTool({
  name: "team_hours_report",
  description:
    "Reporte de horas del equipo para una semana (lunes a domingo): horas por día, total, meta, retardos y estado por persona.",
  schema: teamHoursReportSchema,
  capability: (user) => canViewTeamHours(user),
  available: () => TIME_TRACKING.fetchTeamHoursAction,
  confirm: false,
  write: false,
  summarize: toolSummaries.team_hours_report,
  async run(ctx, input) {
    if (!canViewTeamHours(ctx.user)) return failure(new Error("FORBIDDEN"));
    try {
      const weekStart = mondayOf(input.weekStart ?? todayInOrgZone());
      const rows = await fetchTeamHoursAction({ weekStart });
      let selected = rows;
      if (input.people?.length) {
        const matched = matchRowsByName(rows, input.people);
        if (!matched.ok) return matched;
        selected = matched.rows;
      }
      return {
        ok: true,
        weekStart,
        rows: selected.map((r) => ({
          staffId: r.staffId,
          name: r.name,
          days: r.days,
          total: r.total,
          target: r.target,
          lateCount: r.lateCount,
          status: r.status,
        })),
      };
    } catch (err) {
      return failure(err);
    }
  },
});

export const tools: DefinedTool[] = [
  create_note,
  create_checklist,
  clock_in,
  pause_or_clock_out,
  get_my_hours,
  team_hours_report,
] as DefinedTool[];
