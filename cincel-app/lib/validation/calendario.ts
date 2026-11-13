/**
 * Calendario zod schemas (BE §5.1, §6, §9, §10, §11, §12). Client-safe.
 * Dates are `z.iso.date()`, ids `UuidSchema`.
 */
import { z } from "zod";

import { UuidSchema } from "@/lib/validation/project-flow";

const DateSchema = z.iso.date();
const DAY_MS = 86_400_000;

/** Days between two `YYYY-MM-DD` dates (inclusive span minus one). */
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export const MAX_RANGE_DAYS = 42;
export const MAX_LIST_DAYS = 92;

export const CalViewSchema = z.enum(["dia", "semana", "mes"]);
export const CalMostrarSchema = z.enum(["todo", "tareas", "reuniones"]);

export const CalendarioFiltersSchema = z.object({
  mostrar: CalMostrarSchema,
  quien: z.enum(["yo", "todos"]),
  proyectos: z.array(UuidSchema).max(50),
  /** Workflow id, or "none" for sin etapa. */
  etapa: z.union([UuidSchema, z.literal("none")]).nullable(),
  responsable: UuidSchema.nullable(),
  apoyo: z.boolean(),
  ocultarCompletadas: z.boolean(),
});

export const CalendarioRangeInputSchema = z
  .object({ view: CalViewSchema, from: DateSchema, to: DateSchema, filters: CalendarioFiltersSchema })
  .refine((v) => v.to >= v.from, { message: "INVALID", path: ["to"] })
  .refine((v) => spanDays(v.from, v.to) < MAX_RANGE_DAYS, { message: "RANGE_TOO_LONG", path: ["to"] });

export const CalendarioListInputSchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
    filters: CalendarioFiltersSchema,
    cursor: z.string().max(2000).nullish(),
    limit: z.number().int().min(1).max(100).optional(),
    orderDir: z.enum(["asc", "desc"]).optional(),
  })
  .refine((v) => v.to >= v.from, { message: "INVALID", path: ["to"] })
  .refine((v) => spanDays(v.from, v.to) < MAX_LIST_DAYS, { message: "RANGE_TOO_LONG", path: ["to"] });

export const DateInputSchema = z.object({ date: DateSchema });
export const WeekInputSchema = z.object({ from: DateSchema });
export const LoadInputSchema = z
  .object({ from: DateSchema, to: DateSchema, staffIds: z.array(UuidSchema).max(20).optional() })
  .refine((v) => v.to >= v.from && spanDays(v.from, v.to) < 14, { message: "RANGE_TOO_LONG", path: ["to"] });
export const PlanWeekInputSchema = z.object({ weekStart: DateSchema, staffIds: z.array(UuidSchema).max(20).optional() });

// ── Meetings (BE §6.2, §8.1) ────────────────────────────────────────────────
export const MeetingAttendeeSchema = z.object({
  staffId: UuidSchema.optional(),
  contactId: UuidSchema.optional(),
  email: z.email().max(254),
  name: z.string().trim().min(1).max(200),
});
export const MeetingDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    /** ISO date-time with offset. */
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    projectId: UuidSchema.nullable(),
    location: z.string().trim().max(300).nullable(),
    meet: z.boolean(),
    attendees: z.array(MeetingAttendeeSchema).max(50),
    description: z.string().max(8000).optional(),
  })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), { message: "INVALID", path: ["end"] });
export const MeetingPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
  location: z.string().trim().max(300).nullable().optional(),
  attendees: z.array(MeetingAttendeeSchema).max(50).optional(),
});
export const UpdateMeetingInputSchema = MeetingPatchSchema.extend({ notify: z.boolean().optional() });
export const CancelMeetingOptsSchema = z.object({ notify: z.boolean() });
export const RefreshGoogleOptsSchema = z.object({ force: z.boolean().optional() }).optional();
export const MeetingNotesSchema = z.string().max(20_000);

// ── Proposals (BE §6.2) ─────────────────────────────────────────────────────
export const ProposalKindSchema = z.enum([
  "mover_tareas",
  "crear_reunion",
  "editar_reunion",
  "cancelar_reunion",
  "repartir",
  "resolver_traslape",
  "pasar_a_manana",
  "planear_semana",
  "crear_tareas_minuta",
]);
export const ProposalStatusSchema = z.enum(["propuesta", "aplicada", "parcial", "cancelada", "expirada", "deshecha"]);

const ChangeIdSchema = z.string().min(1).max(64);
export const ProposalChangeSchema = z.discriminatedUnion("type", [
  z.object({
    changeId: ChangeIdSchema,
    type: z.literal("task_date"),
    taskId: UuidSchema,
    title: z.string(),
    projectName: z.string().nullable(),
    before: z.object({ date: DateSchema.nullable(), field: z.enum(["commitmentDate", "deliveryDate"]) }),
    after: z.object({ date: DateSchema }),
    reason: z.string().max(200).optional(),
    staffId: UuidSchema.nullable(),
  }),
  z.object({ changeId: ChangeIdSchema, type: z.literal("event_create"), draft: MeetingDraftSchema }),
  z.object({
    changeId: ChangeIdSchema,
    type: z.literal("event_update"),
    eventId: UuidSchema,
    before: MeetingPatchSchema,
    after: MeetingPatchSchema,
    notify: z.boolean(),
  }),
  z.object({ changeId: ChangeIdSchema, type: z.literal("event_cancel"), eventId: UuidSchema, notify: z.boolean() }),
  z.object({
    changeId: ChangeIdSchema,
    type: z.literal("task_create"),
    draft: z.object({
      title: z.string().trim().min(1).max(200),
      projectId: UuidSchema,
      managerId: UuidSchema.nullable(),
      commitmentDate: DateSchema.nullable(),
      etapaId: UuidSchema.nullable(),
      sourceText: z.string().max(2000),
    }),
  }),
  z.object({ changeId: ChangeIdSchema, type: z.literal("decision"), minutesId: UuidSchema, text: z.string().trim().min(1).max(500) }),
]);
export const ProposalChangesSchema = z.array(ProposalChangeSchema).max(200);
export const DeferredItemSchema = z.object({ taskId: UuidSchema, title: z.string(), reason: z.string() });

export const ChangeIdsSchema = z.array(ChangeIdSchema).max(200).optional();
export const UndoTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Context the page sends to the asistente (BE §6.1): dates, ids and enums only. */
export const AssistantCalendarContextSchema = z.object({
  view: CalViewSchema,
  from: DateSchema,
  to: DateSchema,
  filters: z.object({
    mostrar: CalMostrarSchema,
    quien: z.enum(["yo", "todos"]),
    proyectos: z.array(UuidSchema).max(50),
    ocultarCompletadas: z.boolean(),
  }),
  selectedDate: DateSchema.optional(),
  selectedItemId: z.string().regex(/^[et]:[0-9a-f-]{36}$/i).optional(),
  openProposalId: UuidSchema.optional(),
});

// ── Tool inputs (BE §11) ────────────────────────────────────────────────────
export const CalendarRangeToolSchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
    mostrar: CalMostrarSchema.optional(),
    quien: z.enum(["yo", "todos"]).optional(),
    projectIds: z.array(UuidSchema).max(10).optional(),
    cursor: z.string().max(2000).optional(),
  })
  .refine((v) => v.to >= v.from && spanDays(v.from, v.to) <= 31, { message: "RANGE_TOO_LONG", path: ["to"] });
export const SummarizeDayToolSchema = z.object({ date: DateSchema.optional() });
export const SummarizeWeekToolSchema = z.object({ from: DateSchema.optional() });
export const DayLoadToolSchema = z
  .object({ from: DateSchema, to: DateSchema, staffIds: z.array(UuidSchema).max(20).optional() })
  .refine((v) => v.to >= v.from && spanDays(v.from, v.to) <= 14, { message: "RANGE_TOO_LONG", path: ["to"] });
export const FindOverloadsToolSchema = z
  .object({ from: DateSchema, to: DateSchema, staffIds: z.array(UuidSchema).max(20).optional() })
  .refine((v) => v.to >= v.from && spanDays(v.from, v.to) <= 31, { message: "RANGE_TOO_LONG", path: ["to"] });
export const MeetingPrepToolSchema = z.object({ eventId: UuidSchema, phrasing: z.boolean().optional() });

/** Either `moves` (a date per task) or `taskIds` with one `toDate`. One object, so providers get a plain object schema. */
export const MoveTasksToolSchema = z
  .object({
    moves: z.array(z.object({ taskId: UuidSchema, toDate: DateSchema })).min(1).max(50).optional(),
    taskIds: z.array(UuidSchema).min(1).max(50).optional(),
    toDate: DateSchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .refine((v) => (v.moves !== undefined) !== (v.taskIds !== undefined && v.toDate !== undefined), {
    message: "INVALID",
  });
export const ProposeFromTextToolSchema = z.object({
  text: z.string().trim().min(3).max(300),
  view: CalViewSchema,
  from: DateSchema,
  to: DateSchema,
  selectedDate: DateSchema.optional(),
});
export const ProposeRedistributionToolSchema = z.object({
  date: DateSchema,
  staffId: UuidSchema.optional(),
  target: z.enum(["spread", "next_day"]).optional(),
});
export const ResolveOverlapToolSchema = z.object({
  eventIds: z.tuple([UuidSchema, UuidSchema]),
  keep: UuidSchema.optional(),
});
export const PlanWeekToolSchema = z.object({
  weekStart: DateSchema,
  staffIds: z.array(UuidSchema).max(20).optional(),
  taskIds: z.array(UuidSchema).max(100).optional(),
});
export const ExtractMinutesToolSchema = z.object({ eventId: UuidSchema, notes: z.string().max(20_000).optional() });
/** What the model returns for `extract_minutes` (BE §11.2). */
export const ExtractedMinutesSchema = z.object({
  decisions: z.array(z.string()).max(10),
  tasks: z.array(z.object({ title: z.string(), owner: z.string(), due: z.string().nullable() })).max(20),
  followUp: z.object({ date: DateSchema, time: z.string().optional() }).nullable(),
  openPoints: z.array(z.string()),
});

export const ApplyProposalToolSchema = z.object({ proposalId: UuidSchema, changeIds: z.array(ChangeIdSchema).max(200).optional() });
export const UndoProposalToolSchema = z.object({ undoToken: UndoTokenSchema });
export const CreateTasksFromMinutesToolSchema = z.object({
  proposalId: UuidSchema,
  changeIds: z.array(ChangeIdSchema).max(200).optional(),
  scheduleFollowUp: z.boolean().optional(),
});
export const SendAgendaToolSchema = z.object({
  eventId: UuidSchema,
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  to: z.literal("asistentes").optional(),
});
export const SendMinutesToolSchema = z.object({ eventId: UuidSchema });

/** Names `runProposingToolAction` accepts. */
export const PROPOSING_TOOL_NAMES = ["propose_redistribution", "resolve_overlap", "plan_week", "extract_minutes", "move_tasks"] as const;
export const ProposingToolNameSchema = z.enum(PROPOSING_TOOL_NAMES);
export const EstimatedHoursSchema = z.number().gt(0).max(80).nullable();
