/**
 * Zod schemas for the project flow action inputs (BE §6). Parsed server-side
 * through `parseInput`; the UI keeps its own local checks and doesn't import
 * these.
 */
import { z } from "zod";

/** zod messages that are action error codes: the first issue with one of these throws it as is. */
const KNOWN_CODES = new Set(["EMPTY"]);

/**
 * Parses an action input. A first issue whose message is a known code
 * (`EMPTY`) throws that code; anything else throws `INVALID: <path>`.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  if (issue && KNOWN_CODES.has(issue.message)) throw new Error(issue.message);
  throw new Error(`INVALID: ${issue ? issue.path.map(String).join(".") : ""}`);
}

export const UuidSchema = z.uuid();
const uuid = UuidSchema;
const isoDate = z.iso.date();
const name = z.string().trim().min(1, "EMPTY").max(120);

export const WorkflowPhaseInputSchema = z.object({ name, active: z.boolean().optional() });
/** `weeklyCapacityHours`: whole hours 0–80, or null for no capacity (`positions_weekly_capacity_hours_check`). */
export const PositionInputSchema = z.object({
  name,
  active: z.boolean().optional(),
  weeklyCapacityHours: z.number().int().min(0).max(80).nullable().optional(),
});
export const ProjectCreateInputSchema = z.object({
  name,
  startWorkflowId: uuid.nullable().optional(),
  phaseIds: z.array(uuid).max(50).optional(),
});
export const ProjectSpaceNameSchema = name;
export const OrderedIdsSchema = z.array(uuid).max(500);
/** `setPositionPhasesAction`, `setStaffPositionsAction`. */
export const UuidArraySchema = z.array(uuid);

const offsetDays = z.number().int().min(-3650).max(3650).nullable().optional();

/** `createTemplateAction`; `updateTemplateAction` parses `.partial()`. `phaseId` is required. */
export const WorkflowTaskTemplateInputSchema = z.object({
  phaseId: uuid,
  title: z.string().trim().min(1, "EMPTY").max(500),
  notes: z.string().nullable().optional(),
  defaultPriority: z.enum(["alta", "media", "baja"]).optional(),
  commitmentOffsetDays: offsetDays,
  reviewOffsetDays: offsetDays,
  deliveryOffsetDays: offsetDays,
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const StartTramoAssignmentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("self") }),
  z.object({ mode: z.literal("by_phase"), managers: z.record(uuid, uuid.nullable()) }),
  z.object({ mode: z.literal("none") }),
]);

export const StartTramoInputSchema = z.object({
  projectId: uuid,
  workflowId: uuid,
  phaseIds: z.array(uuid).max(50),
  assignment: StartTramoAssignmentSchema,
  autoStart: z.boolean().optional(),
});

export const AdminTaskInputSchema = z.object({
  projectId: uuid,
  title: z.string().trim().min(1).max(500),
  notes: z.string().nullable().optional(),
  managerId: uuid.nullable().optional(),
  supportIds: z.array(uuid).max(50).optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  commitmentDate: isoDate.nullable().optional(),
  reviewDate: isoDate.nullable().optional(),
  deliveryDate: isoDate.nullable().optional(),
});

export const AdminTaskFiltersSchema = z.object({
  projectId: uuid.optional(),
  includeClosed: z.boolean().optional(),
});

export type AdminTaskFilters = z.infer<typeof AdminTaskFiltersSchema>;
