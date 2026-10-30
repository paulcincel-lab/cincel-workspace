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
 * This file covers contacts, projects, groups, tasks, status, priority,
 * people, dates, notes, dependencies, workflow kind and project rollups.
 * Subitems, updates, files, `import_refs.data` and cronograma rows build on it.
 */
import type { BoardFile, ColumnDef } from "./export";
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

/** One exported board: board.json plus items.ndjson in API order. */
export interface ExportBoard {
  board: BoardFile;
  items: MondayItem[];
}

/** The parts of an export folder translate reads. */
export interface ExportData {
  users: ExportUser[];
  boards: ExportBoard[];
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

export type TranslateIssueCode =
  | "CLIENT_UNRESOLVED"
  | "STATUS_UNMAPPED"
  | "TEMPLATE_INVALID"
  | "PERSON_UNMATCHED"
  | "RELATION_MISSING";

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

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

type ItemLike = ItemFieldsFragment & {
  subitems?: readonly (ItemLike | null)[] | null;
};

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
    if (bm.contactMatches[item.id]) continue; // reuse the existing contact
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
      source: sourceOf(eb.board, item.group?.id ?? null),
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
    addTask(ctx, bm, board, item, project, {
      columns: bm.columns,
      defs: board.columns,
      phase: group?.title ?? null,
      seccion: group?.title ?? null,
      seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
      sortOrder: n,
      groupId,
    });
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
    groupItems.forEach((item, i) =>
      addTask(ctx, bm, board, item, project, {
        columns: bm.columns,
        defs: board.columns,
        phase: null,
        seccion: group.title,
        seccionOrder: ranks.get(group.id) ?? null,
        sortOrder: i + 1,
        groupId: group.id,
      }),
    );
  }
}

function translateItemAsProject(ctx: Ctx, bm: BoardMapping, eb: ExportBoard) {
  const board = eb.board;
  const ranks = groupRanks(board.groups);
  for (const item of activeItems(eb.items)) {
    const groupId = item.group?.id ?? null;
    const name = bm.projectNames[item.id] ?? item.name;
    const client = resolveClient(ctx, bm, bm.client, [item], name, item.id);
    const project = newProject(
      item.id,
      name,
      bm.projectCodes[item.id],
      client,
      sourceOf(board, groupId),
    );
    ctx.out.projects.push(project);
    const group = board.groups.find((g) => g.id === groupId);
    activeItems(item.subitems ?? []).forEach((sub, i) =>
      addTask(ctx, bm, board, sub, project, {
        columns: bm.subitemColumns,
        defs: board.subitem_columns,
        phase: null,
        seccion: group?.title ?? null,
        seccionOrder: groupId ? (ranks.get(groupId) ?? null) : null,
        sortOrder: i + 1,
        groupId,
      }),
    );
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
    start: toDate(tl?.from),
    milestone: tl?.visualization_type === "milestone",
    createdAt: item.created_at ?? null,
    createdById: ctx.options.importedById,
    unmatchedPeople: people.unmatched,
    source: sourceOf(board, at.groupId),
  };
  ctx.out.tasks.push(task);
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
