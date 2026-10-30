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
  // group_as_project: groupId → client
  groupClients: z.record(z.string(), ClientRef).optional(),
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
});
export type BoardMapping = z.infer<typeof BoardMapping>;

export const PersonTarget = z.union([
  z.object({ action: z.literal("staff"), staffId: z.uuid() }),
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
