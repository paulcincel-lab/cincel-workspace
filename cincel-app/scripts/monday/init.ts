/**
 * `npm run monday -- init --export exports/<client> [--force]`
 * (docs/specs/monday-migration/backend.md §5.3).
 *
 * Drafts `exports/<client>/mapping.json` from an export so the admin only
 * edits the exceptions. No monday calls: it reads the export folder (§4.1)
 * and looks things up in the Cincel DB (scripts/monday/db.ts). The draft is
 * validated with the Zod `Mapping` before it is written; nothing else is
 * written. An existing mapping.json is kept unless `--force` is passed.
 *
 *   People    monday email (lower-case) → core.staff → { action: "staff" };
 *             guests → { action: "contact" }; no match → null.
 *   Strategy  per board (§5.1): crm_contacts when email/phone columns
 *             dominate, item_as_project when most items have subitems,
 *             else board_as_project. group_as_project and skip are only
 *             ever chosen by the admin.
 *   Columns   by type (§5.2), board and subitem columns.
 *   Statuses  by label id (§5.2): a label named like an existing
 *             task_statuses row → that custom status; is_done → completado;
 *             /stuck|bloquead|detenid/i → bloqueado;
 *             /working|proceso|curso/i → en_proceso; else pendiente.
 *   Client    a connect-boards column to a crm_contacts board →
 *             relation_column; else the board name vs cliente contacts by
 *             trigram (≥ 0.8) → contact; else null.
 *   Contacts  crm_contacts items named like an existing contact of the same
 *             type (lower-case equal) → contactMatches.
 *   Area      the workspace name vs areas by trigram (≥ 0.8); an area with
 *             exactly one workflow → workflowId; then the task items' names
 *             vs that workflow's templates (≥ 0.85) → templateMatches.
 *   Schedule  enabled for board_as_project boards with a timeline column.
 *
 * Trigram similarity runs in Postgres (pg_trgm, migration 0000). The
 * thresholds may need tuning on the first real export.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { sql } from "drizzle-orm";

import type { ImportDb } from "../../lib/import/refs";
import { createMondayDb, type MondayDbHandle } from "./db";
import type { BoardFile, ColumnDef, Manifest } from "./export";
import { DONE_FILE } from "./export";
import {
  Mapping,
  type BoardMapping,
  type BoardStrategy,
  type ClientRef,
  type ColumnTarget,
  type MappingInput,
  type PersonTarget,
  type StatusTarget,
} from "./mapping.schema";
import type { MondayItem } from "./queries";
import type { CliIo, CommandHandler } from "./run";

export const MAPPING_FILE = "mapping.json";

/** Board or group name vs `contacts.name` of cliente contacts. */
export const CLIENT_SIMILARITY = 0.8;
/** Workspace name vs `areas.name` (the spec gives no own threshold; the client one is used). */
export const AREA_SIMILARITY = 0.8;
/** Item name vs `workflow_task_templates.title`. */
export const TEMPLATE_SIMILARITY = 0.85;

// ---------------------------------------------------------------------------
// Export folder
// ---------------------------------------------------------------------------

export interface ExportUser {
  id: string;
  name: string;
  email: string | null;
  status?: string | null;
  kind?: string | null;
}

export interface ExportWorkspace {
  id: string;
  name: string;
}

export interface ExportBoard {
  board: BoardFile;
  /** items.ndjson, in API order. */
  items: MondayItem[];
  /** Whether the board's `.done` marker exists. */
  done: boolean;
}

export interface ExportData {
  users: ExportUser[];
  workspaces: ExportWorkspace[];
  boards: ExportBoard[];
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readNdjson<T>(path: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/**
 * Reads what `init` needs from an export folder: users, workspaces and each
 * board's board.json and items. Boards come in manifest order, then any
 * other board folder by id.
 */
export async function readExport(dir: string): Promise<ExportData> {
  const manifest = await readJson<Manifest>(join(dir, "manifest.json"));
  if (!manifest)
    throw new Error(
      `${join(dir, "manifest.json")} not found; is this an export folder?`,
    );
  const users = (await readJson<ExportUser[]>(join(dir, "users.json"))) ?? [];
  const workspaces =
    (await readJson<ExportWorkspace[]>(join(dir, "workspaces.json"))) ?? [];

  const boardsDir = join(dir, "boards");
  let folders: string[] = [];
  try {
    folders = (await readdir(boardsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const order = manifest.boards.map((b) => b.id);
  const ids = [
    ...order.filter((id) => folders.includes(id)),
    ...folders.filter((id) => !order.includes(id)).sort(),
  ];

  const boards: ExportBoard[] = [];
  for (const id of ids) {
    const board = await readJson<BoardFile>(join(boardsDir, id, "board.json"));
    if (!board) continue;
    boards.push({
      board,
      items: await readNdjson<MondayItem>(join(boardsDir, id, "items.ndjson")),
      done: existsSync(join(boardsDir, id, DONE_FILE)),
    });
  }
  return { users, workspaces, boards };
}

// ---------------------------------------------------------------------------
// Cincel lookups
// ---------------------------------------------------------------------------

export type ContactType = "cliente" | "socio" | "proveedor";

export interface TemplateCandidate {
  name: string;
  templateId: string;
  score: number;
}

/** What `init` asks the Cincel DB. Tests pass a fake. */
export interface InitLookups {
  /** lower(email) → staff id, for live staff with one of these emails. */
  staffByEmail(emails: string[]): Promise<Map<string, string>>;
  /** lower(name) → task_statuses id. */
  customStatuses(): Promise<Map<string, string>>;
  /** The most similar cliente contact with similarity ≥ `CLIENT_SIMILARITY`. */
  matchClient(name: string): Promise<string | null>;
  /** lower(name) → contact id, for contacts of `type` with one of these names. */
  contactsByName(
    type: ContactType,
    names: string[],
  ): Promise<Map<string, string>>;
  /** The most similar area with similarity ≥ `AREA_SIMILARITY`. */
  matchArea(name: string): Promise<string | null>;
  /** Workflow ids of the area. */
  areaWorkflows(areaId: string): Promise<string[]>;
  /** Every (name, active template of the workflow) pair with similarity ≥ `TEMPLATE_SIMILARITY`. */
  templateCandidates(
    workflowId: string,
    names: string[],
  ): Promise<TemplateCandidate[]>;
}

type Row = Record<string, unknown>;

async function rows(
  db: ImportDb,
  query: ReturnType<typeof sql>,
): Promise<Row[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

const textArray = (values: string[]) =>
  sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

/** `InitLookups` over the Cincel DB, with pg_trgm `similarity()`. */
export function createDbLookups(db: ImportDb): InitLookups {
  return {
    async staffByEmail(emails) {
      const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
      if (lower.length === 0) return new Map();
      const found = await rows(
        db,
        sql`select lower(email) as email, id::text as id from core.staff
          where deleted_at is null and email is not null and lower(email) = any(${textArray(lower)})`,
      );
      return new Map(found.map((r) => [String(r.email), String(r.id)]));
    },
    async customStatuses() {
      const found = await rows(
        db,
        sql`select lower(name) as name, id::text as id from core.task_statuses where deleted_at is null`,
      );
      return new Map(found.map((r) => [String(r.name), String(r.id)]));
    },
    async matchClient(name) {
      const [best] = await rows(
        db,
        sql`select id::text as id from core.contacts
          where type = 'cliente' and deleted_at is null and similarity(name, ${name}) >= ${CLIENT_SIMILARITY}
          order by similarity(name, ${name}) desc, name, id limit 1`,
      );
      return best ? String(best.id) : null;
    },
    async contactsByName(type, names) {
      const lower = [...new Set(names.map((n) => n.toLowerCase()))];
      if (lower.length === 0) return new Map();
      const found = await rows(
        db,
        sql`select lower(name) as name, id::text as id from core.contacts
          where type = ${type} and deleted_at is null and lower(name) = any(${textArray(lower)})`,
      );
      return new Map(found.map((r) => [String(r.name), String(r.id)]));
    },
    async matchArea(name) {
      const [best] = await rows(
        db,
        sql`select id::text as id from core.areas
          where deleted_at is null and similarity(name, ${name}) >= ${AREA_SIMILARITY}
          order by similarity(name, ${name}) desc, name, id limit 1`,
      );
      return best ? String(best.id) : null;
    },
    async areaWorkflows(areaId) {
      const found = await rows(
        db,
        sql`select w.id::text as id from core.area_workflows aw
          join core.workflows w on w.id = aw.workflow_id
          where aw.area_id = ${areaId} and w.deleted_at is null
          order by w.sort_order, w.id`,
      );
      return found.map((r) => String(r.id));
    },
    async templateCandidates(workflowId, names) {
      const unique = [...new Set(names)];
      if (unique.length === 0) return [];
      const found = await rows(
        db,
        sql`select n.name as name, t.id::text as id, similarity(t.title, n.name) as score
          from unnest(${textArray(unique)}) as n(name)
          join core.workflow_task_templates t
            on t.workflow_id = ${workflowId} and t.active = true
            and similarity(t.title, n.name) >= ${TEMPLATE_SIMILARITY}`,
      );
      return found.map((r) => ({
        name: String(r.name),
        templateId: String(r.id),
        score: Number(r.score),
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

function parseSettings(settings: unknown): Record<string, unknown> | null {
  if (typeof settings === "string") {
    try {
      const parsed: unknown = JSON.parse(settings);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return settings && typeof settings === "object"
    ? (settings as Record<string, unknown>)
    : null;
}

/** Board ids a connect-boards column links to. */
export function linkedBoardIds(column: ColumnDef): string[] {
  const s = parseSettings(column.settings);
  const raw = s?.boardIds ?? s?.board_ids;
  return Array.isArray(raw) ? raw.map(String) : [];
}

const isActive = (item: { state?: string | null }) =>
  item.state == null || item.state === "active";

const EMAIL_PHONE = new Set(["email", "phone"]);
/** Column types that carry task data; email/phone "dominate" when they are at least as many. */
const TASK_TYPES = new Set([
  "status",
  "color",
  "people",
  "multiple-person",
  "person",
  "timeline",
  "date",
]);

/**
 * §5.1: `crm_contacts` when the board has email or phone columns and they
 * are at least as many as its status, people, timeline and date columns;
 * `item_as_project` when more than half of the active items have subitems;
 * else `board_as_project`.
 */
export function detectStrategy(
  board: BoardFile,
  items: MondayItem[],
): BoardStrategy {
  const contactCols = board.columns.filter((c) =>
    EMAIL_PHONE.has(c.type),
  ).length;
  const taskCols = board.columns.filter((c) => TASK_TYPES.has(c.type)).length;
  if (contactCols > 0 && contactCols >= taskCols) return "crm_contacts";
  const active = items.filter(isActive);
  const withSubitems = active.filter((i) =>
    (i.subitems ?? []).some((s) => s && isActive(s)),
  ).length;
  if (active.length > 0 && withSubitems * 2 > active.length)
    return "item_as_project";
  return "board_as_project";
}

const PRIORITY_TITLE = /prior/i;

/**
 * Column targets by type (§5.2). The first column of a kind gets the Cincel
 * field; later ones of the same kind go to import data.
 *
 * - `crmBoards`: ids of boards drafted as crm_contacts; a connect-boards
 *   column to one of them is the project's `client`.
 * - `contactBoard`: email/phone are contact fields only on a crm_contacts board.
 */
export function columnTargets(
  columns: ColumnDef[],
  options: { crmBoards?: ReadonlySet<string>; contactBoard?: boolean } = {},
): Record<string, ColumnTarget> {
  const out: Record<string, ColumnTarget> = {};
  const taken = new Set<ColumnTarget>();
  const first = (target: ColumnTarget): ColumnTarget => {
    if (taken.has(target)) return "import_data";
    taken.add(target);
    return target;
  };
  // Notes prefer the first long text, then the first text column.
  const notesColumn =
    columns.find((c) => c.type === "long_text" || c.type === "long-text") ??
    columns.find((c) => c.type === "text");

  for (const c of columns) {
    let target: ColumnTarget;
    switch (c.type) {
      case "name":
        target = "title";
        break;
      case "status":
      case "color":
        target = first(PRIORITY_TITLE.test(c.title) ? "priority" : "status");
        break;
      case "people":
      case "multiple-person":
      case "person":
        target = first("people");
        break;
      case "timeline":
        target = first("timeline");
        break;
      case "date":
        target = first("delivery_date");
        break;
      case "long_text":
      case "long-text":
      case "text":
        target = c === notesColumn ? first("notes") : "import_data";
        break;
      case "dependency":
        target = first("dependencies");
        break;
      case "file":
        target = first("files");
        break;
      case "board_relation": {
        const crm = options.crmBoards;
        const toCrm =
          !options.contactBoard &&
          crm != null &&
          linkedBoardIds(c).some((id) => crm.has(id));
        target = toCrm ? first("client") : "import_data";
        break;
      }
      case "email":
        target = options.contactBoard ? first("contact_email") : "import_data";
        break;
      case "phone":
        target = options.contactBoard ? first("contact_phone") : "import_data";
        break;
      // Subitems are translated by the board's `subitems` option.
      case "subtasks":
        target = "ignore";
        break;
      default:
        target = "import_data";
    }
    out[c.id] = target;
  }
  return out;
}

export interface StatusLabel {
  id: string;
  label: string;
  /** Index in the board (what a StatusValue carries). */
  index: string | null;
  isDone: boolean;
}

/**
 * The labels of a status column's settings: the 2026-07 array form
 * (`labels: [{ id, label, index, is_done }]`) or the older object form
 * (`labels: { "<id>": "<label>" }` with `done_colors: [<id>]`).
 */
export function statusLabels(column: ColumnDef): StatusLabel[] {
  const s = parseSettings(column.settings);
  const labels = s?.labels;
  if (Array.isArray(labels)) {
    return labels
      .filter(
        (l): l is Record<string, unknown> =>
          l != null && typeof l === "object" && l.id != null,
      )
      .map((l) => ({
        id: String(l.id),
        label: typeof l.label === "string" ? l.label : "",
        index: l.index == null ? null : String(l.index),
        isDone: l.is_done === true,
      }));
  }
  if (labels && typeof labels === "object") {
    const done = new Set(
      Array.isArray(s?.done_colors)
        ? (s.done_colors as unknown[]).map(String)
        : [],
    );
    return Object.entries(labels as Record<string, unknown>).map(
      ([id, label]) => ({
        id,
        label: typeof label === "string" ? label : "",
        index: id,
        isDone: done.has(id),
      }),
    );
  }
  return [];
}

const BLOCKED = /stuck|bloquead|detenid/i;
const IN_PROGRESS = /working|proceso|curso/i;

/**
 * One label's target (§5.2): a label named like an existing custom status
 * (case-insensitive) → that status; is_done → completado; the blocked and
 * in-progress patterns; else pendiente.
 */
export function statusTarget(
  label: StatusLabel,
  customStatuses: ReadonlyMap<string, string>,
): StatusTarget {
  const custom = customStatuses.get(label.label.trim().toLowerCase());
  if (custom) return { customStatusId: custom };
  if (label.isDone) return { status: "completado" };
  if (BLOCKED.test(label.label)) return { status: "bloqueado" };
  if (IN_PROGRESS.test(label.label)) return { status: "en_proceso" };
  return { status: "pendiente" };
}

type ItemNode =
  MondayItem | NonNullable<NonNullable<MondayItem["subitems"]>[number]>;

function walk(
  items: readonly (ItemNode | null | undefined)[],
  visit: (item: ItemNode) => void,
) {
  for (const item of items) {
    if (!item) continue;
    visit(item);
    walk(
      ((item as { subitems?: (ItemNode | null)[] | null }).subitems ??
        []) as ItemNode[],
      visit,
    );
  }
}

/** Label indexes and texts that items report as done for each status column. */
function doneFromItems(
  items: MondayItem[],
): Map<string, { indexes: Set<string>; labels: Set<string> }> {
  const out = new Map<string, { indexes: Set<string>; labels: Set<string> }>();
  walk(items, (item) => {
    for (const v of item.column_values ?? []) {
      if (v.__typename !== "StatusValue" || v.is_done !== true) continue;
      const entry = out.get(v.id) ?? { indexes: new Set(), labels: new Set() };
      if (v.index != null) entry.indexes.add(String(v.index));
      if (v.label) entry.labels.add(v.label);
      out.set(v.id, entry);
    }
  });
  return out;
}

/**
 * Status maps by label id for every column drafted as `status`, board
 * columns first, then subitem columns (a subitem column with the same id
 * only adds the label ids the board column doesn't have). A label counts as
 * done when its settings say so or an item reports it done.
 */
export function statusMaps(
  columns: { defs: ColumnDef[]; targets: Record<string, ColumnTarget> }[],
  items: MondayItem[],
  customStatuses: ReadonlyMap<string, string>,
): Record<string, Record<string, StatusTarget>> {
  const done = doneFromItems(items);
  const out: Record<string, Record<string, StatusTarget>> = {};
  for (const { defs, targets } of columns) {
    for (const c of defs) {
      if (targets[c.id] !== "status") continue;
      const map = (out[c.id] ??= {});
      const seen = done.get(c.id);
      for (const label of statusLabels(c)) {
        if (map[label.id]) continue;
        const isDone =
          label.isDone ||
          (seen != null &&
            ((label.index != null && seen.indexes.has(label.index)) ||
              seen.labels.has(label.label)));
        map[label.id] = statusTarget({ ...label, isDone }, customStatuses);
      }
    }
  }
  return out;
}

/** People (§5.3): staff by lower(email), guests → contact, else null. */
export function peopleTargets(
  users: ExportUser[],
  staffByEmail: ReadonlyMap<string, string>,
): Record<string, PersonTarget> {
  const out: Record<string, PersonTarget> = {};
  for (const u of users) {
    const staffId = u.email
      ? staffByEmail.get(u.email.toLowerCase())
      : undefined;
    if (staffId) out[u.id] = { action: "staff", staffId };
    else if ((u.kind ?? "").toLowerCase() === "guest")
      out[u.id] = { action: "contact" };
    else out[u.id] = null;
  }
  return out;
}

/**
 * Template matches: per project, each template goes to the item with the
 * highest similarity (ties: the first in export order), so the draft never
 * has two items of one project on the same template (TEMPLATE_COLLISION).
 */
export function pickTemplates(
  projects: { id: string; name: string }[][],
  candidates: TemplateCandidate[],
): Record<string, string> {
  const byName = new Map<string, TemplateCandidate[]>();
  for (const c of candidates)
    byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  const out: Record<string, string> = {};
  for (const tasks of projects) {
    // Every (item, template) pair, best first, then export order.
    const pairs = tasks.flatMap((t, order) =>
      (byName.get(t.name) ?? []).map((c) => ({
        itemId: t.id,
        order,
        templateId: c.templateId,
        score: c.score,
      })),
    );
    pairs.sort(
      (a, b) =>
        b.score - a.score ||
        a.order - b.order ||
        a.templateId.localeCompare(b.templateId),
    );
    const usedTemplates = new Set<string>();
    for (const p of pairs) {
      if (out[p.itemId] || usedTemplates.has(p.templateId)) continue;
      out[p.itemId] = p.templateId;
      usedTemplates.add(p.templateId);
    }
  }
  return out;
}

/** The items that become tasks, grouped per project: top-level items, or for item_as_project each item's subitems. */
function taskItemsPerProject(
  strategy: BoardStrategy,
  items: MondayItem[],
): { id: string; name: string }[][] {
  const active = items.filter(isActive);
  if (strategy === "board_as_project")
    return [active.map((i) => ({ id: i.id, name: i.name }))];
  if (strategy === "item_as_project") {
    return active.map((i) =>
      (i.subitems ?? [])
        .filter((s) => s != null && isActive(s))
        .map((s) => ({ id: s!.id, name: s!.name })),
    );
  }
  return [];
}

/** Drafts the mapping for an export (§5.3); validated with the Zod `Mapping`. */
export async function draftMapping(
  data: ExportData,
  lookups: InitLookups,
): Promise<Mapping> {
  const customStatuses = await lookups.customStatuses();
  const staffByEmail = await lookups.staffByEmail(
    data.users.flatMap((u) => (u.email ? [u.email] : [])),
  );
  const workspaceName = new Map(
    data.workspaces.map((w) => [String(w.id), w.name]),
  );

  const strategies = new Map(
    data.boards.map((b) => [b.board.id, detectStrategy(b.board, b.items)]),
  );
  const crmBoards = new Set(
    [...strategies].filter(([, s]) => s === "crm_contacts").map(([id]) => id),
  );

  const boards: BoardMapping[] = [];
  for (const { board, items } of data.boards) {
    const strategy = strategies.get(board.id)!;
    const isCrm = strategy === "crm_contacts";
    const columns = columnTargets(board.columns, {
      crmBoards,
      contactBoard: isCrm,
    });
    const subitemColumns = isCrm
      ? {}
      : columnTargets(board.subitem_columns ?? [], {});

    const draft: MappingInput["boards"][number] = {
      mondayBoardId: board.id,
      name: board.name,
      strategy,
      columns,
      subitemColumns,
      statusMaps: statusMaps(
        [
          { defs: board.columns, targets: columns },
          { defs: board.subitem_columns ?? [], targets: subitemColumns },
        ],
        items,
        customStatuses,
      ),
    };

    if (isCrm) {
      const contactType: ContactType = "cliente";
      draft.contactType = contactType;
      const active = items.filter(isActive);
      const existing = await lookups.contactsByName(
        contactType,
        active.map((i) => i.name),
      );
      const matches: Record<string, string> = {};
      for (const item of active) {
        const id = existing.get(item.name.toLowerCase());
        if (id) matches[item.id] = id;
      }
      draft.contactMatches = matches;
    } else {
      // Client: a connect-boards column to a CRM board, else the board name by trigram.
      const relation = Object.entries(columns).find(([, t]) => t === "client");
      let client: ClientRef | null = null;
      if (relation) client = { kind: "relation_column", columnId: relation[0] };
      else {
        const contactId = await lookups.matchClient(board.name);
        if (contactId) client = { kind: "contact", contactId };
      }
      draft.client = client;

      // Area and workflow by workspace name; templates by item name.
      const wsName = board.workspace_id
        ? workspaceName.get(String(board.workspace_id))
        : undefined;
      const areaId = wsName ? await lookups.matchArea(wsName) : null;
      draft.areaId = areaId;
      let workflowId: string | null = null;
      if (areaId) {
        const workflows = await lookups.areaWorkflows(areaId);
        if (workflows.length === 1) workflowId = workflows[0];
      }
      draft.workflowId = workflowId;
      if (workflowId) {
        const perProject = taskItemsPerProject(strategy, items);
        const names = perProject.flat().map((t) => t.name);
        const candidates = await lookups.templateCandidates(workflowId, names);
        draft.templateMatches = pickTemplates(perProject, candidates);
      }

      const hasTimeline = Object.values(columns).includes("timeline");
      draft.schedule = {
        enabled: strategy === "board_as_project" && hasTimeline,
      };
    }
    boards.push(Mapping.shape.boards.element.parse(draft));
  }

  return Mapping.parse({
    version: 1,
    boards,
    people: peopleTargets(data.users, staffByEmail),
    options: { includeUpdates: true, includeFiles: true },
  } satisfies MappingInput);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface InitArgs {
  exportDir: string;
  force: boolean;
}

/** Parses `--export <dir> [--force]`; returns an error message when invalid. */
export function parseInitArgs(args: string[]): InitArgs | string {
  let exportDir: string | undefined;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force") force = true;
    else if (arg === "--export") exportDir = args[++i];
    else if (arg.startsWith("--export="))
      exportDir = arg.slice("--export=".length);
    else return `unknown option "${arg}"`;
  }
  if (!exportDir) return "--export exports/<client> is required";
  return { exportDir, force };
}

function summary(mapping: Mapping): string {
  const lines = mapping.boards.map((b) => {
    const client = b.client
      ? b.client.kind
      : b.strategy === "crm_contacts"
        ? "-"
        : "none";
    const templates = Object.keys(b.templateMatches).length;
    return `  ${b.mondayBoardId} ${b.name}: ${b.strategy}, client ${client}${templates ? `, ${templates} template matches` : ""}${b.schedule.enabled ? ", cronograma" : ""}`;
  });
  const people = Object.values(mapping.people);
  const staff = people.filter((p) => p?.action === "staff").length;
  const contacts = people.filter((p) => p?.action === "contact").length;
  const unmatched = people.filter((p) => p === null).length;
  return [
    `${mapping.boards.length} board${mapping.boards.length === 1 ? "" : "s"}:`,
    ...lines,
    `people: ${staff} staff, ${contacts} guests as contacts, ${unmatched} unmatched`,
  ].join("\n");
}

export interface InitDeps {
  openDb: () => MondayDbHandle;
  /** The lookups over the opened database; `createDbLookups` by default. */
  lookups?: (db: MondayDbHandle["db"]) => InitLookups;
}

/** Builds the `init` handler; tests pass their own database. */
export function createInitCommand(
  deps: InitDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  return async (args: string[], io: CliIo) => {
    const parsed = parseInitArgs(args);
    if (typeof parsed === "string") {
      io.stderr(
        `monday init: ${parsed}.\nUsage: init --export exports/<client> [--force]\n`,
      );
      return 1;
    }
    const dir = resolve(parsed.exportDir);
    const target = join(dir, MAPPING_FILE);
    if (existsSync(target) && !parsed.force) {
      io.stderr(
        `monday init: ${target} exists already; it is kept. Pass --force to draft it again.\n`,
      );
      return 1;
    }

    const data = await readExport(dir);
    for (const b of data.boards) {
      if (!b.done)
        io.stderr(
          `monday init: board ${b.board.id} ${b.board.name} has no ${DONE_FILE}; its export is incomplete.\n`,
        );
    }

    const handle = deps.openDb();
    let mapping: Mapping;
    try {
      mapping = await draftMapping(
        data,
        (deps.lookups ?? createDbLookups)(handle.db),
      );
    } finally {
      await handle.close();
    }

    await writeFile(target, `${JSON.stringify(mapping, null, 2)}\n`);
    io.stdout(
      `${summary(mapping)}\nWrote ${target}. Edit it, then run plan.\n`,
    );
    return 0;
  };
}

export const initCommand: CommandHandler = createInitCommand();
