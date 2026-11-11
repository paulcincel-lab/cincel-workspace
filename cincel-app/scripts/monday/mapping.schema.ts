/**
 * The validated `mapping.json` contract shared by `init`, `translate` and
 * `plan` (docs/specs/monday-migration/backend.md §5.4, strategies §5.1,
 * concept translation §5.2).
 *
 * `init` drafts it from an export; the admin edits it; `plan` and `apply`
 * refuse to run on a file that does not parse. Version 2 is the project flow
 * contract (docs/specs/project-flow/backend.md §10, §10.1); version 1 files
 * are converted with `upgradeMappingV1`, never rejected.
 *
 * No server-only imports: shared by `scripts/monday` and `lib/monday-import`.
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
  // "Fecha que finalizó": the task's closed_at (end of that day), kept only when the mapped status closes it.
  "closed_date",
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
 * What one monday group becomes on a `board_as_project` or `item_as_project` board (FE §7.8, BE §10.1): one of
 * six targets (Tramo, Fase, Espacio, Proyecto aparte, Tareas de administración, Ignorar). A group never creates
 * a fase. Unset groups take the `resolveGroupTarget` default.
 */
export const GroupTarget = z.discriminatedUnion("kind", [
  // A tramo (workflow): the project gets a `project_stages` row for it.
  z.object({ kind: z.literal("tramo"), workflowId: z.uuid() }),
  // A fase of the catalog; its tramo is the fase's own.
  z.object({ kind: z.literal("phase"), phaseId: z.uuid() }),
  // An espacio of the project named after the group.
  z.object({ kind: z.literal("space") }),
  // Its own project, as `group_as_project` does for every group (board_as_project only).
  z.object({ kind: z.literal("project") }),
  // "Tareas de administración" (RD-1)
  z.object({ kind: z.literal("admin") }),
  // The group's items are not imported.
  z.object({ kind: z.literal("ignore") }),
]);
export type GroupTarget = z.infer<typeof GroupTarget>;

/** The project flow name of `GroupTarget`, kept for the wizard payload types. */
export const ProjectFlowGroupTarget = GroupTarget;
export type ProjectFlowGroupTarget = GroupTarget;

// Fields of mapping v1 that v2 drops; present in a v2 file they fail to parse (v1 files go through upgradeMappingV1).
const removedField = z.never({ error: "Campo de la versión 1 del mapeo; ya no se usa." }).optional();

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
  // "Tramo del tablero": the tramo of tasks whose group doesn't place them
  workflowId: z.uuid().nullable().optional(),
  // optional: a project without a client gets the "Asignar cliente y origen" admin task
  client: ClientRef.nullable().optional(),
  // group_as_project, and groups mapped to their own project: groupId → client
  groupClients: z.record(z.string(), ClientRef).optional(),
  // board_as_project / item_as_project: groupId → what the group becomes
  groupTargets: z.record(z.string(), GroupTarget).default({}),
  // board_as_project
  projectCode: z.string().optional(),
  // board/group/item id → project name override
  projectNames: z.record(z.string(), z.string()).default({}),
  // group/item id → code (other strategies)
  projectCodes: z.record(z.string(), z.string()).default({}),
  columns: z.record(z.string(), ColumnTarget),
  subitemColumns: z.record(z.string(), ColumnTarget).default({}),
  // "checklist" is kept so older saved mappings still parse; task checklists are gone (#1046),
  // so it imports as "child_tasks".
  subitems: z.enum(["checklist", "child_tasks", "ignore"]).default("child_tasks"),
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
  areaId: removedField,
  taskAreaSource: removedField,
  taskAreas: removedField,
  statusMaps: removedField,
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

const MappingOptions = z.object({
  includeUpdates: z.boolean().default(true),
  includeFiles: z.boolean().default(true),
});

/** A monday status label's Cincel status and optional priority in the firm-wide map. */
export const StatusMapEntry = z.object({
  target: StatusTarget,
  priority: z.enum(["alta", "media", "baja"]).nullable().default(null),
});
export type StatusMapEntry = z.infer<typeof StatusMapEntry>;

/** The firm-wide monday status map (app_settings `monday.status_map`), keyed by `statusLabelKey(label)`. */
export const MondayStatusMap = z.record(z.string(), StatusMapEntry);
export type MondayStatusMap = Record<string /* statusLabelKey(label) */, StatusMapEntry>;

/** The key of a monday status label in the firm-wide map. Shared by the wizard, translate and the saved map. */
export function statusLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export const Mapping = z.object({
  version: z.literal(2),
  boards: z.array(BoardMapping),
  // monday user id → target
  people: z.record(z.string(), PersonTarget),
  options: MappingOptions,
  // Server-written snapshot of the saved firm-wide status map at apply time; the wizard edits the saved setting.
  statusMap: MondayStatusMap.default({}),
});
export type Mapping = z.infer<typeof Mapping>;
/** The shape accepted before defaults are applied (what `init` writes and the admin edits). */
export type MappingInput = z.input<typeof Mapping>;


// ---------------------------------------------------------------------------
// Mapping version 1 and its upgrade (BE §10 intro)
// ---------------------------------------------------------------------------

/** What a group became in mapping v1 (#687). */
export const GroupTargetV1 = z.discriminatedUnion("kind", [
  // A new project phase named after the group.
  z.object({ kind: z.literal("phase") }),
  // A phase of the board's workflow, by name.
  z.object({ kind: z.literal("workflow_phase"), phase: z.string().trim().min(1) }),
  // A workflow stage.
  z.object({ kind: z.literal("stage"), workflowId: z.uuid() }),
  z.object({ kind: z.literal("project") }),
  z.object({ kind: z.literal("ignore") }),
]);
export type GroupTargetV1 = z.infer<typeof GroupTargetV1>;

/** A board of mapping v1: the v2 board plus the fields v2 dropped (área, per-board status maps). */
export const BoardMappingV1 = BoardMapping.omit({
  areaId: true,
  taskAreaSource: true,
  taskAreas: true,
  statusMaps: true,
}).extend({
  groupTargets: z.record(z.string(), GroupTargetV1).default({}),
  areaId: z.uuid().nullable().optional(),
  // columnId → { labelId → target }
  statusMaps: z.record(z.string(), z.record(z.string(), StatusTarget)).default({}),
  // Dropped by the upgrade without reading them.
  taskAreaSource: z.unknown().optional(),
  taskAreas: z.unknown().optional(),
});
export type BoardMappingV1 = z.infer<typeof BoardMappingV1>;

export const MappingV1 = z.object({
  version: z.literal(1),
  boards: z.array(BoardMappingV1),
  people: z.record(z.string(), PersonTarget),
  options: MappingOptions,
});
export type MappingV1 = z.infer<typeof MappingV1>;

/** What the upgrade reads from the Cincel catalog and settings. */
export interface MappingUpgradeLookups {
  /** core.workflow_phases (live), by id. */
  phases: Record<string, { workflowId: string; name: string }>;
  /** The saved firm-wide status map (app_settings `monday.status_map`); its entries always win. */
  statusMap: MondayStatusMap;
}

/** The parts of a stored export the upgrade reads: each board's groups and column settings. */
export interface MappingUpgradeExport {
  boards: Array<{
    board: {
      id: string;
      groups: Array<{ id: string; title: string }>;
      columns: Array<{ id: string; settings: unknown }>;
      subitem_columns?: Array<{ id: string; settings: unknown }>;
    };
  }>;
}

/** Something the upgrade could not carry over as it was. */
export type MappingUpgradeNote =
  // A v1 status label id the stored export doesn't define (or whose column or board is gone): skipped.
  | { kind: "status_label_unknown"; boardId: string; columnId: string; labelId: string }
  // A label already mapped by an earlier board of the same file to a different target: the first one is kept.
  | {
      kind: "status_label_conflict";
      boardId: string;
      columnId: string;
      labelId: string;
      key: string;
      kept: StatusTarget;
      dropped: StatusTarget;
    }
  // A group whose old target has no v2 equivalent (no fase found and no board tramo): left to the default.
  | { kind: "group_target_dropped"; boardId: string; groupId: string; from: GroupTargetV1["kind"] };

export interface MappingUpgradeResult {
  /** The mapping as v2; `statusMap` is the merged firm-wide map. */
  mapping: Mapping;
  /** The saved map plus the v1 labels it didn't have yet. */
  statusMap: MondayStatusMap;
  notes: MappingUpgradeNote[];
}

/** Name comparison key: lower case, no accents, collapsed spaces (BE §3.3). */
function upgradeNameKey(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Label id → text of a status column, from `settings.labels` (array or id → text map). Mirrors `statusLabels`
 * in `translate.ts`, kept here so the schema imports nothing from the importer.
 */
function exportLabelTexts(settings: unknown): Map<string, string> {
  const labels = (settings as { labels?: unknown } | null | undefined)?.labels;
  const texts = new Map<string, string>();
  if (Array.isArray(labels)) {
    for (const l of labels) {
      const def = l as { id?: unknown; label?: unknown; name?: unknown };
      const text = typeof def.label === "string" ? def.label : typeof def.name === "string" ? def.name : null;
      if (def.id != null && text != null) texts.set(String(def.id), text);
    }
  } else if (labels && typeof labels === "object") {
    for (const [id, text] of Object.entries(labels as Record<string, unknown>)) {
      if (typeof text === "string") texts.set(id, text);
    }
  }
  return texts;
}

function sameStatusTarget(a: StatusTarget, b: StatusTarget): boolean {
  const keyOf = (t: StatusTarget) => ("customStatusId" in t ? `custom:${t.customStatusId}` : `status:${t.status}`);
  return keyOf(a) === keyOf(b);
}

/**
 * Converts a v1 mapping (stored drafts, uploaded files, `import_batches.mapping` of past batches) to v2
 * (BE §10 intro). A v2 mapping is parsed and returned as it is. Throws the zod error when `raw` is neither.
 *
 * Groups: `stage` → `tramo`; `workflow_phase` → the fase of that name in the board's tramo, else the board's
 * tramo; `phase` (a new project phase) → the fase named like the group in any tramo when exactly one matches,
 * else the board's tramo; `project` and `ignore` stay. `areaId`, `taskAreaSource` and `taskAreas` are dropped.
 *
 * Status: per-board `statusMaps` (column id → label id) are merged into the firm-wide map (keyed by
 * `statusLabelKey(label text)`) only for labels the saved map doesn't have yet; the label text comes from the
 * export's column settings, and a label id the export doesn't define is skipped and reported. Targets init
 * drafted without an equivalent (`defaulted`) are not carried over, so translate's defaults still apply.
 */
export function upgradeMappingV1(
  raw: unknown,
  lookups: MappingUpgradeLookups,
  exportData: MappingUpgradeExport,
): MappingUpgradeResult {
  const version = (raw as { version?: unknown } | null | undefined)?.version;
  if (version === 2) {
    const mapping = Mapping.parse(raw);
    return { mapping, statusMap: { ...lookups.statusMap }, notes: [] };
  }
  const v1 = MappingV1.parse(raw);
  const notes: MappingUpgradeNote[] = [];
  const exportBoards = new Map(exportData.boards.map((b) => [b.board.id, b.board]));

  const phases = Object.entries(lookups.phases).map(([id, p]) => ({ id, workflowId: p.workflowId, key: upgradeNameKey(p.name) }));
  const phaseIn = (name: string, workflowId: string | null | undefined): string | null => {
    if (!workflowId) return null;
    const key = upgradeNameKey(name);
    return phases.find((p) => p.workflowId === workflowId && p.key === key)?.id ?? null;
  };
  const uniquePhase = (name: string): string | null => {
    const key = upgradeNameKey(name);
    const found = phases.filter((p) => p.key === key);
    return found.length === 1 ? found[0].id : null;
  };

  // Merged firm-wide map: saved entries first; v1 labels only fill keys still missing.
  const statusMap: MondayStatusMap = { ...lookups.statusMap };
  const added = new Map<string, StatusTarget>();

  const boards: BoardMapping[] = v1.boards.map((board) => {
    const {
      areaId: _areaId,
      taskAreaSource: _taskAreaSource,
      taskAreas: _taskAreas,
      statusMaps,
      groupTargets: oldTargets,
      ...rest
    } = board;
    void _areaId;
    void _taskAreaSource;
    void _taskAreas;
    const exported = exportBoards.get(board.mondayBoardId);
    const groupTitles = new Map((exported?.groups ?? []).map((g) => [g.id, g.title]));
    const boardTramo = board.workflowId ?? null;

    const groupTargets: Record<string, GroupTarget> = {};
    for (const [groupId, target] of Object.entries(oldTargets)) {
      let next: GroupTarget | null = null;
      switch (target.kind) {
        case "stage":
          next = { kind: "tramo", workflowId: target.workflowId };
          break;
        case "workflow_phase": {
          const phaseId = phaseIn(target.phase, boardTramo);
          next = phaseId ? { kind: "phase", phaseId } : boardTramo ? { kind: "tramo", workflowId: boardTramo } : null;
          break;
        }
        case "phase": {
          const title = groupTitles.get(groupId);
          const phaseId = title == null ? null : uniquePhase(title);
          next = phaseId ? { kind: "phase", phaseId } : boardTramo ? { kind: "tramo", workflowId: boardTramo } : null;
          break;
        }
        case "project":
          next = { kind: "project" };
          break;
        case "ignore":
          next = { kind: "ignore" };
          break;
      }
      if (next) groupTargets[groupId] = next;
      else notes.push({ kind: "group_target_dropped", boardId: board.mondayBoardId, groupId, from: target.kind });
    }

    const columnSettings = new Map<string, unknown>();
    for (const c of [...(exported?.columns ?? []), ...(exported?.subitem_columns ?? [])]) {
      if (!columnSettings.has(c.id)) columnSettings.set(c.id, c.settings);
    }
    for (const [columnId, labels] of Object.entries(statusMaps)) {
      const texts = columnSettings.has(columnId) ? exportLabelTexts(columnSettings.get(columnId)) : new Map<string, string>();
      for (const [labelId, target] of Object.entries(labels)) {
        const text = texts.get(labelId);
        if (text == null) {
          notes.push({ kind: "status_label_unknown", boardId: board.mondayBoardId, columnId, labelId });
          continue;
        }
        if ("status" in target && target.defaulted) continue;
        const key = statusLabelKey(text);
        if (key in lookups.statusMap) continue;
        const kept = added.get(key);
        if (kept) {
          if (!sameStatusTarget(kept, target)) {
            notes.push({
              kind: "status_label_conflict",
              boardId: board.mondayBoardId,
              columnId,
              labelId,
              key,
              kept,
              dropped: target,
            });
          }
          continue;
        }
        const clean: StatusTarget = "status" in target ? { status: target.status } : { customStatusId: target.customStatusId };
        added.set(key, clean);
        statusMap[key] = { target: clean, priority: null };
      }
    }

    return BoardMapping.parse({ ...rest, groupTargets });
  });

  const mapping = Mapping.parse({
    version: 2,
    boards,
    people: v1.people,
    options: v1.options,
    statusMap,
  });
  return { mapping, statusMap, notes };
}
