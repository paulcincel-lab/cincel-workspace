/**
 * Pure translation step: (export, mapping, Cincel lookups) → planned Cincel
 * rows (docs/specs/monday-migration/backend.md §5.1, §5.2, §7, §0.4).
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
 * notes, dependencies, workflow kind and project rollups; subitems (checklist
 * or child tasks), updates → comments, files → planned uploads,
 * `import_refs.data` and cronograma rows (BE §5.2, §6.1).
 */
import type { BoardFile, ColumnDef, FileIndex, UpdateLine } from "./export";
import type {
  BoardMapping,
  ClientRef,
  ColumnTarget,
  Mapping,
  StatusTarget,
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
  /** core.workflow_task_templates, by id. */
  templates: Record<string, { workflowId: string }>;
  /** core.staff, by id. */
  staff: Record<string, { name: string }>;
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
  /** null when unresolved (CLIENT_UNRESOLVED). */
  client: RowRef | null;
  status: ProjectStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  source: RowSource;
  data: ImportRefData;
}

export interface UnmatchedPerson {
  id: string;
  name: string | null;
}

export interface PlannedTask {
  entity: "task";
  /** The monday item (or subitem) id. */
  externalId: string;
  project: RowRef & { kind: "planned"; entity: "project" };
  /** Set for child tasks; null for top-level tasks. */
  parentTask: RowRef | null;
  kind: "workflow" | "usuario";
  templateId: string | null;
  workflowId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  customStatusId: string | null;
  priority: TaskPriority;
  managerId: string | null;
  /** Group title on `board_as_project` boards. */
  phase: string | null;
  /** Cronograma section: the group title, ordered by `seccionOrder`. */
  seccion: string | null;
  seccionOrder: number | null;
  /** 1..n in export order within the group (or parent). */
  sortOrder: number;
  commitmentDate: string | null;
  deliveryDate: string | null;
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
  | "STATUS_UNMAPPED"
  | "TEMPLATE_INVALID"
  | "PERSON_UNMATCHED"
  | "RELATION_MISSING"
  | "DATES_MISSING"
  | "FILE_MISSING";

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
  for (const project of out.projects) rollUpProject(project, out.tasks);
  translateUpdates(ctx, exported);
  translateFiles(ctx, exported, data.files ?? {});
  translateSchedules(ctx);
  return out;
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
 * The client of a project. `relation_column` reads the given items' linked
 * ids (the first one that is a `cliente` contact of a crm_contacts board).
 */
function resolveClient(
  ctx: Ctx,
  bm: BoardMapping,
  ref: ClientRef | null | undefined,
  items: readonly ItemLike[],
  label: string,
  itemId?: string,
): RowRef | null {
  if (ref?.kind === "contact") return { kind: "existing", id: ref.contactId };
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
    return { kind: "planned", entity: "contact", externalId: key };
  }
  if (ref?.kind === "relation_column") {
    for (const item of items) {
      const value = valueOf(item, ref.columnId);
      const linked =
        value?.__typename === "BoardRelationValue" ? value.linked_item_ids : [];
      for (const id of linked) {
        const contact = contactForItem(ctx, id);
        if (contact?.type === "cliente") return contact.ref;
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
  }
  issue(
    ctx,
    "CLIENT_UNRESOLVED",
    bm.mondayBoardId,
    itemId,
    `Project "${label}" has no client`,
  );
  return null;
}

// --- projects --------------------------------------------------------------

function newProject(
  externalId: string,
  name: string,
  code: string | null | undefined,
  client: RowRef | null,
  source: RowSource,
  columns: ImportColumns = {},
): PlannedProject {
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
    source,
    data: { source, columns },
  };
}

function translateBoardAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const items = activeItems(eb.items);
  const name = bm.projectNames[board.id] ?? board.name;
  const client = resolveClient(ctx, bm, bm.client, items, name);
  const project = newProject(
    board.id,
    name,
    bm.projectCode,
    client,
    sourceOf(board, null),
  );
  ctx.out.projects.push(project);
  const ranks = groupRanks(board.groups);
  const orderInGroup = new Map<string, number>();
  for (const item of items) {
    const groupId = item.group?.id ?? null;
    const n = (orderInGroup.get(groupId ?? "") ?? 0) + 1;
    orderInGroup.set(groupId ?? "", n);
    const group = board.groups.find((g) => g.id === groupId);
    const task = addTask(ctx, bm, board, item, project, {
      columns: bm.columns,
      defs: board.columns,
      phase: group?.title ?? null,
      seccion: group?.title ?? null,
      seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
      sortOrder: n,
      groupId,
    });
    addSubitems(ctx, bm, board, item, task, project);
  }
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
    const name = bm.projectNames[group.id] ?? group.title;
    const client = resolveClient(
      ctx,
      bm,
      bm.groupClients?.[group.id] ?? bm.client,
      groupItems,
      name,
    );
    const project = newProject(
      `${board.id}:${group.id}`,
      name,
      bm.projectCodes[group.id],
      client,
      sourceOf(board, group.id),
    );
    ctx.out.projects.push(project);
    groupItems.forEach((item, i) => {
      const task = addTask(ctx, bm, board, item, project, {
        columns: bm.columns,
        defs: board.columns,
        phase: null,
        seccion: group.title,
        seccionOrder: ranks.get(group.id) ?? null,
        sortOrder: i + 1,
        groupId: group.id,
      });
      addSubitems(ctx, bm, board, item, task, project);
    });
  }
}

function translateItemAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const ranks = groupRanks(board.groups);
  for (const item of activeItems(eb.items)) {
    const groupId = item.group?.id ?? null;
    const name = bm.projectNames[item.id] ?? item.name;
    const client = resolveClient(ctx, bm, bm.client, [item], name, item.id);
    const source = sourceOf(board, groupId);
    const project = newProject(
      item.id,
      name,
      bm.projectCodes[item.id],
      client,
      source,
      importColumns(item, bm.columns, board.columns),
    );
    ctx.out.projects.push(project);
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
    const group = board.groups.find((g) => g.id === groupId);
    activeItems(item.subitems ?? []).forEach((sub, i) => {
      const task = addTask(ctx, bm, board, sub, project, {
        columns: bm.subitemColumns,
        defs: board.subitem_columns,
        phase: null,
        seccion: group?.title ?? null,
        seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
        sortOrder: i + 1,
        groupId,
      });
      addSubitems(ctx, bm, board, sub, task, project);
    });
  }
}

// --- tasks -----------------------------------------------------------------

interface TaskPlacement {
  columns: Record<string, ColumnTarget>;
  defs: readonly ColumnDef[];
  phase: string | null;
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
  const { columns, defs } = at;
  const first = (target: ColumnTarget) => columnsFor(columns, defs, target)[0];

  const { status, customStatusId } = taskStatus(
    ctx,
    bm,
    item,
    defs,
    first("status"),
  );
  const priorityValue = valueOf(item, first("priority"));
  const priority = priorityFromLabel(
    priorityValue?.__typename === "StatusValue"
      ? priorityValue.label
      : textOf(priorityValue),
  );

  const timeline = valueOf(item, first("timeline"));
  const tl = timeline?.__typename === "TimelineValue" ? timeline : null;
  const commitmentDate =
    dateOf(valueOf(item, first("commitment_date"))) ?? toDate(tl?.to);
  const deliveryDate = dateOf(valueOf(item, first("delivery_date")));

  const { kind, templateId, workflowId } = taskKind(ctx, bm, item);
  const people = taskPeople(ctx, bm, item, first("people"), project.client);

  const source = sourceOf(board, at.groupId);
  const start = toDate(tl?.from);
  const milestone = tl?.visualization_type === "milestone";
  const data: ImportRefData = {
    source,
    columns: importColumns(item, columns, defs, people.unmatched),
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
    kind,
    templateId,
    workflowId,
    title: item.name,
    notes: textOf(valueOf(item, first("notes"))),
    status,
    customStatusId,
    priority,
    managerId: people.managerId,
    phase: at.phase,
    seccion: at.seccion,
    seccionOrder: at.seccionOrder,
    sortOrder: at.sortOrder,
    commitmentDate,
    deliveryDate,
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

function taskStatus(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
  defs: readonly ColumnDef[],
  columnId: string | undefined,
): { status: TaskStatus; customStatusId: string | null } {
  const value = valueOf(item, columnId);
  if (!columnId || value?.__typename !== "StatusValue")
    return { status: "pendiente", customStatusId: null };
  const labelId = statusLabelId(
    defs.find((d) => d.id === columnId),
    value,
  );
  if (labelId == null) return { status: "pendiente", customStatusId: null };
  const target: StatusTarget | undefined = bm.statusMaps[columnId]?.[labelId];
  if (!target) {
    issue(
      ctx,
      "STATUS_UNMAPPED",
      bm.mondayBoardId,
      item.id,
      `Status label ${labelId} ("${value.label}") of column ${columnId} has no target`,
    );
    return { status: "pendiente", customStatusId: null };
  }
  if ("customStatusId" in target) {
    const custom = ctx.lookups.customStatuses[target.customStatusId];
    if (!custom) {
      issue(
        ctx,
        "STATUS_UNMAPPED",
        bm.mondayBoardId,
        item.id,
        `Custom status ${target.customStatusId} does not exist`,
      );
      return { status: "pendiente", customStatusId: null };
    }
    return {
      status: underlyingStatus(custom),
      customStatusId: target.customStatusId,
    };
  }
  return { status: target.status, customStatusId: null };
}

function taskKind(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
): {
  kind: "workflow" | "usuario";
  templateId: string | null;
  workflowId: string | null;
} {
  const templateId = bm.templateMatches[item.id];
  if (templateId) {
    const template = ctx.lookups.templates[templateId];
    if (template)
      return { kind: "workflow", templateId, workflowId: template.workflowId };
    issue(
      ctx,
      "TEMPLATE_INVALID",
      bm.mondayBoardId,
      item.id,
      `Template ${templateId} does not exist`,
    );
  }
  return {
    kind: "usuario",
    templateId: null,
    workflowId: bm.workflowId ?? null,
  };
}

/**
 * First staff-mapped person → manager, the other staff → support. Guests
 * mapped as contacts become contact people of the project's client; anyone
 * else is kept by name in the import data.
 */
function taskPeople(
  ctx: Ctx,
  bm: BoardMapping,
  item: ItemLike,
  columnId: string | undefined,
  client: RowRef | null,
): {
  managerId: string | null;
  support: { userId: string; staffId: string }[];
  unmatched: UnmatchedPerson[];
} {
  const value = valueOf(item, columnId);
  const persons =
    value?.__typename === "PeopleValue" ? (value.persons_and_teams ?? []) : [];
  let managerId: string | null = null;
  const support: { userId: string; staffId: string }[] = [];
  const unmatched: UnmatchedPerson[] = [];
  const seenStaff = new Set<string>();
  for (const p of persons) {
    if (p.kind !== "person") continue;
    const user = ctx.users.get(p.id);
    const target = ctx.mapping.people[p.id];
    if (target?.action === "staff" && ctx.lookups.staff[target.staffId]) {
      if (seenStaff.has(target.staffId)) continue;
      seenStaff.add(target.staffId);
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
  return { managerId, support, unmatched };
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
 * Subitems of a task's item (BE §5.2). `checklist`: checklist items in
 * depth-first order, deeper levels prefixed with their parents' names, and
 * their column values in the task's import data. `child_tasks`: tasks under
 * the item's task, every level flattened to that one child level with the
 * subitem names in `path`.
 */
function addSubitems(
  ctx: Ctx,
  bm: BoardMapping,
  board: BoardFile,
  item: ItemLike,
  parent: PlannedTask,
  project: PlannedProject,
) {
  if (bm.subitems === "ignore") return;
  const roots = activeItems(item.subitems ?? []);
  if (roots.length === 0) return;
  const columns = bm.subitemColumns;
  const defs = board.subitem_columns;
  const parentRef = taskRef(parent.externalId);
  let n = 0;

  if (bm.subitems === "checklist") {
    const statusColumn = columnsFor(columns, defs, "status")[0];
    const files = ctx.targets.get(parent.externalId)?.files ?? null;
    const subitems: NonNullable<ImportRefData["subitems"]> = {};
    const walk = (
      nodes: readonly (ItemLike | null)[],
      prefix: string | null,
    ) => {
      for (const sub of activeItems(nodes)) {
        const title = prefix ? `${prefix} › ${sub.name}` : sub.name;
        const { status } = taskStatus(ctx, bm, sub, defs, statusColumn);
        ctx.out.checklistItems.push({
          entity: "checklist_item",
          externalId: sub.id,
          task: parentRef,
          title,
          completed: status === "completado",
          sortOrder: ++n,
          source: parent.source,
        });
        subitems[sub.id] = {
          name: sub.name,
          columns: importColumns(sub, columns, defs),
        };
        ctx.targets.set(sub.id, {
          entity: "task",
          ref: parentRef,
          prefix: sub.name,
          files,
          source: parent.source,
        });
        walk(sub.subitems ?? [], title);
      }
    };
    walk(roots, null);
    parent.data.subitems = subitems;
    return;
  }

  const walk = (nodes: readonly (ItemLike | null)[], path: string[]) => {
    for (const sub of activeItems(nodes)) {
      const child = addTask(ctx, bm, board, sub, project, {
        columns,
        defs,
        phase: parent.phase,
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
 * Project progress, dates and status from its top-level tasks (BE §7, §0.4):
 * progress = % `completado`; dates = min/max of task dates; `completado` when
 * every top-level task is, else `activo` (also for a project with no tasks).
 */
export function rollUpProject(
  project: PlannedProject,
  tasks: readonly PlannedTask[],
): void {
  const own = tasks.filter((t) => t.project.externalId === project.externalId);
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
