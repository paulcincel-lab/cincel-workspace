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
 *   People    deleted monday users and bots → { action: "ignore" }; monday
 *             email (lower-case), else name → core.staff → { action: "staff" };
 *             guests → { action: "contact" }; no match → null.
 *   Strategy  per board (§5.1): crm_contacts when email/phone columns
 *             dominate, item_as_project when most items have subitems,
 *             else board_as_project. group_as_project and skip are only
 *             ever chosen by the admin.
 *   Columns   by type (§5.2), board and subitem columns; a date column
 *             titled like "Fecha que finalizó" / "Fecha de finalización" /
 *             "Finalizado" → closed_date (project flow BE §10.6).
 *   Statuses  firm-wide, by label text (`statusLabelKey`): the saved map
 *             (app_settings `monday.status_map`) first; labels it doesn't
 *             have get the defaults table (lib/monday-import/status-map.ts):
 *             custom status by name, the built-in table, is_done →
 *             completado, base names and patterns, else pendiente flagged
 *             `defaulted` for review. Never completado unless monday says
 *             done or the table says so.
 *   Client    a connect-boards column to a crm_contacts board →
 *             relation_column; else the board name vs cliente contacts by
 *             trigram (≥ 0.8) → contact; else null.
 *   Contacts  crm_contacts items named like an existing contact of the same
 *             type (lower-case equal) → contactMatches.
 *   Etapa     the etapa whose name the board name contains → workflowId
 *             ("Etapa del tablero"), else null.
 *   Groups    `resolveGroupTarget` defaults (etapa / fase / admin by name,
 *             else the board's etapa); a group that resolves no etapa is
 *             left unset (plan reports ETAPA_MISSING).
 *   Templates the task items' names vs the active templates of the etapa
 *             their group places them in (≥ 0.85) → templateMatches.
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
import { isRetiredMondayUser } from "../../lib/monday-import/people";
import {
  customStatusIndex,
  defaultStatusEntry,
  fillStatusMap,
  parseStoredStatusMap,
} from "../../lib/monday-import/status-map";
import { MONDAY_STATUS_MAP_SETTING } from "../../lib/project-flow/catalog";
import { createMondayDb, type MondayDbHandle } from "./db";
import type { BoardFile, ColumnDef, Manifest } from "./export";
import { DONE_FILE } from "./export";
import {
  GROUP_TARGET_STRATEGIES,
  groupPlacement,
  nameKey,
  resolveGroupTarget,
  type GroupTargetCatalog,
} from "./group-targets";
import {
  Mapping,
  statusLabelKey,
  type BoardMapping,
  type BoardStrategy,
  type ClientRef,
  type ColumnTarget,
  type GroupTarget,
  type MappingInput,
  type MondayStatusMap,
  type PersonTarget,
  type StatusTarget,
} from "./mapping.schema";
import type { MondayItem } from "./queries";
import type { CliIo, CommandHandler } from "./run";

export const MAPPING_FILE = "mapping.json";

/** Board or group name vs `contacts.name` of cliente contacts. */
export const CLIENT_SIMILARITY = 0.8;
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

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function readNdjson<T>(path: string): Promise<T[]> {
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
  /** The template's fase. */
  phaseId?: string | null;
}

/** A etapa of the catalog with its fases (catalog order), as init reads it. */
export interface InitWorkflow {
  id: string;
  name: string;
  phases: { id: string; name: string; sortOrder: number; active: boolean }[];
}

/** What `init` asks the Cincel DB. Tests pass a fake. */
export interface InitLookups {
  /** lower(email) → staff id, for live staff with one of these emails. */
  staffByEmail(emails: string[]): Promise<Map<string, string>>;
  /** lower(name) → staff id, for names only one live staff member has (#689: the match after email). */
  staffByName?(names: string[]): Promise<Map<string, string>>;
  /** lower(name) → task_statuses id. */
  customStatuses(): Promise<Map<string, string>>;
  /** The most similar cliente contact with similarity ≥ `CLIENT_SIMILARITY`. */
  matchClient(name: string): Promise<string | null>;
  /** lower(name) → contact id, for contacts of `type` with one of these names. */
  contactsByName(
    type: ContactType,
    names: string[],
  ): Promise<Map<string, string>>;
  /** Active etapas (not deleted) with their fases, in catalog order. */
  workflows(): Promise<InitWorkflow[]>;
  /** The saved firm-wide status map (app_settings `monday.status_map`); empty when none is saved. */
  savedStatusMap(): Promise<MondayStatusMap>;
  /** Every (name, active template of the workflow) pair with similarity ≥ `TEMPLATE_SIMILARITY`, with its fase. */
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
    async staffByName(names) {
      const lower = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
      if (lower.length === 0) return new Map();
      const found = await rows(
        db,
        // A name shared by two live staff can't be told apart: left out, so the person stays unmapped (as matchStaff).
        sql`select lower(name) as name, (array_agg(id::text))[1] as id from core.staff
          where deleted_at is null and lower(name) = any(${textArray(lower)})
          group by lower(name) having count(*) = 1`,
      );
      return new Map(found.map((r) => [String(r.name), String(r.id)]));
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
    async workflows() {
      const found = await rows(
        db,
        sql`select w.id::text as id, w.name as name,
            p.id::text as phase_id, p.name as phase_name, p.sort_order as phase_order, p.active as phase_active
          from core.workflows w
          left join core.workflow_phases p on p.workflow_id = w.id
          where w.deleted_at is null and w.active = true
          order by w.sort_order, w.name, w.id, p.sort_order, p.name`,
      );
      const out = new Map<string, InitWorkflow>();
      for (const r of found) {
        const id = String(r.id);
        const workflow = out.get(id) ?? { id, name: String(r.name), phases: [] };
        out.set(id, workflow);
        if (r.phase_id != null)
          workflow.phases.push({
            id: String(r.phase_id),
            name: String(r.phase_name),
            sortOrder: Number(r.phase_order),
            active: r.phase_active === true,
          });
      }
      return [...out.values()];
    },
    async savedStatusMap() {
      const [row] = await rows(
        db,
        sql`select value from core.app_settings where key = ${MONDAY_STATUS_MAP_SETTING}`,
      );
      return parseStoredStatusMap(row ? String(row.value) : null);
    },
    async templateCandidates(workflowId, names) {
      const unique = [...new Set(names)];
      if (unique.length === 0) return [];
      const found = await rows(
        db,
        sql`select n.name as name, t.id::text as id, t.phase_id::text as phase_id, similarity(t.title, n.name) as score
          from unnest(${textArray(unique)}) as n(name)
          join core.workflow_task_templates t
            on t.workflow_id = ${workflowId} and t.active = true
            and similarity(t.title, n.name) >= ${TEMPLATE_SIMILARITY}`,
      );
      return found.map((r) => ({
        name: String(r.name),
        templateId: String(r.id),
        score: Number(r.score),
        phaseId: r.phase_id == null ? null : String(r.phase_id),
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

/** Titles (by `nameKey`) of the date column that says when monday's item was finished (project flow BE §10.6). */
const CLOSED_DATE_TITLES = new Set(["fecha que finalizo", "fecha de finalizacion", "finalizado"]);

/** Whether a column's title reads like "Fecha que finalizó": its date becomes the task's `closed_at`. */
export function isClosedDateTitle(title: string): boolean {
  return CLOSED_DATE_TITLES.has(nameKey(title));
}

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
        target = first(isClosedDateTitle(c.title) ? "closed_date" : "delivery_date");
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

/**
 * One label's default target, from the defaults table (lib/monday-import/status-map.ts `defaultStatusEntry`): a
 * label named like an existing custom status (accents and case ignored) → that status; the built-in table
 * (En Proceso, Entregado, Confirmado, Cancelado, No se Requiere, En espera, Importante, Siguiente Paso, "-");
 * is_done → completado; named like a base status or matching the blocked and in-progress patterns → that status;
 * else pendiente, flagged `defaulted` so the admin reviews it. Translate uses the same table for labels the saved
 * map doesn't have. `customStatuses` is lower(name) → id, as `InitLookups.customStatuses` answers.
 */
export function statusTarget(
  label: StatusLabel,
  customStatuses: ReadonlyMap<string, string>,
): StatusTarget {
  return defaultStatusEntry(
    { name: label.label, isDone: label.isDone },
    customStatusIndex(customStatuses),
  ).target;
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

/**
 * Label texts that items report as done for each status column; an item's `index` counts only when it has no
 * label text, so an index that means another label can't mark a label done.
 */
function doneFromItems(
  items: MondayItem[],
): Map<string, { indexes: Set<string>; labels: Set<string> }> {
  const out = new Map<string, { indexes: Set<string>; labels: Set<string> }>();
  walk(items, (item) => {
    for (const v of item.column_values ?? []) {
      if (v.__typename !== "StatusValue" || v.is_done !== true) continue;
      const entry = out.get(v.id) ?? { indexes: new Set(), labels: new Set() };
      if (v.label) entry.labels.add(v.label);
      else if (v.index != null) entry.indexes.add(String(v.index));
      out.set(v.id, entry);
    }
  });
  return out;
}

/**
 * The labels of every column drafted as `status` (board columns, then subitem columns), by label text, with
 * whether monday marks them done: by their settings or because an item reports them done.
 */
export function draftStatusLabels(
  columns: { defs: ColumnDef[]; targets: Record<string, ColumnTarget> }[],
  items: MondayItem[],
): { name: string; isDone: boolean }[] {
  const done = doneFromItems(items);
  const out = new Map<string, { name: string; isDone: boolean }>();
  for (const { defs, targets } of columns) {
    for (const c of defs) {
      if (targets[c.id] !== "status") continue;
      const seen = done.get(c.id);
      for (const label of statusLabels(c)) {
        const key = statusLabelKey(label.label);
        if (!key) continue;
        const isDone =
          label.isDone ||
          (seen != null &&
            (seen.labels.has(label.label) ||
              (label.index != null && seen.indexes.has(label.index))));
        const current = out.get(key);
        if (current) current.isDone ||= isDone;
        else out.set(key, { name: label.label, isDone });
      }
    }
  }
  return [...out.values()];
}

/**
 * The firm-wide status map for an export (project flow BE §10.6): the saved map, plus the default of every label of
 * the export's status columns the saved map doesn't have yet. Keyed by `statusLabelKey(label)`.
 */
export function draftStatusMap(
  boards: { columns: { defs: ColumnDef[]; targets: Record<string, ColumnTarget> }[]; items: MondayItem[] }[],
  customStatuses: ReadonlyMap<string, string>,
  saved: MondayStatusMap = {},
): MondayStatusMap {
  const labels = boards.flatMap((b) => draftStatusLabels(b.columns, b.items));
  return fillStatusMap(saved, labels, customStatusIndex(customStatuses));
}

/**
 * People (§5.3): deleted users and bots ignored (#689); staff by lower(email),
 * else by lower(name); guests → contact, else null.
 */
export function peopleTargets(
  users: ExportUser[],
  staffByEmail: ReadonlyMap<string, string>,
  staffByName: ReadonlyMap<string, string> = new Map(),
): Record<string, PersonTarget> {
  const out: Record<string, PersonTarget> = {};
  for (const u of users) {
    if (isRetiredMondayUser(u)) {
      out[u.id] = { action: "ignore" };
      continue;
    }
    const staffId =
      (u.email ? staffByEmail.get(u.email.toLowerCase()) : undefined) ??
      staffByName.get(u.name.trim().toLowerCase());
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

/**
 * The items that become tasks, grouped per project, with the group that places them: top-level items, or for
 * item_as_project each item's subitems (placed by their item's group).
 */
function taskItemsPerProject(
  strategy: BoardStrategy,
  items: MondayItem[],
): { id: string; name: string; groupId: string | null }[][] {
  const active = items.filter(isActive);
  const groupOf = (i: MondayItem) => i.group?.id ?? null;
  if (strategy === "board_as_project")
    return [active.map((i) => ({ id: i.id, name: i.name, groupId: groupOf(i) }))];
  if (strategy === "item_as_project") {
    return active.map((i) =>
      (i.subitems ?? [])
        .filter((s) => s != null && isActive(s))
        .map((s) => ({ id: s!.id, name: s!.name, groupId: groupOf(i) })),
    );
  }
  return [];
}

/** The catalog shape `resolveGroupTarget` reads. */
function catalogOf(workflows: InitWorkflow[]): GroupTargetCatalog {
  return {
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      phases: w.phases.map((p) => ({ id: p.id, name: p.name, sortOrder: p.sortOrder, active: p.active })),
    })),
  };
}

/**
 * "Etapa del tablero": the etapa whose name the board name contains as a whole word (accents and case ignored);
 * the longest name wins, so "Diseño ejecutivo" beats "Diseño". Null when none does.
 */
export function boardWorkflowId(
  boardName: string,
  workflows: readonly { id: string; name: string }[],
): string | null {
  const board = ` ${nameKey(boardName).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  let best: { id: string; length: number } | null = null;
  for (const w of workflows) {
    const name = nameKey(w.name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!name || !board.includes(` ${name} `)) continue;
    if (!best || name.length > best.length) best = { id: w.id, length: name.length };
  }
  return best?.id ?? null;
}

/**
 * Default group targets (project flow BE §10.2, §10.6): `resolveGroupTarget` for each group of a board whose
 * strategy maps groups; a group that resolves no etapa is left out, so the plan reports it (ETAPA_MISSING).
 */
export function draftGroupTargets(
  board: { strategy: BoardStrategy; workflowId: string | null; groups: { id: string; title: string }[] },
  catalog: GroupTargetCatalog,
): Record<string, GroupTarget> {
  if (!GROUP_TARGET_STRATEGIES.has(board.strategy)) return {};
  const out: Record<string, GroupTarget> = {};
  for (const group of board.groups) {
    const target = resolveGroupTarget({ strategy: board.strategy, workflowId: board.workflowId }, group, catalog);
    if (target.kind === "etapa" && !target.workflowId) continue;
    out[group.id] = target as GroupTarget;
  }
  return out;
}

/** Drafts the mapping (v2) for an export (§5.3, project flow BE §10.6); validated with the Zod `Mapping`. */
export async function draftMapping(
  data: ExportData,
  lookups: InitLookups,
): Promise<Mapping> {
  const customStatuses = await lookups.customStatuses();
  const staffByEmail = await lookups.staffByEmail(
    data.users.flatMap((u) => (u.email ? [u.email] : [])),
  );
  const staffByName =
    (await lookups.staffByName?.(data.users.map((u) => u.name))) ?? new Map<string, string>();
  const workflows = await lookups.workflows();
  const catalog = catalogOf(workflows);
  const savedStatusMap = await lookups.savedStatusMap();

  const strategies = new Map(
    data.boards.map((b) => [b.board.id, detectStrategy(b.board, b.items)]),
  );
  const crmBoards = new Set(
    [...strategies].filter(([, s]) => s === "crm_contacts").map(([id]) => id),
  );

  const boards: BoardMapping[] = [];
  const statusSources: Parameters<typeof draftStatusMap>[0] = [];
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
    // Task statuses only: a CRM board's status column describes contacts.
    if (!isCrm)
      statusSources.push({
        columns: [
          { defs: board.columns, targets: columns },
          { defs: board.subitem_columns ?? [], targets: subitemColumns },
        ],
        items,
      });

    const draft: MappingInput["boards"][number] = {
      mondayBoardId: board.id,
      name: board.name,
      strategy,
      columns,
      subitemColumns,
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
      // Client (optional): a connect-boards column to a CRM board, else the board name by trigram.
      const relation = Object.entries(columns).find(([, t]) => t === "client");
      let client: ClientRef | null = null;
      if (relation) client = { kind: "relation_column", columnId: relation[0] };
      else {
        const contactId = await lookups.matchClient(board.name);
        if (contactId) client = { kind: "contact", contactId };
      }
      draft.client = client;

      // Etapa by board name; groups by the defaults; templates by item name within the etapa the group places them.
      const workflowId = boardWorkflowId(board.name, workflows);
      draft.workflowId = workflowId;
      const groupTargets = draftGroupTargets({ strategy, workflowId, groups: board.groups ?? [] }, catalog);
      draft.groupTargets = groupTargets;
      const groupTitles = new Map((board.groups ?? []).map((g) => [g.id, g.title]));
      const etapaOf = (groupId: string | null): string | null => {
        const target = groupId ? groupTargets[groupId] : undefined;
        if (!target) return workflowId;
        const placement = groupPlacement(target, { title: groupTitles.get(groupId!) ?? "" }, catalog);
        if (placement.admin) return null;
        return placement.workflowId ?? workflowId;
      };

      const perProject = taskItemsPerProject(strategy, items).map((tasks) =>
        tasks.filter((t) => !t.groupId || groupTargets[t.groupId]?.kind !== "ignore"),
      );
      const etapas = new Set(perProject.flat().map((t) => etapaOf(t.groupId)).filter((id): id is string => !!id));
      const templateMatches: Record<string, string> = {};
      for (const etapa of etapas) {
        const inEtapa = perProject.map((tasks) => tasks.filter((t) => etapaOf(t.groupId) === etapa));
        const names = inEtapa.flat().map((t) => t.name);
        if (names.length === 0) continue;
        const candidates = await lookups.templateCandidates(etapa, names);
        Object.assign(templateMatches, pickTemplates(inEtapa, candidates));
      }
      draft.templateMatches = templateMatches;

      const hasTimeline = Object.values(columns).includes("timeline");
      draft.schedule = {
        enabled: strategy === "board_as_project" && hasTimeline,
      };
    }
    boards.push(Mapping.shape.boards.element.parse(draft));
  }

  return Mapping.parse({
    version: 2,
    boards,
    people: peopleTargets(data.users, staffByEmail, staffByName),
    options: { includeUpdates: true, includeFiles: true },
    statusMap: draftStatusMap(statusSources, customStatuses, savedStatusMap),
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
