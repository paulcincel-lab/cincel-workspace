/**
 * Pure translation step: (export, mapping, Cincel lookups) → planned Cincel
 * rows (docs/specs/monday-migration/backend.md §5.1, §5.2, §7, §0.4; project
 * flow docs/specs/project-flow/backend.md §10.3).
 *
 * No I/O: the caller reads the export folder and the Cincel lookups, then
 * hands them in. `plan` reports from the result and `apply` writes it, so the
 * translation rules live here only.
 *
 * Planned rows point at each other by import ref key (`entity` +
 * `externalId`, the same key `core.import_refs` stores) and at rows that
 * already exist in Cincel by id; `apply` turns keys into ids as it inserts.
 *
 * Covers contacts, projects, groups, tasks, status, priority, people, dates,
 * notes, dependencies, etapas, fases, espacios, admin tasks and project
 * rollups; subitems (checklist or child tasks), updates → comments, files →
 * planned uploads, `import_refs.data` and cronograma rows (BE §5.2, §6.1).
 */
import {
  ASSIGN_CLIENT_SYSTEM_KEY,
  ASSIGN_CLIENT_TASK_TITLE,
  FLOW_TIME_ZONE,
} from "../../lib/project-flow/catalog";
import { customStatusIndex, defaultStatusEntry } from "../../lib/monday-import/status-map";
import { stripMondayNumbering } from "../../lib/project-flow/names";
import type { BoardFile, ColumnDef, FileIndex, UpdateLine } from "./export";
import {
  groupPlacement,
  groupTargetCatalog,
  nameKey,
  resolveGroupTarget,
  type GroupTargetCatalog,
  type ResolvedGroupTarget,
} from "./group-targets";
import {
  statusLabelKey,
  type BoardMapping,
  type ClientRef,
  type ColumnTarget,
  type Mapping,
  type MondayStatusMap,
  type StatusMapEntry,
} from "./mapping.schema";
import type {
  ItemFieldsFragment,
  MondayColumnValue,
  MondayItem,
} from "./queries";
import { sanitizeMondayHtml } from "./sanitize";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** A users.json entry. */
export interface ExportUser {
  id: string;
  name: string;
  email: string;
  status?: string;
  kind?: string;
}

/** One exported board: board.json, items.ndjson in API order and updates.ndjson. */
export interface ExportBoard {
  board: BoardFile;
  items: MondayItem[];
  /** updates.ndjson; absent when the export ran with `--no-updates`. */
  updates?: UpdateLine[];
}

/** The parts of an export folder translate reads. */
export interface ExportData {
  users: ExportUser[];
  boards: ExportBoard[];
  /** files/index.json; absent when the export ran with `--no-files`. */
  files?: FileIndex;
}

/** What translate needs from the Cincel database, read by the caller. */
export interface CincelLookups {
  /** core.task_statuses (not deleted), by id. */
  customStatuses: Record<string, { name: string; closes: boolean }>;
  /**
   * Custom status ids by `nameKey(name)`, for the defaults table ("Cancelado", "En espera"). When absent the
   * names of `customStatuses` are used.
   */
  statuses?: Record<string, string>;
  /** core.workflow_phases (live), by id: the fases of each etapa. `active: false` fases are not matched. */
  phases: Record<string, { workflowId: string; name: string; key?: string | null; sortOrder: number; active?: boolean }>;
  /** core.workflow_task_templates (active), by id, with the fase each one belongs to. */
  templates: Record<string, { workflowId: string; phaseId?: string | null }>;
  /** core.staff, by id; `admin` marks access role "Administrador" (the only assignees of admin tasks). */
  staff: Record<string, { name: string; admin?: boolean }>;
  /** core.workflows (etapas, not deleted), by id: names for the Vista previa and `sortOrder` for the current etapa. */
  workflows?: Record<string, { name: string; sortOrder?: number }>;
  /** Titles of the active workflow_task_templates, by id: template matching by title within the task's etapa. */
  templateTitles?: Record<string, string>;
  /**
   * The saved firm-wide status map (app_settings `monday.status_map`). When absent the mapping's snapshot
   * (`Mapping.statusMap`) is used.
   */
  statusMap?: MondayStatusMap;
}

export interface TranslateOptions {
  /** The importing admin (`--by`): `created_by_id` of every task. */
  importedById: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type TaskStatus =
  "pendiente" | "en_proceso" | "completado" | "bloqueado";
export type TaskPriority = "alta" | "media" | "baja";
export type ProjectStatus = "activo" | "completado";
export type TaskKind = "workflow" | "usuario" | "admin";

/** A row this import creates (by import ref key) or one that already exists (by id). */
export type RowRef =
  | {
      kind: "planned";
      entity: "contact" | "project" | "task";
      externalId: string;
    }
  | { kind: "existing"; id: string };

/** Where a row came from (`import_refs.data.source`). */
export interface RowSource {
  boardId: string;
  boardName: string;
  groupId: string | null;
  groupTitle: string | null;
  /** Tasks: the monday item name before `stripMondayNumbering`. */
  originalTitle?: string;
}

/** Column values kept as import data, keyed by column title (`#<columnId>` on duplicates). */
export type ImportColumns = Record<string, string>;

/** `import_refs.data` of a created row (BE §5.2, §8). */
export interface ImportRefData {
  source: RowSource;
  columns: ImportColumns;
  /** Checklist-mode subitems of a task, by subitem id. */
  subitems?: Record<string, { name: string; columns: ImportColumns }>;
  /** Timeline `from`. */
  start?: string;
  milestone?: true;
  /** Child tasks flattened from deeper levels: subitem names from the first level down. */
  path?: string[];
  /** Projects: the workflow of a `project_stages` row the import wrote (rollback owns that row). */
  stageWorkflowId?: string;
  /** Projects: the etapas of the `project_stages` rows the import writes, one per etapa with tasks. */
  stageWorkflowIds?: string[];
}

export interface PlannedContact {
  entity: "contact";
  externalId: string;
  type: "cliente" | "socio" | "proveedor";
  kind: "empresa" | "particular";
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: RowSource | null;
  /** null for clients created from a `new` client ref. */
  data: ImportRefData | null;
}

export interface PlannedContactPerson {
  entity: "contact_person";
  /** `<mondayUserId>@<contact>`: one row per guest and client. */
  externalId: string;
  contact: RowRef;
  name: string;
  email: string | null;
}

export interface PlannedProviderProfile {
  entity: "provider_profile";
  externalId: string;
  contact: RowRef;
  subtype: string;
}

export interface PlannedProject {
  entity: "project";
  /** board id, `<boardId>:<groupId>` or item id, per strategy. */
  externalId: string;
  name: string;
  code: string | null;
  /** Optional: null without a client (CLIENT_MISSING, with the "Asignar cliente y origen" task) or unresolved. */
  client: RowRef | null;
  status: ProjectStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  /** "Etapa del tablero": the board's etapa; null when none. */
  workflowId: string | null;
  /** The distinct etapas of the project's tasks, by etapa `sortOrder`: one `project_stages` row each. */
  etapas: string[];
  /** `current_workflow_id`: the highest etapa with tasks, else the board's etapa. */
  currentWorkflowId: string | null;
  source: RowSource;
  data: ImportRefData;
}

export interface UnmatchedPerson {
  id: string;
  name: string | null;
}

export interface PlannedTask {
  entity: "task";
  /** The monday item (or subitem) id; `<projectExternalId>:assign_client` for the "Asignar cliente y origen" task. */
  externalId: string;
  project: RowRef & { kind: "planned"; entity: "project" };
  /** Set for child tasks; null for top-level tasks. */
  parentTask: RowRef | null;
  kind: TaskKind;
  /** `tasks.system_key`: "assign_client" for the task a project without a client gets; null otherwise. */
  systemKey: string | null;
  templateId: string | null;
  /** The task's etapa; null for admin tasks and when no etapa resolves. */
  workflowId: string | null;
  /** The task's fase; null when unresolved (`phaseReview`) and for admin tasks. */
  phaseId: string | null;
  /** No template, group fase or title matched a fase: "Sin fase · revisar" (PHASE_UNRESOLVED). */
  phaseReview: boolean;
  /** The project espacio (by name) of a group mapped to Espacio; apply calls `findOrCreateSpace`. */
  space: string | null;
  /** Import ref of that espacio (entity `project_space`): `<projectExternalId>:<groupId>`. */
  spaceExternalId: string | null;
  /** The item name without monday numbering (`stripMondayNumbering`). */
  title: string;
  notes: string | null;
  status: TaskStatus;
  customStatusId: string | null;
  priority: TaskPriority;
  managerId: string | null;
  /** Cronograma section: the group title, ordered by `seccionOrder`. */
  seccion: string | null;
  seccionOrder: number | null;
  /** 1..n in export order within the group (or parent). */
  sortOrder: number;
  commitmentDate: string | null;
  deliveryDate: string | null;
  /** `tasks.closed_at` (ISO): only for a task whose status closes it. */
  closedAt: string | null;
  /** Timeline `from` (import data and cronograma `inicio`). */
  start: string | null;
  milestone: boolean;
  createdAt: string | null;
  createdById: string;
  /** Assignees with no staff match; kept in the import data. */
  unmatchedPeople: UnmatchedPerson[];
  source: RowSource;
  data: ImportRefData;
}

export interface PlannedTaskSupport {
  entity: "task_support";
  /** `<itemId>:<mondayUserId>`. */
  externalId: string;
  task: RowRef;
  staffId: string;
}

export interface PlannedTaskDependency {
  entity: "task_dependency";
  /** `<itemId>:<dependsOnItemId>`. */
  externalId: string;
  task: RowRef;
  dependsOn: RowRef;
  kind: "finish_to_start";
}

/** A checklist-mode subitem (`task_checklist_items`). */
export interface PlannedChecklistItem {
  entity: "checklist_item";
  /** The monday subitem id. */
  externalId: string;
  task: RowRef;
  /** Deeper levels are prefixed with their parents' names ("Muros › Aplanado"). */
  title: string;
  completed: boolean;
  /** 1..n, depth-first within the task. */
  sortOrder: number;
  source: RowSource;
}

/** A monday update or reply (`history_events`, `kind = 'comentario'`). */
export interface PlannedHistoryEvent {
  entity: "history_event";
  /** The monday update (or reply) id. */
  externalId: string;
  target: { entity: "task" | "project" | "contact"; ref: RowRef };
  kind: "comentario";
  /** The mapped staff member, else the importing admin. */
  actorId: string;
  comment: string;
  /** monday `created_at`. */
  eventAt: string | null;
  source: RowSource;
}

/** A file to upload in phase B (`import_files`), then linked on its task or project. */
export interface PlannedImportFile {
  entity: "import_file";
  /** The monday asset id. */
  externalId: string;
  assetId: string;
  project: RowRef;
  /** null → a project link (`item_as_project` items). */
  task: RowRef | null;
  link: "task_link" | "project_link";
  /** Drive subfolder under "Importado de monday". */
  groupName: string | null;
  fileName: string;
  sizeBytes: number | null;
  sha256: string;
  /** Relative to the export folder. */
  localPath: string;
  source: RowSource;
}

/** One cronograma per project of a board with `schedule.enabled` (BE §6.1). */
export interface PlannedProjectSchedule {
  entity: "project_schedule";
  /** The project's external id. */
  externalId: string;
  project: RowRef;
  /** `monday:<boardId>`. */
  sourceFileName: string;
}

export type ScheduleStatus = "pending" | "progress" | "done";

/** A cronograma row (`schedule_tasks`, BE §6.1). */
export interface PlannedScheduleTask {
  entity: "schedule_task";
  /** The monday item id. */
  externalId: string;
  /** The project whose cronograma holds the row. */
  project: RowRef;
  task: RowRef;
  /** `monday:<itemId>`. */
  stableKey: string;
  planta: string;
  seccion: string;
  seccionOrder: number;
  tarea: string;
  inicio: string;
  fin: string;
  status: ScheduleStatus;
  responsable: string | null;
  sortOrder: number;
}

export type TranslateIssueCode =
  | "CLIENT_UNRESOLVED"
  | "CLIENT_MISSING"
  | "STATUS_UNMAPPED"
  | "STATUS_DEFAULTED"
  | "TEMPLATE_INVALID"
  | "PERSON_UNMATCHED"
  | "RELATION_MISSING"
  | "DATES_MISSING"
  | "FILE_MISSING"
  | "PHASE_UNRESOLVED"
  | "ADMIN_ASSIGNEE_CLEARED";

export interface TranslateIssue {
  code: TranslateIssueCode;
  boardId: string;
  itemId?: string;
  message: string;
}

export interface TranslateResult {
  contacts: PlannedContact[];
  contactPeople: PlannedContactPerson[];
  providerProfiles: PlannedProviderProfile[];
  projects: PlannedProject[];
  tasks: PlannedTask[];
  taskSupport: PlannedTaskSupport[];
  taskDependencies: PlannedTaskDependency[];
  checklistItems: PlannedChecklistItem[];
  historyEvents: PlannedHistoryEvent[];
  files: PlannedImportFile[];
  projectSchedules: PlannedProjectSchedule[];
  scheduleTasks: PlannedScheduleTask[];
  issues: TranslateIssue[];
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests and the rest of translate)
// ---------------------------------------------------------------------------

/** Default status for a label (BE §5.2), used by `init` and as documentation. */
export function defaultStatusForLabel(
  label: string,
  isDone: boolean,
): TaskStatus {
  if (isDone) return "completado";
  if (/stuck|bloquead|detenid/i.test(label)) return "bloqueado";
  if (/working|proceso|curso/i.test(label)) return "en_proceso";
  return "pendiente";
}

/** Priority from a priority-like status label (BE §5.2). */
export function priorityFromLabel(
  label: string | null | undefined,
): TaskPriority {
  if (!label) return "media";
  if (/alta|high|urgent/i.test(label)) return "alta";
  if (/baja|low/i.test(label)) return "baja";
  return "media";
}

/** `tasks.status` for a custom status; mirrors underlyingStatus() in the task-statuses repository. */
export function underlyingStatus(customStatus: {
  closes: boolean;
}): TaskStatus {
  return customStatus.closes ? "completado" : "en_proceso";
}

interface StatusLabelDef {
  id: string;
  label: string;
}

/** Label definitions of a status column, from `settings.labels` (array or id → text map). */
export function statusLabels(
  column: Pick<ColumnDef, "settings"> | undefined,
): StatusLabelDef[] {
  const settings = column?.settings as { labels?: unknown } | null | undefined;
  const labels = settings?.labels;
  if (Array.isArray(labels)) {
    return labels.flatMap((l) => {
      const def = l as { id?: unknown; label?: unknown; name?: unknown };
      const text =
        typeof def.label === "string"
          ? def.label
          : typeof def.name === "string"
            ? def.name
            : null;
      return def.id == null || text == null
        ? []
        : [{ id: String(def.id), label: text }];
    });
  }
  if (labels && typeof labels === "object") {
    return Object.entries(labels as Record<string, unknown>).flatMap(
      ([id, text]) => (typeof text === "string" ? [{ id, label: text }] : []),
    );
  }
  return [];
}

/**
 * The stable label id of a status value. The label text is matched against
 * the column's label definitions first (texts are unique per column), so a
 * reordered label list never changes the result; the value's own `index` is
 * the fallback. null for an empty cell.
 */
export function statusLabelId(
  column: Pick<ColumnDef, "settings"> | undefined,
  value: { label: string | null; index: number | null } | undefined,
): string | null {
  if (!value || value.label == null || value.label === "") return null;
  const def = statusLabels(column).find((l) => l.label === value.label);
  if (def) return def.id;
  return value.index == null ? null : String(value.index);
}

/** Groups by `position` (decimal), dense-ranked 1..n: groupId → rank. */
export function groupRanks(groups: BoardFile["groups"]): Map<string, number> {
  const positions = [
    ...new Set(groups.map((g) => Number.parseFloat(g.position))),
  ]
    .map((p) => (Number.isNaN(p) ? Number.POSITIVE_INFINITY : p))
    .sort((a, b) => a - b);
  const rankOf = new Map<number, number>();
  for (const p of positions) if (!rankOf.has(p)) rankOf.set(p, rankOf.size + 1);
  const ranks = new Map<string, number>();
  for (const g of groups) {
    const p = Number.parseFloat(g.position);
    ranks.set(
      g.id,
      rankOf.get(Number.isNaN(p) ? Number.POSITIVE_INFINITY : p)!,
    );
  }
  return ranks;
}

/** `YYYY-MM-DD` from a monday date/timestamp string; null when not a date. */
export function toDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : null;
}

/**
 * Import data key per column id: the column title, with `#<columnId>`
 * appended to every later column that repeats a title already seen in
 * board column order (BE §5.2).
 */
export function columnKeys(defs: readonly ColumnDef[]): Map<string, string> {
  const seen = new Set<string>();
  const keys = new Map<string, string>();
  for (const d of defs) {
    keys.set(d.id, seen.has(d.title) ? `${d.title}#${d.id}` : d.title);
    seen.add(d.title);
  }
  return keys;
}

/** Cronograma status from a task status (BE §6.1). */
export function scheduleStatus(status: TaskStatus): ScheduleStatus {
  if (status === "completado") return "done";
  if (status === "en_proceso") return "progress";
  return "pending";
}

/** Milliseconds `timeZone` is ahead of UTC at instant `at`. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return local - (at - (((at % 1000) + 1000) % 1000));
}

/**
 * The last millisecond of day `YYYY-MM-DD` in `timeZone`, as an ISO instant: a `closed_date` column value
 * becomes the task's `closed_at` (BE §10.3). "2026-03-10" in America/Mexico_City → "2026-03-11T05:59:59.999Z".
 */
export function endOfDayIn(date: string, timeZone: string = FLOW_TIME_ZONE): string {
  const guess = Date.parse(`${date}T23:59:59.999Z`);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // A second pass settles days whose offset changes (daylight saving) between the guess and the answer.
  return new Date(guess - zoneOffsetMs(first, timeZone)).toISOString();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The fase of a etapa whose name the task title contains as a whole word, compared by `nameKey` (BE §10.3 rule
 * 3): the longest name wins, ties go to the lower `sortOrder`. Inactive fases don't match. null when none does.
 */
export function phaseFromTitle(
  title: string,
  workflowId: string,
  phases: CincelLookups["phases"],
): string | null {
  const key = nameKey(title);
  if (!key) return null;
  let best: { id: string; length: number; sortOrder: number } | null = null;
  for (const [id, phase] of Object.entries(phases)) {
    if (phase.workflowId !== workflowId || phase.active === false) continue;
    const name = nameKey(phase.name);
    if (!name) continue;
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, "u");
    if (!word.test(key)) continue;
    if (
      !best ||
      name.length > best.length ||
      (name.length === best.length && phase.sortOrder < best.sortOrder)
    ) {
      best = { id, length: name.length, sortOrder: phase.sortOrder };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

type ItemLike = ItemFieldsFragment & {
  subitems?: readonly (ItemLike | null)[] | null;
};

/** Where an item's updates and files land. */
interface ItemTarget {
  entity: "task" | "project" | "contact";
  ref: RowRef;
  /** `[{subitem name}]` prefix for checklist-mode subitems. */
  prefix: string | null;
  /** null: files have nowhere to go (contacts). */
  files: {
    project: RowRef;
    task: RowRef | null;
    groupName: string | null;
  } | null;
  source: RowSource;
}

/** Timeline and planta of a task, for its cronograma row. */
interface ScheduleCandidate {
  inicio: string | null;
  fin: string | null;
  planta: string;
}

interface Ctx {
  mapping: Mapping;
  lookups: CincelLookups;
  options: TranslateOptions;
  users: Map<string, ExportUser>;
  /** monday item id → the board it lives on (for relation and dependency lookups). */
  itemBoard: Map<string, BoardMapping>;
  out: TranslateResult;
  contactKeys: Set<string>;
  contactPersonKeys: Set<string>;
  /** monday item or subitem id → where its updates and files go. */
  targets: Map<string, ItemTarget>;
  /** task external id → cronograma inputs (boards with `schedule.enabled`). */
  schedule: Map<string, ScheduleCandidate>;
  /** project external id → templates its tasks use, so a matched template is used once per project. */
  usedTemplates: Map<string, Set<string>>;
  /** Etapas and fases for the group targets. */
  catalog: GroupTargetCatalog;
  /** The firm-wide status map: the saved setting, else the mapping's snapshot. */
  statusMap: MondayStatusMap;
  /** Custom status ids by name (`customStatusIndex`), for the defaults table. */
  customStatusByName: Map<string, string>;
  /** `<boardId>|<statusLabelKey>` of the labels reported as STATUS_DEFAULTED already. */
  defaultedLabels: Set<string>;
}

/** Translates an export with a validated mapping into planned rows. Pure. */
export function translate(
  data: ExportData,
  mapping: Mapping,
  lookups: CincelLookups,
  options: TranslateOptions,
): TranslateResult {
  const out: TranslateResult = {
    contacts: [],
    contactPeople: [],
    providerProfiles: [],
    projects: [],
    tasks: [],
    taskSupport: [],
    taskDependencies: [],
    checklistItems: [],
    historyEvents: [],
    files: [],
    projectSchedules: [],
    scheduleTasks: [],
    issues: [],
  };
  const exported = new Map(data.boards.map((b) => [b.board.id, b]));
  const itemBoard = new Map<string, BoardMapping>();
  for (const bm of mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (eb) for (const item of eb.items) itemBoard.set(item.id, bm);
  }
  const ctx: Ctx = {
    mapping,
    lookups,
    options,
    users: new Map(data.users.map((u) => [u.id, u])),
    itemBoard,
    out,
    contactKeys: new Set(),
    contactPersonKeys: new Set(),
    targets: new Map(),
    schedule: new Map(),
    usedTemplates: new Map(),
    catalog: groupTargetCatalog(lookups.workflows ?? {}, lookups.phases),
    statusMap: lookups.statusMap ?? mapping.statusMap ?? {},
    customStatusByName: customStatusesByName(lookups),
    defaultedLabels: new Set(),
  };

  // Contacts first: projects may point at them through a relation column.
  for (const bm of mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (eb && bm.strategy === "crm_contacts") translateContacts(ctx, bm, eb);
  }
  for (const bm of mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (!eb) continue;
    if (bm.strategy === "board_as_project")
      translateBoardAsProject(ctx, bm, eb);
    else if (bm.strategy === "group_as_project")
      translateGroupAsProject(ctx, bm, eb);
    else if (bm.strategy === "item_as_project")
      translateItemAsProject(ctx, bm, eb);
  }
  translateDependencies(ctx, exported);
  for (const project of out.projects) {
    rollUpProject(project, out.tasks);
    projectEtapas(project, out.tasks, lookups.workflows ?? {});
  }
  translateUpdates(ctx, exported);
  translateFiles(ctx, exported, data.files ?? {});
  translateSchedules(ctx);
  return out;
}

/** Custom status ids by name, for the defaults table: the lookups' own index, else the names of `customStatuses`. */
function customStatusesByName(lookups: CincelLookups): Map<string, string> {
  if (lookups.statuses) return customStatusIndex(new Map(Object.entries(lookups.statuses)));
  return customStatusIndex(
    Object.entries(lookups.customStatuses).map(([id, status]) => ({ id, name: status.name })),
  );
}

function activeItems<T extends { state: string | null }>(
  items: readonly (T | null)[],
): T[] {
  return items.filter(
    (i): i is T => i != null && (i.state == null || i.state === "active"),
  );
}

function sourceOf(board: BoardFile, groupId: string | null): RowSource {
  const group = groupId
    ? board.groups.find((g) => g.id === groupId)
    : undefined;
  return {
    boardId: board.id,
    boardName: board.name,
    groupId: groupId ?? null,
    groupTitle: group?.title ?? null,
  };
}

/** Column ids mapped to `target`, in the board's column order. */
function columnsFor(
  columns: Record<string, ColumnTarget>,
  defs: readonly ColumnDef[],
  target: ColumnTarget,
): string[] {
  const ordered = defs.map((d) => d.id).filter((id) => columns[id] === target);
  const extra = Object.keys(columns).filter(
    (id) => columns[id] === target && !ordered.includes(id),
  );
  return [...ordered, ...extra];
}

function valueOf(
  item: ItemLike,
  columnId: string | undefined,
): MondayColumnValue | undefined {
  return columnId
    ? item.column_values.find((v) => v.id === columnId)
    : undefined;
}

function textOf(value: MondayColumnValue | undefined): string | null {
  const text = value?.text?.trim();
  return text ? text : null;
}

/** Display text of a value: its text, else a mirror/relation display value. */
function displayOf(value: MondayColumnValue | undefined): string | null {
  const text = textOf(value);
  if (text != null || !value) return text;
  if (
    value.__typename === "MirrorValue" ||
    value.__typename === "BoardRelationValue"
  ) {
    return value.display_value?.trim() || null;
  }
  return null;
}

/**
 * The item's `import_data` columns keyed per `columnKeys`; unmatched
 * assignees are kept by name under the people column's key.
 */
function importColumns(
  item: ItemLike,
  columns: Record<string, ColumnTarget>,
  defs: readonly ColumnDef[],
  unmatched: readonly UnmatchedPerson[] = [],
): ImportColumns {
  const keys = columnKeys(defs);
  const out: ImportColumns = {};
  for (const id of columnsFor(columns, defs, "import_data")) {
    const text = displayOf(valueOf(item, id));
    if (text != null) out[keys.get(id) ?? id] = text;
  }
  const people = columnsFor(columns, defs, "people")[0];
  if (people && unmatched.length > 0) {
    out[keys.get(people) ?? people] = unmatched
      .map((p) => p.name ?? `monday ${p.id}`)
      .join(", ");
  }
  return out;
}

function taskRef(externalId: string): RowRef {
  return { kind: "planned", entity: "task", externalId };
}

function dateOf(value: MondayColumnValue | undefined): string | null {
  if (!value) return null;
  if (value.__typename === "DateValue")
    return toDate(value.date) ?? toDate(value.text);
  if (value.__typename === "TimelineValue") return toDate(value.to);
  return toDate(value.text);
}

function issue(
  ctx: Ctx,
  code: TranslateIssueCode,
  boardId: string,
  itemId: string | undefined,
  message: string,
) {
  ctx.out.issues.push(
    itemId ? { code, boardId, itemId, message } : { code, boardId, message },
  );
}

// --- contacts --------------------------------------------------------------

function translateContacts(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const type = bm.contactType ?? "cliente";
  const defs = eb.board.columns;
  const email = columnsFor(bm.columns, defs, "contact_email")[0];
  const phone = columnsFor(bm.columns, defs, "contact_phone")[0];
  const notes = columnsFor(bm.columns, defs, "notes")[0];
  for (const item of activeItems(eb.items)) {
    const source = sourceOf(eb.board, item.group?.id ?? null);
    const existing = bm.contactMatches[item.id];
    ctx.targets.set(item.id, {
      entity: "contact",
      ref: existing
        ? { kind: "existing", id: existing }
        : { kind: "planned", entity: "contact", externalId: item.id },
      prefix: null,
      files: null,
      source,
    });
    if (existing) continue; // reuse the existing contact
    const emailValue = valueOf(item, email);
    const phoneValue = valueOf(item, phone);
    ctx.out.contacts.push({
      entity: "contact",
      externalId: item.id,
      type,
      kind: "empresa",
      name: item.name,
      email:
        (emailValue?.__typename === "EmailValue"
          ? emailValue.email?.trim() || null
          : null) ?? textOf(emailValue),
      phone:
        (phoneValue?.__typename === "PhoneValue"
          ? phoneValue.phone?.trim() || null
          : null) ?? textOf(phoneValue),
      notes: textOf(valueOf(item, notes)),
      source,
      data: { source, columns: importColumns(item, bm.columns, defs) },
    });
    if (type === "proveedor" && bm.providerSubtype) {
      ctx.out.providerProfiles.push({
        entity: "provider_profile",
        externalId: item.id,
        contact: { kind: "planned", entity: "contact", externalId: item.id },
        subtype: bm.providerSubtype,
      });
    }
  }
}

/** The contact a monday item id resolves to, when it lives on a crm_contacts board. */
function contactForItem(
  ctx: Ctx,
  itemId: string,
): { ref: RowRef; type: string } | null {
  const bm = ctx.itemBoard.get(itemId);
  if (!bm || bm.strategy !== "crm_contacts") return null;
  const type = bm.contactType ?? "cliente";
  const existing = bm.contactMatches[itemId];
  if (existing) return { ref: { kind: "existing", id: existing }, type };
  return {
    ref: { kind: "planned", entity: "contact", externalId: itemId },
    type,
  };
}

/**
 * The client of a project, optional (brief §4.4). `relation_column` reads the given items' linked ids (the first
 * one that is a `cliente` contact of a crm_contacts board). `missing`: no client was chosen, or the relation cell
 * is empty (the project gets the "Asignar cliente y origen" task); `unresolved`: the chosen client didn't resolve
 * (CLIENT_UNRESOLVED, blocking).
 */
function resolveClient(
  ctx: Ctx,
  bm: BoardMapping,
  ref: ClientRef | null | undefined,
  items: readonly ItemLike[],
  label: string,
  itemId?: string,
): { client: RowRef | null; missing: boolean } {
  if (ref?.kind === "contact") return { client: { kind: "existing", id: ref.contactId }, missing: false };
  if (ref?.kind === "new") {
    const key = `new:${ref.name.trim().toLowerCase()}`;
    if (!ctx.contactKeys.has(key)) {
      ctx.contactKeys.add(key);
      ctx.out.contacts.push({
        entity: "contact",
        externalId: key,
        type: "cliente",
        kind: ref.contactKind,
        name: ref.name.trim(),
        email: null,
        phone: null,
        notes: null,
        source: null,
        data: null,
      });
    }
    return { client: { kind: "planned", entity: "contact", externalId: key }, missing: false };
  }
  if (ref?.kind === "relation_column") {
    let linkedAny = false;
    for (const item of items) {
      const value = valueOf(item, ref.columnId);
      const linked =
        value?.__typename === "BoardRelationValue" ? value.linked_item_ids : [];
      for (const id of linked) {
        linkedAny = true;
        const contact = contactForItem(ctx, id);
        if (contact?.type === "cliente") return { client: contact.ref, missing: false };
        if (!contact) {
          issue(
            ctx,
            "RELATION_MISSING",
            bm.mondayBoardId,
            item.id,
            `Linked item ${id} is not a contact in the export`,
          );
        }
      }
    }
    if (linkedAny) {
      issue(
        ctx,
        "CLIENT_UNRESOLVED",
        bm.mondayBoardId,
        itemId,
        `Project "${label}": its linked client is not a cliente contact`,
      );
      return { client: null, missing: false };
    }
  }
  return { client: null, missing: true };
}

// --- projects --------------------------------------------------------------

/**
 * Where a group's tasks go before the per-task rules (BE §10.3): the etapa (the group's, else the board's), the
 * group's fase, its espacio, or tareas de administración (no etapa, fase or espacio).
 */
interface Place {
  admin: boolean;
  workflowId: string | null;
  phaseId: string | null;
  space: string | null;
  spaceExternalId: string | null;
}

/** Tasks no group places: the board's etapa, the fase resolved per task. */
function boardPlace(bm: BoardMapping): Place {
  return { admin: false, workflowId: bm.workflowId ?? null, phaseId: null, space: null, spaceExternalId: null };
}

/** The place of a group's tasks in `project` from the group's target. */
function placeOf(
  ctx: Ctx,
  bm: BoardMapping,
  project: PlannedProject,
  target: ResolvedGroupTarget | null | undefined,
  group: BoardFile["groups"][number] | undefined,
): Place {
  const base = boardPlace(bm);
  if (!target || !group) return base;
  const placement = groupPlacement(target, group, ctx.catalog);
  if (placement.admin) return { ...base, admin: true, workflowId: null };
  if (placement.space) {
    return { ...base, space: placement.space, spaceExternalId: `${project.externalId}:${group.id}` };
  }
  if (placement.phaseId) {
    const workflowId =
      placement.workflowId ?? ctx.lookups.phases[placement.phaseId]?.workflowId ?? base.workflowId;
    return { ...base, workflowId, phaseId: placement.phaseId };
  }
  if (placement.workflowId) return { ...base, workflowId: placement.workflowId };
  return base;
}

function newProject(
  bm: BoardMapping,
  externalId: string,
  name: string,
  code: string | null | undefined,
  client: RowRef | null,
  source: RowSource,
  columns: ImportColumns = {},
): PlannedProject {
  const workflowId = bm.workflowId ?? null;
  return {
    entity: "project",
    externalId,
    name,
    code: code?.trim() || null,
    client,
    status: "activo",
    progress: 0,
    startDate: null,
    endDate: null,
    workflowId,
    etapas: [],
    currentWorkflowId: workflowId,
    source,
    data: { source, columns },
  };
}

/**
 * Adds a project. Without a client (brief §4.4) it is reported once as CLIENT_MISSING and gets the admin task
 * "Asignar cliente y origen" (ref `task` `<projectExternalId>:assign_client`).
 */
function addProject(
  ctx: Ctx,
  bm: BoardMapping,
  project: PlannedProject,
  missingClient: boolean,
  itemId?: string,
) {
  ctx.out.projects.push(project);
  if (!missingClient) return;
  issue(
    ctx,
    "CLIENT_MISSING",
    bm.mondayBoardId,
    itemId,
    `Project "${project.name}" has no client; it gets the task "${ASSIGN_CLIENT_TASK_TITLE}"`,
  );
  ctx.out.tasks.push(assignClientTask(ctx, project));
}

/** The "Asignar cliente y origen" admin task: priority alta, no manager; apply sets its commitment date (today). */
function assignClientTask(ctx: Ctx, project: PlannedProject): PlannedTask {
  return {
    entity: "task",
    externalId: `${project.externalId}:${ASSIGN_CLIENT_SYSTEM_KEY}`,
    project: { kind: "planned", entity: "project", externalId: project.externalId },
    parentTask: null,
    kind: "admin",
    systemKey: ASSIGN_CLIENT_SYSTEM_KEY,
    templateId: null,
    workflowId: null,
    phaseId: null,
    phaseReview: false,
    space: null,
    spaceExternalId: null,
    title: ASSIGN_CLIENT_TASK_TITLE,
    notes: null,
    status: "pendiente",
    customStatusId: null,
    priority: "alta",
    managerId: null,
    seccion: null,
    seccionOrder: null,
    sortOrder: 1,
    commitmentDate: null,
    deliveryDate: null,
    closedAt: null,
    start: null,
    milestone: false,
    createdAt: null,
    createdById: ctx.options.importedById,
    unmatchedPeople: [],
    source: project.source,
    data: { source: project.source, columns: {} },
  };
}

function translateBoardAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const items = activeItems(eb.items);
  const ranks = groupRanks(board.groups);
  const groupsInOrder = [...board.groups].sort(
    (a, b) => ranks.get(a.id)! - ranks.get(b.id)!,
  );
  const targets = new Map(
    groupsInOrder.map((g) => [g.id, resolveGroupTarget(bm, g, ctx.catalog)]),
  );
  const kindOf = (groupId: string | null) => (groupId ? targets.get(groupId)?.kind : undefined);
  const inBoardProject = (groupId: string | null) =>
    kindOf(groupId) !== "project" && kindOf(groupId) !== "ignore";

  // Groups mapped to their own project ("Proyecto aparte"), as group_as_project makes them.
  const groupProjects = new Map<string, PlannedProject>();
  for (const group of groupsInOrder) {
    if (targets.get(group.id)?.kind !== "project") continue;
    const groupItems = items.filter((i) => i.group?.id === group.id);
    groupProjects.set(group.id, addGroupProject(ctx, bm, board, group, groupItems));
  }

  // The board's project, unless every group went elsewhere.
  let project: PlannedProject | null = null;
  const mapped = groupsInOrder.filter((g) => inBoardProject(g.id));
  const loose = items.some((i) => !targets.has(i.group?.id ?? ""));
  if (board.groups.length === 0 || mapped.length > 0 || loose) {
    const name = bm.projectNames[board.id] ?? board.name;
    const { client, missing } = resolveClient(
      ctx,
      bm,
      bm.client,
      items.filter((i) => inBoardProject(i.group?.id ?? null)),
      name,
    );
    project = newProject(bm, board.id, name, bm.projectCode, client, sourceOf(board, null));
    addProject(ctx, bm, project, missing);
  }

  const orderInGroup = new Map<string, number>();
  for (const item of items) {
    const groupId = item.group?.id ?? null;
    const target = groupId ? targets.get(groupId) : undefined;
    if (target?.kind === "ignore") continue;
    const owner = target?.kind === "project" ? groupProjects.get(groupId!)! : project;
    if (!owner) continue;
    const n = (orderInGroup.get(groupId ?? "") ?? 0) + 1;
    orderInGroup.set(groupId ?? "", n);
    const group = board.groups.find((g) => g.id === groupId);
    const place = target?.kind === "project" ? boardPlace(bm) : placeOf(ctx, bm, owner, target, group);
    const task = addTask(ctx, bm, board, item, owner, {
      columns: bm.columns,
      defs: board.columns,
      place,
      seccion: group?.title ?? null,
      seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
      sortOrder: n,
      groupId,
    });
    addSubitems(ctx, bm, board, item, task, owner, place);
  }
}

/** One group's project (`<boardId>:<groupId>`): its name, code and client, else the board's client. */
function addGroupProject(
  ctx: Ctx,
  bm: BoardMapping,
  board: BoardFile,
  group: BoardFile["groups"][number],
  groupItems: readonly ItemLike[],
): PlannedProject {
  const name = bm.projectNames[group.id] ?? group.title;
  const { client, missing } = resolveClient(
    ctx,
    bm,
    bm.groupClients?.[group.id] ?? bm.client,
    groupItems,
    name,
  );
  const project = newProject(
    bm,
    `${board.id}:${group.id}`,
    name,
    bm.projectCodes[group.id],
    client,
    sourceOf(board, group.id),
  );
  addProject(ctx, bm, project, missing);
  return project;
}

function translateGroupAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const items = activeItems(eb.items);
  const ranks = groupRanks(board.groups);
  const groups = [...board.groups].sort(
    (a, b) => ranks.get(a.id)! - ranks.get(b.id)!,
  );
  for (const group of groups) {
    const groupItems = items.filter((i) => i.group?.id === group.id);
    const project = addGroupProject(ctx, bm, board, group, groupItems);
    const place = boardPlace(bm);
    groupItems.forEach((item, i) => {
      const task = addTask(ctx, bm, board, item, project, {
        columns: bm.columns,
        defs: board.columns,
        place,
        seccion: group.title,
        seccionOrder: ranks.get(group.id) ?? null,
        sortOrder: i + 1,
        groupId: group.id,
      });
      addSubitems(ctx, bm, board, item, task, project, place);
    });
  }
}

function translateItemAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const ranks = groupRanks(board.groups);
  for (const item of activeItems(eb.items)) {
    const groupId = item.group?.id ?? null;
    const group = board.groups.find((g) => g.id === groupId);
    // What the item's group becomes for its subitem tasks; ignored groups import none of their items.
    const target = group ? resolveGroupTarget(bm, group, ctx.catalog) : null;
    if (target?.kind === "ignore") continue;
    const name = bm.projectNames[item.id] ?? item.name;
    const { client, missing } = resolveClient(ctx, bm, bm.client, [item], name, item.id);
    const source = sourceOf(board, groupId);
    const project = newProject(
      bm,
      item.id,
      name,
      bm.projectCodes[item.id],
      client,
      source,
      importColumns(item, bm.columns, board.columns),
    );
    addProject(ctx, bm, project, missing, item.id);
    const place = placeOf(ctx, bm, project, target, group);
    const projectRef: RowRef = {
      kind: "planned",
      entity: "project",
      externalId: project.externalId,
    };
    ctx.targets.set(item.id, {
      entity: "project",
      ref: projectRef,
      prefix: null,
      files: { project: projectRef, task: null, groupName: source.groupTitle },
      source,
    });
    activeItems(item.subitems ?? []).forEach((sub, i) => {
      const task = addTask(ctx, bm, board, sub, project, {
        columns: bm.subitemColumns,
        defs: board.subitem_columns,
        place,
        seccion: group?.title ?? null,
        seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
        sortOrder: i + 1,
        groupId,
      });
      addSubitems(ctx, bm, board, sub, task, project, place);
    });
  }
}

// --- tasks -----------------------------------------------------------------

interface TaskPlacement {
  columns: Record<string, ColumnTarget>;
  defs: readonly ColumnDef[];
  /** The group's place; child tasks take their parent's. */
  place: Place;
  seccion: string | null;
  seccionOrder: number | null;
  sortOrder: number;
  groupId: string | null;
}

function addTask(
  ctx: Ctx,
  bm: BoardMapping,
  board: BoardFile,
  item: ItemLike,
  project: PlannedProject,
  at: TaskPlacement,
): PlannedTask {
  const { columns, defs, place } = at;
  const first = (target: ColumnTarget) => columnsFor(columns, defs, target)[0];

  const resolved = taskStatus(ctx, bm, item, first("status"));
  const priorityValue = valueOf(item, first("priority"));
  const priority =
    resolved.priority ??
    priorityFromLabel(
      priorityValue?.__typename === "StatusValue"
        ? priorityValue.label
        : textOf(priorityValue),
    );

  // Timeline → commitment and delivery (each column wins over it) and start (brief §4.6).
  const timeline = valueOf(item, first("timeline"));
  const tl = timeline?.__typename === "TimelineValue" ? timeline : null;
  const commitmentDate =
    dateOf(valueOf(item, first("commitment_date"))) ?? toDate(tl?.to);
  const deliveryDate =
    dateOf(valueOf(item, first("delivery_date"))) ?? toDate(tl?.to);
  const closedAt = closedAtOf(item, first("closed_date"), resolved.status);

  const title = stripMondayNumbering(item.name);
  const flow = taskFlow(ctx, bm, item, title, project, place);
  const people = taskPeople(ctx, bm, item, first("people"), project.client, place.admin);

  const source = sourceOf(board, at.groupId);
  const start = toDate(tl?.from);
  const milestone = tl?.visualization_type === "milestone";
  const data: ImportRefData = {
    source: { ...source, originalTitle: item.name },
    columns: importColumns(item, columns, defs, [...people.unmatched, ...people.cleared]),
  };
  if (start) data.start = start;
  if (milestone) data.milestone = true;

  const task: PlannedTask = {
    entity: "task",
    externalId: item.id,
    project: {
      kind: "planned",
      entity: "project",
      externalId: project.externalId,
    },
    parentTask: null,
    kind: flow.kind,
    systemKey: null,
    templateId: flow.templateId,
    workflowId: flow.workflowId,
    phaseId: flow.phaseId,
    phaseReview: flow.phaseReview,
    space: place.admin ? null : place.space,
    spaceExternalId: place.admin ? null : place.spaceExternalId,
    title,
    notes: textOf(valueOf(item, first("notes"))),
    status: resolved.status,
    customStatusId: resolved.customStatusId,
    priority,
    managerId: people.managerId,
    seccion: at.seccion,
    seccionOrder: at.seccionOrder,
    sortOrder: at.sortOrder,
    commitmentDate,
    deliveryDate,
    closedAt,
    start,
    milestone,
    createdAt: item.created_at ?? null,
    createdById: ctx.options.importedById,
    unmatchedPeople: people.unmatched,
    source,
    data,
  };
  ctx.out.tasks.push(task);
  const ref = taskRef(item.id);
  ctx.targets.set(item.id, {
    entity: "task",
    ref,
    prefix: null,
    files: {
      project: task.project,
      task: ref,
      groupName: source.groupTitle,
    },
    source,
  });
  if (bm.schedule.enabled) {
    const planta =
      "fixed" in bm.schedule.planta
        ? bm.schedule.planta.fixed
        : (displayOf(valueOf(item, bm.schedule.planta.columnId)) ?? "General");
    ctx.schedule.set(item.id, {
      inicio: start,
      fin: toDate(tl?.to),
      planta,
    });
  }
  for (const s of people.support) {
    ctx.out.taskSupport.push({
      entity: "task_support",
      externalId: `${item.id}:${s.userId}`,
      task: { kind: "planned", entity: "task", externalId: item.id },
      staffId: s.staffId,
    });
  }
  return task;
}

/**
 * `closed_at` of a task whose status closes it (brief §4.6): the `closed_date` column's day, at its end in
 * America/Mexico_City; without a value, the item's `updated_at` from the export; null for open tasks.
 */
function closedAtOf(
  item: ItemLike,
  columnId: string | undefined,
  status: TaskStatus,
): string | null {
  if (status !== "completado") return null;
  const day = dateOf(valueOf(item, columnId));
  if (day) return endOfDayIn(day);
  return item.updated_at ?? null;
}

interface ResolvedStatus {
  status: TaskStatus;
  customStatusId: string | null;
  /** The status map entry's priority; null keeps the priority column. */
  priority: TaskPriority | null;
}

const NO_STATUS: ResolvedStatus = { status: "pendiente", customStatusId: null, priority: null };

/**
 * A task's status (brief §4.5): the label text → `statusLabelKey` → the firm-wide status map, else the built-in
 * defaults (`defaultStatusEntry`, the table init and the wizard prefill from; "Cancelado"/"En espera" resolve to
 * the seeded custom statuses by name), else pendiente with one STATUS_DEFAULTED per board and label. A saved entry
 * pointing at a custom status that no longer exists is STATUS_UNMAPPED (blocking).
 */
function taskStatus(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
  columnId: string | undefined,
): ResolvedStatus {
  const value = valueOf(item, columnId);
  if (!columnId || value?.__typename !== "StatusValue") return NO_STATUS;
  const label = value.label?.trim();
  if (!label) return NO_STATUS;
  const key = statusLabelKey(label);
  const saved: StatusMapEntry | undefined = ctx.statusMap[key];
  const entry =
    saved ??
    defaultStatusEntry({ name: label, isDone: value.is_done ?? false }, ctx.customStatusByName);
  if ("status" in entry.target && entry.target.defaulted) {
    const reported = `${bm.mondayBoardId}|${key}`;
    if (!ctx.defaultedLabels.has(reported)) {
      ctx.defaultedLabels.add(reported);
      issue(
        ctx,
        "STATUS_DEFAULTED",
        bm.mondayBoardId,
        undefined,
        `Status label "${label}" has no equivalent; its tasks import as pendiente`,
      );
    }
    return { ...NO_STATUS, priority: entry.priority };
  }
  const target = entry.target;
  if ("customStatusId" in target) {
    const custom = ctx.lookups.customStatuses[target.customStatusId];
    if (!custom) {
      issue(
        ctx,
        "STATUS_UNMAPPED",
        bm.mondayBoardId,
        item.id,
        `Status label "${label}" points at custom status ${target.customStatusId}, which does not exist`,
      );
      return NO_STATUS;
    }
    return {
      status: underlyingStatus(custom),
      customStatusId: target.customStatusId,
      priority: entry.priority,
    };
  }
  return { status: target.status, customStatusId: null, priority: entry.priority };
}

/**
 * The active template of `workflowId` titled like the task (same `nameKey`), not used yet in the project nor
 * picked by hand for another item of the board; null when there is none.
 */
function matchTemplate(
  ctx: Ctx,
  bm: BoardMapping,
  project: PlannedProject,
  workflowId: string,
  title: string,
): string | null {
  const titles = ctx.lookups.templateTitles;
  if (!titles) return null;
  const used = ctx.usedTemplates.get(project.externalId);
  const picked = new Set(Object.values(bm.templateMatches));
  const key = nameKey(title);
  for (const [id, templateTitle] of Object.entries(titles)) {
    if (ctx.lookups.templates[id]?.workflowId !== workflowId) continue;
    if (used?.has(id) || picked.has(id) || nameKey(templateTitle) !== key) continue;
    return id;
  }
  return null;
}

function applyTemplate(ctx: Ctx, project: PlannedProject, templateId: string) {
  let used = ctx.usedTemplates.get(project.externalId);
  if (!used) ctx.usedTemplates.set(project.externalId, (used = new Set()));
  used.add(templateId);
}

/** A task's kind, template, etapa and fase. */
interface TaskFlow {
  kind: TaskKind;
  templateId: string | null;
  workflowId: string | null;
  phaseId: string | null;
  phaseReview: boolean;
}

/**
 * Kind, etapa and fase of a task (brief §4.3). Admin groups: `admin`, no etapa, fase or template. Otherwise the
 * etapa is the group's (else the board's), and the fase comes from, in order: 1) the item's template of that
 * etapa (`templateMatches`, else the template titled like it), which makes it a workflow task; 2) the group's
 * fase; 3) a fase of the etapa the cleaned title names as a whole word (longest wins); 4) none: `phaseReview`
 * and PHASE_UNRESOLVED.
 */
function taskFlow(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
  title: string,
  project: PlannedProject,
  place: Place,
): TaskFlow {
  if (place.admin) {
    return { kind: "admin", templateId: null, workflowId: null, phaseId: null, phaseReview: false };
  }
  let workflowId = place.workflowId;
  let templateId: string | null = null;
  const picked = bm.templateMatches[item.id];
  if (picked) {
    const template = ctx.lookups.templates[picked];
    if (!template) {
      issue(
        ctx,
        "TEMPLATE_INVALID",
        bm.mondayBoardId,
        item.id,
        `Template ${picked} does not exist`,
      );
    } else if (!workflowId || template.workflowId === workflowId) {
      templateId = picked;
      workflowId = template.workflowId;
    }
  }
  if (!templateId && workflowId) templateId = matchTemplate(ctx, bm, project, workflowId, title);
  if (templateId) applyTemplate(ctx, project, templateId);

  const phaseId =
    (templateId ? (ctx.lookups.templates[templateId]?.phaseId ?? null) : null) ??
    place.phaseId ??
    (workflowId ? phaseFromTitle(title, workflowId, ctx.lookups.phases) : null);
  if (!phaseId) {
    issue(
      ctx,
      "PHASE_UNRESOLVED",
      bm.mondayBoardId,
      item.id,
      `"${title}" matches no fase; it imports without one for review`,
    );
  }
  return {
    kind: templateId ? "workflow" : "usuario",
    templateId,
    workflowId,
    phaseId,
    phaseReview: !phaseId,
  };
}

/**
 * First staff-mapped person → manager, the other staff → support. Guests
 * mapped as contacts become contact people of the project's client; anyone
 * else is kept by name in the import data. Admin tasks (`adminOnly`) keep
 * administrators only: the others are dropped, kept by name in the import
 * data, and reported once as ADMIN_ASSIGNEE_CLEARED.
 */
function taskPeople(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
  columnId: string | undefined,
  client: RowRef | null,
  adminOnly: boolean,
): {
  managerId: string | null;
  support: { userId: string; staffId: string }[];
  unmatched: UnmatchedPerson[];
  cleared: UnmatchedPerson[];
} {
  const value = valueOf(item, columnId);
  const persons =
    value?.__typename === "PeopleValue" ? (value.persons_and_teams ?? []) : [];
  let managerId: string | null = null;
  const support: { userId: string; staffId: string }[] = [];
  const unmatched: UnmatchedPerson[] = [];
  const cleared: UnmatchedPerson[] = [];
  const seenStaff = new Set<string>();
  for (const p of persons) {
    if (p.kind !== "person") continue;
    const user = ctx.users.get(p.id);
    const target = ctx.mapping.people[p.id];
    const staff = target?.action === "staff" ? ctx.lookups.staff[target.staffId] : undefined;
    if (target?.action === "staff" && staff) {
      if (seenStaff.has(target.staffId)) continue;
      seenStaff.add(target.staffId);
      if (adminOnly && !staff.admin) {
        cleared.push({ id: p.id, name: user?.name ?? staff.name });
        continue;
      }
      if (managerId == null) managerId = target.staffId;
      else support.push({ userId: p.id, staffId: target.staffId });
      continue;
    }
    if (target?.action === "ignore") continue;
    if (target?.action === "contact") {
      if (!target.contactId && client) addGuestContact(ctx, p.id, user, client);
      continue;
    }
    unmatched.push({ id: p.id, name: user?.name ?? null });
    issue(
      ctx,
      "PERSON_UNMATCHED",
      bm.mondayBoardId,
      item.id,
      `monday user ${p.id} (${user?.name ?? "?"}) has no staff match`,
    );
  }
  if (cleared.length > 0) {
    issue(
      ctx,
      "ADMIN_ASSIGNEE_CLEARED",
      bm.mondayBoardId,
      item.id,
      `Admin task: ${cleared.map((c) => c.name ?? `monday ${c.id}`).join(", ")} removed (not administrators)`,
    );
  }
  return { managerId, support, unmatched, cleared };
}

function refKey(ref: RowRef): string {
  return ref.kind === "existing" ? ref.id : `${ref.entity}:${ref.externalId}`;
}

function addGuestContact(
  ctx: Ctx,
  userId: string,
  user: ExportUser | undefined,
  client: RowRef,
) {
  const externalId = `${userId}@${refKey(client)}`;
  if (ctx.contactPersonKeys.has(externalId)) return;
  ctx.contactPersonKeys.add(externalId);
  ctx.out.contactPeople.push({
    entity: "contact_person",
    externalId,
    contact: client,
    name: user?.name?.trim() || user?.email || `monday ${userId}`,
    email: user?.email?.trim().toLowerCase() || null,
  });
}

// --- subitems --------------------------------------------------------------

/**
 * Subitems of a task's item (BE §5.2): tasks under the item's task, every
 * level flattened to that one child level with the subitem names in `path`.
 * `checklist` (older mappings) imports the same way: task checklists are
 * gone (#1046), so `checklistItems` stays empty.
 */
function addSubitems(
  ctx: Ctx,
  bm: BoardMapping,
  board: BoardFile,
  item: ItemLike,
  parent: PlannedTask,
  project: PlannedProject,
  /** The parent's group place: child tasks share it (admin, etapa, fase, espacio). */
  place: Place,
) {
  if (bm.subitems === "ignore") return;
  const roots = activeItems(item.subitems ?? []);
  if (roots.length === 0) return;
  const columns = bm.subitemColumns;
  const defs = board.subitem_columns;
  const parentRef = taskRef(parent.externalId);
  let n = 0;

  const walk = (nodes: readonly (ItemLike | null)[], path: string[]) => {
    for (const sub of activeItems(nodes)) {
      const child = addTask(ctx, bm, board, sub, project, {
        columns,
        defs,
        place,
        seccion: parent.seccion,
        seccionOrder: parent.seccionOrder,
        sortOrder: ++n,
        groupId: parent.source.groupId,
      });
      child.parentTask = parentRef;
      const childPath = [...path, sub.name];
      if (childPath.length > 1) child.data.path = childPath;
      walk(sub.subitems ?? [], childPath);
    }
  };
  walk(roots, []);
}

// --- updates ---------------------------------------------------------------

interface UpdateLike {
  id: string;
  body: string;
  text_body?: string | null;
  created_at: string | null;
  creator_id: string | null;
}

function eventTime(at: string | null): number {
  const t = at ? Date.parse(at) : Number.NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Updates and replies → comments on the item's task, project or contact,
 * oldest first (BE §5.2). The author is the mapped staff member, else the
 * importing admin with a `monday · {name}:` prefix; checklist-mode subitems
 * add `[{subitem name}]`.
 */
function translateUpdates(ctx: Ctx, exported: Map<string, ExportBoard>) {
  if (!ctx.mapping.options.includeUpdates) return;
  const seen = new Set<string>();
  const events: PlannedHistoryEvent[] = [];
  const add = (u: UpdateLike, target: ItemTarget) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    const text = sanitizeMondayHtml(u.body) || u.text_body?.trim() || "";
    if (text === "") return;
    const mapped = u.creator_id ? ctx.mapping.people[u.creator_id] : undefined;
    const staffId =
      mapped?.action === "staff" && ctx.lookups.staff[mapped.staffId]
        ? mapped.staffId
        : null;
    const parts: string[] = [];
    if (!staffId) {
      const name =
        (u.creator_id && ctx.users.get(u.creator_id)?.name?.trim()) ||
        (u.creator_id ? `usuario ${u.creator_id}` : "usuario desconocido");
      parts.push(`monday · ${name}:`);
    }
    if (target.prefix) parts.push(`[${target.prefix}]`);
    parts.push(text);
    events.push({
      entity: "history_event",
      externalId: u.id,
      target: { entity: target.entity, ref: target.ref },
      kind: "comentario",
      actorId: staffId ?? ctx.options.importedById,
      comment: parts.join(" "),
      eventAt: u.created_at ?? null,
      source: target.source,
    });
  };
  for (const bm of ctx.mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (!eb || bm.strategy === "skip") continue;
    for (const line of eb.updates ?? []) {
      const target = ctx.targets.get(line.item_id);
      if (!target) continue;
      add(line, target);
      for (const reply of line.replies ?? []) add(reply, target);
    }
  }
  events.sort(
    (a, b) =>
      eventTime(a.eventAt) - eventTime(b.eventAt) ||
      (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0),
  );
  ctx.out.historyEvents.push(...events);
}

// --- files -----------------------------------------------------------------

type AssetList =
  readonly ({ id: string; name: string } | null)[] | null | undefined;

/**
 * Files on items, subitems, updates and replies → planned uploads, linked
 * on the task (or the project for `item_as_project` items); checklist-mode
 * subitems' files go to the parent task (BE §5.2, §7). An asset missing from
 * files/index.json (failed download) is reported as FILE_MISSING.
 */
function translateFiles(
  ctx: Ctx,
  exported: Map<string, ExportBoard>,
  index: FileIndex,
) {
  if (!ctx.mapping.options.includeFiles) return;
  const seen = new Set<string>();
  const add = (assets: AssetList, itemId: string, boardId: string) => {
    const target = ctx.targets.get(itemId);
    if (!target?.files) return;
    for (const asset of assets ?? []) {
      if (!asset || seen.has(asset.id)) continue;
      seen.add(asset.id);
      const entry = index[asset.id];
      if (!entry) {
        issue(
          ctx,
          "FILE_MISSING",
          boardId,
          itemId,
          `File ${asset.id} ("${asset.name}") is not in files/index.json`,
        );
        continue;
      }
      ctx.out.files.push({
        entity: "import_file",
        externalId: asset.id,
        assetId: asset.id,
        project: target.files.project,
        task: target.files.task,
        link: target.files.task ? "task_link" : "project_link",
        groupName: target.files.groupName,
        fileName: entry.name || asset.name,
        sizeBytes: Number.isFinite(entry.size) ? entry.size : null,
        sha256: entry.sha256,
        localPath: entry.path,
        source: target.source,
      });
    }
  };
  for (const bm of ctx.mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (!eb || bm.strategy === "skip") continue;
    const walk = (nodes: readonly (ItemLike | null)[]) => {
      for (const node of nodes) {
        if (!node) continue;
        add(node.assets, node.id, bm.mondayBoardId);
        walk(node.subitems ?? []);
      }
    };
    walk(eb.items);
    for (const line of eb.updates ?? []) {
      add(line.assets, line.item_id, bm.mondayBoardId);
      for (const reply of line.replies ?? [])
        add(reply.assets, line.item_id, bm.mondayBoardId);
    }
  }
}

// --- cronograma ------------------------------------------------------------

/**
 * Cronograma rows for the top-level tasks of boards with `schedule.enabled`
 * (BE §6.1): one row per task with a full timeline, and one
 * `project_schedules` row per project that gets rows. A task without a
 * timeline is reported as DATES_MISSING (it stays a task).
 */
function translateSchedules(ctx: Ctx) {
  const scheduled = new Set<string>();
  for (const task of ctx.out.tasks) {
    if (task.parentTask) continue;
    const c = ctx.schedule.get(task.externalId);
    if (!c) continue;
    if (!c.inicio || !c.fin) {
      issue(
        ctx,
        "DATES_MISSING",
        task.source.boardId,
        task.externalId,
        `"${task.title}" has no timeline; left out of the cronograma`,
      );
      continue;
    }
    const projectId = task.project.externalId;
    if (!scheduled.has(projectId)) {
      scheduled.add(projectId);
      ctx.out.projectSchedules.push({
        entity: "project_schedule",
        externalId: projectId,
        project: task.project,
        sourceFileName: `monday:${task.source.boardId}`,
      });
    }
    ctx.out.scheduleTasks.push({
      entity: "schedule_task",
      externalId: task.externalId,
      project: task.project,
      task: taskRef(task.externalId),
      stableKey: `monday:${task.externalId}`,
      planta: c.planta,
      seccion: task.seccion ?? "General",
      seccionOrder: task.seccionOrder ?? 1,
      tarea: task.title,
      inicio: c.inicio,
      fin: c.fin,
      status: scheduleStatus(task.status),
      responsable: task.managerId
        ? (ctx.lookups.staff[task.managerId]?.name ?? null)
        : null,
      sortOrder: task.sortOrder,
    });
  }
}

// --- dependencies ----------------------------------------------------------

function translateDependencies(ctx: Ctx, exported: Map<string, ExportBoard>) {
  const taskIds = new Set(ctx.out.tasks.map((t) => t.externalId));
  const seen = new Set<string>();
  for (const bm of ctx.mapping.boards) {
    const eb = exported.get(bm.mondayBoardId);
    if (!eb) continue;
    const isSub = bm.strategy === "item_as_project";
    const columns = isSub ? bm.subitemColumns : bm.columns;
    const defs = isSub ? eb.board.subitem_columns : eb.board.columns;
    const depColumns = columnsFor(columns, defs, "dependencies");
    if (depColumns.length === 0) continue;
    const items: ItemLike[] = isSub
      ? activeItems(eb.items).flatMap((i) => activeItems(i.subitems ?? []))
      : activeItems(eb.items);
    for (const item of items) {
      if (!taskIds.has(item.id)) continue;
      for (const columnId of depColumns) {
        const value = valueOf(item, columnId);
        const linked =
          value?.__typename === "DependencyValue" ? value.linked_item_ids : [];
        for (const dependsOn of linked) {
          if (dependsOn === item.id) continue;
          if (!taskIds.has(dependsOn)) {
            issue(
              ctx,
              "RELATION_MISSING",
              bm.mondayBoardId,
              item.id,
              `Depended-on item ${dependsOn} is not a task in the export`,
            );
            continue;
          }
          const externalId = `${item.id}:${dependsOn}`;
          if (seen.has(externalId)) continue;
          seen.add(externalId);
          ctx.out.taskDependencies.push({
            entity: "task_dependency",
            externalId,
            task: { kind: "planned", entity: "task", externalId: item.id },
            dependsOn: {
              kind: "planned",
              entity: "task",
              externalId: dependsOn,
            },
            kind: "finish_to_start",
          });
        }
      }
    }
  }
}

// --- project rollups -------------------------------------------------------

/**
 * The project's etapas (BE §10.3): the distinct etapas of its tasks, by etapa `sortOrder` (unknown ones last,
 * first seen first). `currentWorkflowId` is the highest of them, else the board's etapa. Apply writes one
 * `project_stages` row per etapa; `data.stageWorkflowIds` lets rollback own them.
 */
export function projectEtapas(
  project: PlannedProject,
  tasks: readonly PlannedTask[],
  workflows: Readonly<Record<string, { sortOrder?: number }>>,
): void {
  const seen: string[] = [];
  for (const t of tasks) {
    if (t.project.externalId !== project.externalId || !t.workflowId) continue;
    if (!seen.includes(t.workflowId)) seen.push(t.workflowId);
  }
  const order = (id: string) => workflows[id]?.sortOrder ?? Number.POSITIVE_INFINITY;
  const etapas = seen
    .map((id, i) => ({ id, i }))
    .sort((a, b) => order(a.id) - order(b.id) || a.i - b.i)
    .map((t) => t.id);
  project.etapas = etapas;
  project.currentWorkflowId = etapas[etapas.length - 1] ?? project.workflowId;
  if (etapas.length > 0) project.data.stageWorkflowIds = etapas;
  else delete project.data.stageWorkflowIds;
}

/**
 * Project progress, dates and status from its top-level tasks (BE §7, §0.4):
 * progress = % `completado`; dates = min/max of task dates; `completado` when
 * every top-level task is, else `activo` (also for a project with no tasks).
 * The system "Asignar cliente y origen" task doesn't count.
 */
export function rollUpProject(
  project: PlannedProject,
  tasks: readonly PlannedTask[],
): void {
  const own = tasks.filter(
    (t) => t.project.externalId === project.externalId && t.systemKey == null,
  );
  const top = own.filter((t) => t.parentTask == null);
  const done = top.filter((t) => t.status === "completado").length;
  project.progress =
    top.length === 0 ? 0 : Math.round((done / top.length) * 100);
  project.status =
    top.length > 0 && done === top.length ? "completado" : "activo";
  const dates = own
    .flatMap((t) => [t.start, t.commitmentDate, t.deliveryDate])
    .filter((d): d is string => d != null)
    .sort();
  project.startDate = dates[0] ?? null;
  project.endDate = dates[dates.length - 1] ?? null;
}
