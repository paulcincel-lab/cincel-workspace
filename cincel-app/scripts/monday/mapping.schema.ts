/**
 * The validated `mapping.json` contract shared by `init`, `translate` and
 * `plan` (docs/specs/monday-migration/backend.md §5.4, strategies §5.1,
 * concept translation §5.2).
 *
 * `init` drafts it from an export; the admin edits it; `plan` and `apply`
 * refuse to run on a file that does not parse.
 */
import { z } from "zod";

export const ColumnTarget = z.enum([
  "title",
  "notes",
  "status",
  "priority",
  "people",
  "commitment_date",
  "delivery_date",
  "timeline",
  "dependencies",
  "files",
  "client",
  "contact_email",
  "contact_phone",
  "import_data",
  "ignore",
]);
export type ColumnTarget = z.infer<typeof ColumnTarget>;

export const ClientRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), contactId: z.uuid() }),
  z.object({ kind: z.literal("relation_column"), columnId: z.string() }),
  z.object({
    kind: z.literal("new"),
    name: z.string().min(1),
    contactKind: z.enum(["empresa", "particular"]).default("empresa"),
  }),
]);
export type ClientRef = z.infer<typeof ClientRef>;

export const StatusTarget = z.union([
  z.object({
    status: z.enum(["pendiente", "en_proceso", "completado", "bloqueado"]),
    // init found no equivalent and drafted an open status; cleared once the admin picks one.
    defaulted: z.literal(true).optional(),
  }),
  // tasks.status is derived via underlyingStatus(), never set alongside it.
  z.object({ customStatusId: z.uuid() }),
]);
export type StatusTarget = z.infer<typeof StatusTarget>;

export const BoardStrategy = z.enum([
  "board_as_project",
  "group_as_project",
  "item_as_project",
  "crm_contacts",
  "skip",
]);
export type BoardStrategy = z.infer<typeof BoardStrategy>;

/**
 * What one monday group becomes on a `board_as_project` or `item_as_project` board (#687). Unset groups take
 * the board workflow's phase of the same name (`workflow_phase`), else a new project phase named after the group.
 */
export const GroupTarget = z.discriminatedUnion("kind", [
  // A new project phase named after the group (the behaviour before #687).
  z.object({ kind: z.literal("phase") }),
  // A phase of the board's workflow (its templates' `phase`), by name.
  z.object({ kind: z.literal("workflow_phase"), phase: z.string().trim().min(1) }),
  // A workflow stage: the project gets a `project_stages` row for it; the group's tasks get no phase.
  z.object({ kind: z.literal("stage"), workflowId: z.uuid() }),
  // Its own project, as `group_as_project` does for every group (board_as_project only).
  z.object({ kind: z.literal("project") }),
  // The group's items are not imported.
  z.object({ kind: z.literal("ignore") }),
]);
export type GroupTarget = z.infer<typeof GroupTarget>;

/**
 * Where a task's área and workflow come from (#686): the board's own (`areaId` / `workflowId`, the behaviour
 * before #686), its monday group, or one of its dropdown, status or text columns. On `item_as_project` boards the
 * column is a subitem column, since subitems are the tasks there.
 */
export const TaskAreaSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("board") }),
  z.object({ kind: z.literal("group") }),
  z.object({ kind: z.literal("column"), columnId: z.string().min(1) }),
]);
export type TaskAreaSource = z.infer<typeof TaskAreaSource>;

/** The Cincel área and workflow of one monday value (#686). `ignore`: the task keeps the board's workflow. */
export const TaskAreaTarget = z.discriminatedUnion("action", [
  // An existing área; the workflow must be one of its `area_workflows` when it has any.
  z.object({ action: z.literal("area"), areaId: z.uuid(), workflowId: z.uuid().nullable() }),
  // A new área the import creates (and rollback removes), linked to the workflow when one is given.
  z.object({ action: z.literal("create_area"), name: z.string().trim().min(1), workflowId: z.uuid().nullable() }),
  z.object({ action: z.literal("ignore") }),
]);
export type TaskAreaTarget = z.infer<typeof TaskAreaTarget>;

export const BoardMapping = z.object({
  mondayBoardId: z.string(),
  name: z.string(),
  strategy: BoardStrategy,
  // crm_contacts
  contactType: z.enum(["cliente", "socio", "proveedor"]).optional(),
  // crm_contacts + proveedor: a core.provider_subtype value
  providerSubtype: z.string().optional(),
  // crm_contacts: monday item id → existing contact
  contactMatches: z.record(z.string(), z.uuid()).default({}),
  areaId: z.uuid().nullable().optional(),
  // usuario tasks' workflow (Actividades department)
  workflowId: z.uuid().nullable().optional(),
  client: ClientRef.nullable().optional(),
  // group_as_project, and groups mapped to their own project: groupId → client
  groupClients: z.record(z.string(), ClientRef).optional(),
  // board_as_project / item_as_project: groupId → what the group becomes (#687)
  groupTargets: z.record(z.string(), GroupTarget).default({}),
  // board_as_project
  projectCode: z.string().optional(),
  // board/group/item id → project name override
  projectNames: z.record(z.string(), z.string()).default({}),
  // group/item id → code (other strategies)
  projectCodes: z.record(z.string(), z.string()).default({}),
  columns: z.record(z.string(), ColumnTarget),
  subitemColumns: z.record(z.string(), ColumnTarget).default({}),
  // columnId → { labelId → target }
  statusMaps: z.record(z.string(), z.record(z.string(), StatusTarget)),
  subitems: z.enum(["checklist", "child_tasks", "ignore"]).default("checklist"),
  schedule: z
    .object({
      enabled: z.boolean(),
      planta: z
        .union([
          z.object({ fixed: z.string().min(1) }),
          z.object({ columnId: z.string() }),
        ])
        .default({ fixed: "General" }),
    })
    .default({ enabled: false, planta: { fixed: "General" } }),
  // monday item id → workflow_task_templates.id
  templateMatches: z.record(z.string(), z.uuid()).default({}),
  // Tasks' área and workflow (#686): the source, and its value (group id, or the column's text) → target
  taskAreaSource: TaskAreaSource.default({ kind: "board" }),
  taskAreas: z.record(z.string(), TaskAreaTarget).default({}),
});
export type BoardMapping = z.infer<typeof BoardMapping>;

export const PersonTarget = z.union([
  // created: the wizard's "Crear integrante" made this staff member; rollback removes it while unused (#689).
  z.object({ action: z.literal("staff"), staffId: z.uuid(), created: z.boolean().optional() }),
  z.object({ action: z.literal("contact"), contactId: z.uuid().optional() }),
  z.object({ action: z.literal("ignore") }),
  z.null(),
]);
export type PersonTarget = z.infer<typeof PersonTarget>;

export const Mapping = z.object({
  version: z.literal(1),
  boards: z.array(BoardMapping),
  // monday user id → target
  people: z.record(z.string(), PersonTarget),
  options: z.object({
    includeUpdates: z.boolean().default(true),
    includeFiles: z.boolean().default(true),
  }),
});
export type Mapping = z.infer<typeof Mapping>;
/** The shape accepted before defaults are applied (what `init` writes and the admin edits). */
export type MappingInput = z.input<typeof Mapping>;
