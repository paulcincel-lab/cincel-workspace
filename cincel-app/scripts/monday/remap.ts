/**
 * "Reacomodar importación" core (project flow BE §11.1): re-sorts an imported
 * project's tasks into tramo / fase / espacio / project / admin with the six
 * group targets. Takes `db`; no `server-only`, so the CLI
 * (`npm run monday -- remap`) and the wizard-admin actions share it.
 *
 *   npm run monday -- remap --projects "Madrid 22,Guadalajara 83"
 *     [--target "Obra=tramo:construccion"] [--apply --by <admin email>]
 *
 * Dry-run by default: prints each project's preview. `--apply` writes, and
 * needs `--by`, the email of an active Administrador.
 *
 * Every task keeps its id, status, dates, title and people (except a task
 * moved to Tareas de administración, which loses its non-admin manager and
 * support rows). A remap never deletes tasks or history. What it writes stays
 * owned by the import batch (history and stage rows, new projects and
 * espacios get import refs; `row_updated_at` is refreshed), so a later
 * rollback of the batch still works.
 *
 * Placement is decided from each task's import ref (its monday board and
 * group), the batch mapping's template matches and the live task row; the
 * stored export gives the boards' groups and proves the export is still
 * there (`EXPORT_MISSING`).
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { isStaffAdministrator } from "../../lib/auth/access-role";
import {
  contacts,
  historyEvents,
  importBatches,
  importFiles,
  importRefs,
  positionPhases,
  positions,
  projectSpaces,
  projectStages,
  projects,
  providerSubtype,
  staff,
  taskStatuses,
  taskSupport,
  tasks,
  workflowPhases,
  workflowTaskTemplates,
  workflows,
} from "../../lib/db/schema";
import type { ImportRef } from "../../lib/db/schema/import";
import type { ImportDb } from "../../lib/import/refs";
import { ensureAssignClientTask } from "../../lib/project-flow/admin-tasks";
import { refreshStageClosed } from "../../lib/project-flow/closing";
import type { FlowTx } from "../../lib/project-flow/db";
import { FLOW_ERROR, flowError, MONDAY_FLOW_ERROR } from "../../lib/project-flow/errors";
import { nameKey } from "../../lib/project-flow/names";
import type {
  MondayBoardSource,
  MondayImportChoices,
  MondayPreviewIssue,
  MondayRemapBoard,
  MondayRemapInput,
  MondayRemapPreview,
  MondayRemapState,
} from "../../lib/types/monday-import";
import { createMondayDb, type MondayDb, type MondayDbHandle } from "./db";
import type { BoardFile } from "./export";
import { readExport, statusLabels } from "./init";
import { savedStatusMap } from "./plan";
import type { ProjectFlowGroupTarget } from "./mapping.schema";
import type { CliIo, CommandHandler } from "./run";

const SOURCE = "monday";

/** The UI copy of `EXPORT_MISSING` (frontend §9); the CLI prints it too. */
export const EXPORT_MISSING_TEXT =
  "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo.";

/** A planned change to one live task (fields recorded in history on apply). */
export interface TaskChange {
  taskId: string;
  before: TaskPlacement;
  after: TaskPlacement;
  /** Admin target: the non-admin manager is cleared. */
  clearManager?: boolean;
  /** Admin target: these non-admin support rows are removed. */
  clearSupportIds?: string[];
}

/**
 * Where a task sits. In a plan, a project or espacio that apply creates first
 * is `new:<…>` (see {@link isNewRef}).
 */
export interface TaskPlacement {
  projectId: string;
  kind: "workflow" | "usuario" | "admin";
  workflowId: string | null;
  phaseId: string | null;
  spaceId: string | null;
  templateId: string | null;
}

/** `new:<…>`: a project or espacio the plan creates on apply. */
export const NEW_PREFIX = "new:";
export const isNewRef = (id: string | null): id is string => id != null && id.startsWith(NEW_PREFIX);

/** The fields a remap changes and records in task history. */
const PLACEMENT_FIELDS = ["projectId", "kind", "workflowId", "phaseId", "spaceId", "templateId"] as const;

/** The CLI client, the app's client or an open transaction of either. */
type Exec = ImportDb;
type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

interface CatalogWorkflow {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  active: boolean;
}
interface CatalogPhase {
  id: string;
  workflowId: string;
  key: string | null;
  name: string;
  sortOrder: number;
  active: boolean;
}
export interface RemapCatalog {
  workflows: CatalogWorkflow[];
  phases: CatalogPhase[];
}
interface Catalog extends RemapCatalog {
  templates: Map<string, { workflowId: string; phaseId: string; title: string; active: boolean }>;
}

async function loadCatalog(db: Exec): Promise<Catalog> {
  const [flowRows, phaseRows, templateRows] = await Promise.all([
    db
      .select({
        id: workflows.id,
        key: workflows.key,
        name: workflows.name,
        sortOrder: workflows.sortOrder,
        active: workflows.active,
      })
      .from(workflows)
      .where(isNull(workflows.deletedAt))
      .orderBy(asc(workflows.sortOrder), asc(workflows.name)),
    db
      .select({
        id: workflowPhases.id,
        workflowId: workflowPhases.workflowId,
        key: workflowPhases.key,
        name: workflowPhases.name,
        sortOrder: workflowPhases.sortOrder,
        active: workflowPhases.active,
      })
      .from(workflowPhases)
      .orderBy(asc(workflowPhases.workflowId), asc(workflowPhases.sortOrder)),
    db
      .select({
        id: workflowTaskTemplates.id,
        workflowId: workflowTaskTemplates.workflowId,
        phaseId: workflowTaskTemplates.phaseId,
        title: workflowTaskTemplates.title,
        active: workflowTaskTemplates.active,
      })
      .from(workflowTaskTemplates),
  ]);
  const live = new Set(flowRows.map((w) => w.id));
  return {
    workflows: flowRows,
    phases: phaseRows.filter((p) => live.has(p.workflowId)),
    templates: new Map(
      templateRows.map((t) => [t.id, { workflowId: t.workflowId, phaseId: t.phaseId, title: t.title, active: t.active }]),
    ),
  };
}

const workflowById = (c: RemapCatalog, id: string | null | undefined) =>
  id ? c.workflows.find((w) => w.id === id) : undefined;
const phaseById = (c: RemapCatalog, id: string | null | undefined) =>
  id ? c.phases.find((p) => p.id === id) : undefined;
const phasesOf = (c: RemapCatalog, workflowId: string) => c.phases.filter((p) => p.workflowId === workflowId);

/** Whole-word containment of `needle` in `hay`, both `nameKey`s. */
const containsWord = (hay: string, needle: string) => needle !== "" && ` ${hay} `.includes(` ${needle} `);

/** The active fase whose name the text contains as a whole word (accent- and case-insensitive); the longest wins. */
export function phaseInText(
  phases: readonly { id: string; name: string; active?: boolean }[],
  text: string,
): string | null {
  const key = nameKey(text);
  let best: { id: string; len: number } | null = null;
  for (const p of phases) {
    if (p.active === false) continue;
    const k = nameKey(p.name);
    if (containsWord(key, k) && (!best || k.length > best.len)) best = { id: p.id, len: k.length };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Default targets
// ---------------------------------------------------------------------------

/**
 * The default target of a group (BE §10.2), by `nameKey` of its title: a tramo
 * of that name → `tramo`; a fase of the board's tramo → `phase`; a fase of
 * exactly one other tramo → `phase`; "Administrativo" → `admin`; a fase named
 * inside the title as a whole word (board's tramo first, then exactly one
 * other tramo: "Proyecto Ejecutivo" → Ejecutivo) → `phase`; else the board's
 * tramo; null when the board has none (TRAMO_MISSING).
 */
export function defaultGroupTarget(
  title: string,
  boardWorkflowId: string | null,
  catalog: RemapCatalog,
): ProjectFlowGroupTarget | null {
  const key = nameKey(title);
  const flows = catalog.workflows.filter((w) => w.active);
  const tramo = flows.find((w) => nameKey(w.name) === key);
  if (tramo) return { kind: "tramo", workflowId: tramo.id };
  const active = catalog.phases.filter((p) => p.active && flows.some((w) => w.id === p.workflowId));
  const own = active.filter((p) => p.workflowId === boardWorkflowId);
  const others = active.filter((p) => p.workflowId !== boardWorkflowId);
  const exactOwn = own.find((p) => nameKey(p.name) === key);
  if (exactOwn) return { kind: "phase", phaseId: exactOwn.id };
  const exactOthers = others.filter((p) => nameKey(p.name) === key);
  if (exactOthers.length === 1) return { kind: "phase", phaseId: exactOthers[0].id };
  if (key === "administrativo") return { kind: "admin" };
  const inOwn = phaseInText(own, title);
  if (inOwn) return { kind: "phase", phaseId: inOwn };
  const inOthers = others.filter((p) => containsWord(key, nameKey(p.name)));
  if (inOthers.length === 1) return { kind: "phase", phaseId: inOthers[0].id };
  if (boardWorkflowId) return { kind: "tramo", workflowId: boardWorkflowId };
  return null;
}

/**
 * A group target stored in a v1 or v2 mapping (or saved by a remap), as a
 * project flow target; null when it doesn't resolve (the default applies).
 * v1 `stage` → `tramo`; v1 `workflow_phase` → the fase by name in the board's
 * tramo (else any tramo when unique, else the board's tramo); v1 `phase` (a
 * new project phase) → a fase of the group's name when unique, else null.
 */
export function storedGroupTarget(
  raw: unknown,
  groupTitle: string,
  boardWorkflowId: string | null,
  catalog: RemapCatalog,
): ProjectFlowGroupTarget | null {
  const t = raw as { kind?: unknown; workflowId?: unknown; phaseId?: unknown; phase?: unknown } | null;
  if (!t || typeof t.kind !== "string") return null;
  const liveFlow = (id: unknown) =>
    typeof id === "string" && catalog.workflows.some((w) => w.id === id) ? id : null;
  const byName = (name: string, workflowId: string | null) => {
    const key = nameKey(name);
    const own = workflowId
      ? catalog.phases.find((p) => p.workflowId === workflowId && nameKey(p.name) === key)
      : undefined;
    if (own) return own.id;
    const any = catalog.phases.filter((p) => nameKey(p.name) === key);
    return any.length === 1 ? any[0].id : null;
  };
  switch (t.kind) {
    case "tramo":
    case "stage": {
      const id = liveFlow(t.workflowId);
      return id ? { kind: "tramo", workflowId: id } : null;
    }
    case "phase": {
      if (typeof t.phaseId === "string") {
        return catalog.phases.some((p) => p.id === t.phaseId) ? { kind: "phase", phaseId: t.phaseId } : null;
      }
      const id = byName(groupTitle, boardWorkflowId);
      return id ? { kind: "phase", phaseId: id } : null;
    }
    case "workflow_phase": {
      const id = typeof t.phase === "string" ? byName(t.phase, boardWorkflowId) : null;
      if (id) return { kind: "phase", phaseId: id };
      return boardWorkflowId ? { kind: "tramo", workflowId: boardWorkflowId } : null;
    }
    case "space":
    case "project":
    case "admin":
    case "ignore":
      return { kind: t.kind };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Encoded targets (CLI `--target "<group title>=<target>"`)
// ---------------------------------------------------------------------------

/**
 * Parses a CLI target: `tramo:<id|key|name>`, `phase:<id>`,
 * `phase:<tramo>/<fase>` (key or name), `phase:<fase>` (when unique),
 * `space`, `project`, `admin`, `ignore`. Returns an error message otherwise.
 */
export function parseTargetSpec(spec: string, catalog: RemapCatalog): ProjectFlowGroupTarget | string {
  const value = spec.trim();
  if (value === "space" || value === "project" || value === "admin" || value === "ignore") return { kind: value };
  const [kind, ...rest] = value.split(":");
  const arg = rest.join(":").trim();
  const flowOf = (ref: string) => {
    const key = nameKey(ref);
    return catalog.workflows.find((w) => w.id === ref || nameKey(w.key) === key || nameKey(w.name) === key);
  };
  if (kind === "tramo" && arg) {
    const flow = flowOf(arg);
    return flow ? { kind: "tramo", workflowId: flow.id } : `unknown tramo "${arg}"`;
  }
  if (kind === "phase" && arg) {
    const byId = catalog.phases.find((p) => p.id === arg);
    if (byId) return { kind: "phase", phaseId: byId.id };
    const slash = arg.indexOf("/");
    if (slash > 0) {
      const flow = flowOf(arg.slice(0, slash));
      if (!flow) return `unknown tramo "${arg.slice(0, slash)}"`;
      const key = nameKey(arg.slice(slash + 1));
      const phase = catalog.phases.find(
        (p) => p.workflowId === flow.id && (nameKey(p.key ?? "") === key || nameKey(p.name) === key),
      );
      return phase ? { kind: "phase", phaseId: phase.id } : `unknown fase "${arg}"`;
    }
    const key = nameKey(arg);
    const matches = catalog.phases.filter((p) => nameKey(p.name) === key || nameKey(p.key ?? "") === key);
    if (matches.length === 1) return { kind: "phase", phaseId: matches[0].id };
    return matches.length === 0
      ? `unknown fase "${arg}"`
      : `fase "${arg}" is in more than one tramo; use phase:<tramo>/<fase>`;
  }
  return `unknown target "${spec}" (tramo:<tramo>, phase:<tramo>/<fase>, space, project, admin, ignore)`;
}

// ---------------------------------------------------------------------------
// Context: the project, its import refs and the stored export
// ---------------------------------------------------------------------------

interface RefSource {
  boardId: string | null;
  boardName: string | null;
  groupId: string | null;
  groupTitle: string | null;
}

const asJson = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

function refSource(data: unknown): RefSource {
  const s = asJson(asJson(data).source);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    boardId: str(s.boardId),
    boardName: str(s.boardName),
    groupId: str(s.groupId),
    groupTitle: str(s.groupTitle),
  };
}

/** The parts of a stored (v1 or v2) board mapping the remap reads. */
interface RawBoardMapping {
  mondayBoardId: string;
  name?: string;
  workflowId?: string | null;
  groupTargets?: Record<string, unknown>;
  templateMatches?: Record<string, string>;
}

interface ContextBoard {
  boardId: string;
  name: string;
  /** null: the board's files are missing from the stored export. */
  file: BoardFile | null;
  items: { id: string; name: string; groupId: string | null; state: string | null }[];
  mapping: RawBoardMapping | null;
}

interface ContextTask {
  id: string;
  projectId: string;
  kind: TaskPlacement["kind"];
  workflowId: string | null;
  phaseId: string | null;
  spaceId: string | null;
  templateId: string | null;
  managerId: string | null;
  parentTaskId: string | null;
  title: string;
  createdAt: Date;
  sortOrder: number | null;
  updatedAt: Date;
  /** The task's import ref; null for tasks made in Cincel (never moved). */
  ref: ImportRef | null;
}

interface RemapContext {
  project: { id: string; name: string; currentWorkflowId: string | null };
  projectRef: ImportRef;
  boards: ContextBoard[];
  tasks: ContextTask[];
}

const projectRefWhere = (projectId: string) =>
  and(eq(importRefs.source, SOURCE), eq(importRefs.entity, "project"), eq(importRefs.rowId, projectId));

async function loadContext(db: Exec, projectId: string): Promise<RemapContext> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name, currentWorkflowId: projects.currentWorkflowId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw flowError(FLOW_ERROR.NOT_FOUND);
  const [projectRef] = await db
    .select()
    .from(importRefs)
    .where(projectRefWhere(projectId))
    .orderBy(asc(importRefs.createdAt))
    .limit(1);
  if (!projectRef) throw new Error(MONDAY_FLOW_ERROR.NOT_IMPORTED);
  const [batch] = await db
    .select({ exportPath: importBatches.exportPath, mapping: importBatches.mapping })
    .from(importBatches)
    .where(eq(importBatches.id, projectRef.batchId))
    .limit(1);
  if (!batch) throw new Error(MONDAY_FLOW_ERROR.NOT_IMPORTED);

  // Pre-flight: the stored export folder must still be there. `apply` stores it absolute.
  const dir = resolve(batch.exportPath);
  if (!existsSync(join(dir, "manifest.json"))) throw new Error(MONDAY_FLOW_ERROR.EXPORT_MISSING);
  const exportData = await readExport(dir);

  const taskRows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      kind: tasks.kind,
      workflowId: tasks.workflowId,
      phaseId: tasks.phaseId,
      spaceId: tasks.spaceId,
      templateId: tasks.templateId,
      managerId: tasks.managerId,
      parentTaskId: tasks.parentTaskId,
      title: tasks.title,
      createdAt: tasks.createdAt,
      sortOrder: tasks.sortOrder,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id));
  const ids = taskRows.map((t) => t.id);
  const refOf = new Map<string, ImportRef>();
  for (let i = 0; i < ids.length; i += 1000) {
    const found = await db
      .select()
      .from(importRefs)
      .where(
        and(
          eq(importRefs.source, SOURCE),
          eq(importRefs.entity, "task"),
          inArray(importRefs.rowId, ids.slice(i, i + 1000)),
        ),
      );
    for (const r of found) if (!refOf.has(r.rowId)) refOf.set(r.rowId, r);
  }

  // The project's boards: its own source, then the boards its tasks came from.
  const boardIds: string[] = [];
  const boardNames = new Map<string, string>();
  const addBoard = (s: RefSource) => {
    if (!s.boardId) return;
    if (!boardIds.includes(s.boardId)) boardIds.push(s.boardId);
    if (s.boardName && !boardNames.has(s.boardId)) boardNames.set(s.boardId, s.boardName);
  };
  addBoard(refSource(projectRef.data));
  for (const t of taskRows) {
    const r = refOf.get(t.id);
    if (r) addBoard(refSource(r.data));
  }

  const rawBoards = asJson(batch.mapping).boards;
  const mappings = (Array.isArray(rawBoards) ? rawBoards : []) as RawBoardMapping[];
  const boards: ContextBoard[] = boardIds.map((boardId) => {
    const eb = exportData.boards.find((b) => b.board.id === boardId);
    const mapping = mappings.find((m) => m?.mondayBoardId === boardId) ?? null;
    return {
      boardId,
      name: eb?.board.name ?? mapping?.name ?? boardNames.get(boardId) ?? boardId,
      file: eb?.board ?? null,
      items: (eb?.items ?? []).map((i) => ({
        id: String(i.id),
        name: String(i.name ?? ""),
        groupId: i.group?.id ?? null,
        state: (i as { state?: string | null }).state ?? null,
      })),
      mapping,
    };
  });

  return { project, projectRef, boards, tasks: taskRows.map((t) => ({ ...t, ref: refOf.get(t.id) ?? null })) };
}

type SavedTargets = Record<string, { workflowId?: unknown; groupTargets?: Record<string, unknown> }>;

/** Saved by a previous remap on the project ref (`data.groupTargets`): boardId → { workflowId, groupTargets }. */
const savedTargets = (ref: ImportRef): SavedTargets => asJson(asJson(ref.data).groupTargets) as SavedTargets;

/** Each board's tramo and group targets now: saved by a previous remap, else the batch mapping's, else the defaults. */
function currentTargets(ctx: RemapContext, catalog: Catalog): MondayRemapInput {
  const saved = savedTargets(ctx.projectRef);
  const live = (id: unknown) => (typeof id === "string" && workflowById(catalog, id) ? id : null);
  return ctx.boards.map((b) => {
    const prior = saved[b.boardId];
    let workflowId: string | null;
    if (prior && "workflowId" in prior) workflowId = live(prior.workflowId);
    else {
      const boardKey = nameKey(b.name);
      workflowId =
        live(b.mapping?.workflowId) ??
        catalog.workflows.find((w) => w.active && containsWord(boardKey, nameKey(w.name)))?.id ??
        live(ctx.project.currentWorkflowId);
    }
    const groupTargets: Record<string, ProjectFlowGroupTarget> = {};
    for (const g of b.file?.groups ?? []) {
      const target =
        storedGroupTarget(prior?.groupTargets?.[g.id], g.title, workflowId, catalog) ??
        storedGroupTarget(b.mapping?.groupTargets?.[g.id], g.title, workflowId, catalog) ??
        defaultGroupTarget(g.title, workflowId, catalog);
      if (target) groupTargets[g.id] = target;
    }
    return { boardId: b.boardId, workflowId, groupTargets };
  });
}

function boardSource(b: ContextBoard): MondayBoardSource | null {
  const board = b.file;
  if (!board) return null;
  const plain = (cols: readonly { id: string; title: string; type: string }[]) =>
    cols.map((c) => ({ id: c.id, title: c.title, type: c.type }));
  const labels: MondayBoardSource["statusLabels"] = {};
  for (const c of [...board.columns, ...(board.subitem_columns ?? [])]) {
    if (c.type !== "status") continue;
    const list = (labels[c.id] ??= []);
    for (const l of statusLabels(c)) {
      if (!list.some((x) => x.id === l.id)) list.push({ id: l.id, name: l.label, isDone: l.isDone });
    }
  }
  return {
    id: board.id,
    name: board.name,
    columns: plain(board.columns),
    subitemColumns: plain(board.subitem_columns ?? []),
    groups: board.groups.map((g) => ({ id: g.id, title: g.title })),
    statusLabels: labels,
    itemCount: b.items.length,
    items: b.items
      .filter((i) => i.state == null || i.state === "active")
      .map((i) => ({ id: i.id, name: i.name, groupId: i.groupId })),
  };
}

async function loadChoices(db: Exec, catalog: Catalog): Promise<MondayImportChoices> {
  const [statusRows, clientRows, staffRows, positionRows, positionPhaseRows] = await Promise.all([
    db
      .select({
        id: taskStatuses.id,
        name: taskStatuses.name,
        closes: taskStatuses.closes,
        countsAsCompleted: taskStatuses.countsAsCompleted,
      })
      .from(taskStatuses)
      .where(isNull(taskStatuses.deletedAt))
      .orderBy(asc(taskStatuses.sortOrder), asc(taskStatuses.name)),
    db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.type, "cliente"), isNull(contacts.deletedAt)))
      .orderBy(asc(contacts.name)),
    db
      .select({ id: staff.id, name: staff.name, email: staff.email })
      .from(staff)
      .where(and(isNull(staff.deletedAt), eq(staff.active, true)))
      .orderBy(asc(staff.name)),
    db
      .select({ id: positions.id, name: positions.name })
      .from(positions)
      .where(and(isNull(positions.deletedAt), eq(positions.active, true)))
      .orderBy(asc(positions.sortOrder), asc(positions.name)),
    db.select({ positionId: positionPhases.positionId, phaseId: positionPhases.phaseId }).from(positionPhases),
  ]);
  const active = catalog.workflows.filter((w) => w.active);
  return {
    statuses: statusRows,
    workflows: active.map((w) => ({
      id: w.id,
      name: w.name,
      phases: phasesOf(catalog, w.id)
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, name: p.name, sortOrder: p.sortOrder })),
    })),
    templates: [...catalog.templates.entries()]
      .filter(([, t]) => t.active && active.some((w) => w.id === t.workflowId))
      .map(([id, t]) => ({
        id,
        workflowId: t.workflowId,
        phaseId: t.phaseId,
        name: t.title,
      })),
    clients: clientRows,
    staff: staffRows,
    providerSubtypes: [...providerSubtype.enumValues],
    positions: positionRows.map((p) => ({
      id: p.id,
      name: p.name,
      phaseIds: positionPhaseRows.filter((r) => r.positionId === p.id).map((r) => r.phaseId),
    })),
    statusMap: await savedStatusMap(db),
  };
}

/** Boards, source groups and current targets of an imported project. Errors: NOT_IMPORTED, EXPORT_MISSING. */
export async function loadRemapState(db: MondayDb, projectId: string): Promise<MondayRemapState> {
  const catalog = await loadCatalog(db);
  const ctx = await loadContext(db, projectId);
  const current = currentTargets(ctx, catalog);
  const boards: MondayRemapBoard[] = ctx.boards.map((b, i) => ({
    boardId: b.boardId,
    name: b.name,
    source: boardSource(b),
    workflowId: current[i].workflowId,
    groupTargets: current[i].groupTargets,
  }));
  return {
    project: { id: ctx.project.id, name: ctx.project.name },
    boards,
    choices: await loadChoices(db, catalog),
  };
}

/** The input that keeps every board's current targets (what the CLI starts from); boards without a source are left out. */
export function currentRemapInput(state: MondayRemapState): MondayRemapInput {
  return state.boards
    .filter((b) => b.source != null)
    .map((b) => ({ boardId: b.boardId, workflowId: b.workflowId, groupTargets: { ...b.groupTargets } }));
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

interface PlannedProject {
  /** `<boardId>:<groupId>` (the project ref's external id). */
  externalId: string;
  name: string;
  boardId: string;
  boardName: string;
  groupId: string;
  groupTitle: string;
}

interface PlannedSpace {
  /** `new:<projectId>/<name>`: the placeholder id changes use. */
  key: string;
  /** Real project id, or `new:<externalId>`. */
  projectId: string;
  name: string;
  boardId: string;
  groupId: string;
}

interface Plan {
  ctx: RemapContext;
  catalog: Catalog;
  changes: TaskChange[];
  newProjects: PlannedProject[];
  newSpaces: PlannedSpace[];
  /** Project id (or `new:<externalId>`) → name, for samples. */
  projectNames: Map<string, string>;
  /** Space id (or `new:<projectId>/<name>`) → name. */
  spaceNames: Map<string, string>;
  issues: MondayPreviewIssue[];
  /** The input entries of the boards that take part (files in the export). */
  input: MondayRemapInput;
}

const placementOf = (t: ContextTask): TaskPlacement => ({
  projectId: t.projectId,
  kind: t.kind,
  workflowId: t.workflowId,
  phaseId: t.phaseId,
  spaceId: t.spaceId,
  templateId: t.templateId,
});

const samePlacement = (a: TaskPlacement, b: TaskPlacement) => PLACEMENT_FIELDS.every((f) => a[f] === b[f]);

/** The project flow codes join `PlanIssueCode` when the importer switches (BE §10.4). */
const issueCode = (code: string) => code as MondayPreviewIssue["code"];

async function computePlan(db: Exec, ctx: RemapContext, input: MondayRemapInput, catalog: Catalog): Promise<Plan> {
  const issues: MondayPreviewIssue[] = [];
  const issue = (code: string, blocking: boolean, board: ContextBoard | null, message: string) =>
    issues.push({
      code: issueCode(code),
      blocking,
      boardId: board?.boardId ?? null,
      itemId: null,
      boardName: board?.name ?? null,
      itemName: null,
      message,
      fixStep: "equivalencias",
    });

  // Only boards whose files are in the export take part ("source: null" boards are left as they are).
  const boardsById = new Map(ctx.boards.filter((b) => b.file).map((b) => [b.boardId, b]));
  const inputs = new Map(input.filter((e) => boardsById.has(e.boardId)).map((e) => [e.boardId, e]));

  for (const [boardId, entry] of inputs) {
    const board = boardsById.get(boardId)!;
    if (entry.workflowId && !workflowById(catalog, entry.workflowId))
      issue("MAPPING_INVALID", true, board, "La etapa del tablero ya no existe.");
    for (const [groupId, t] of Object.entries(entry.groupTargets)) {
      const title = board.file!.groups.find((g) => g.id === groupId)?.title ?? groupId;
      if (t.kind === "tramo" && !workflowById(catalog, t.workflowId))
        issue("MAPPING_INVALID", true, board, `La etapa elegida para el grupo «${title}» ya no existe.`);
      if (t.kind === "phase" && !phaseById(catalog, t.phaseId))
        issue("MAPPING_INVALID", true, board, `La fase elegida para el grupo «${title}» ya no existe.`);
    }
  }

  const byId = new Map(ctx.tasks.map((t) => [t.id, t]));
  /** A task's monday source; a child task without a group takes its parent's. */
  const sourceOf = (t: ContextTask): RefSource | null => {
    if (!t.ref) return null;
    const s = refSource(t.ref.data);
    if (!s.groupId && t.parentTaskId) {
      const parent = byId.get(t.parentTaskId);
      const ps = parent && parent.id !== t.id ? sourceOf(parent) : null;
      if (ps && ps.boardId === s.boardId) return { ...s, groupId: ps.groupId, groupTitle: ps.groupTitle };
    }
    return s;
  };
  const groupTitle = (board: ContextBoard, groupId: string | null, fallback: string | null) =>
    (groupId ? board.file?.groups.find((g) => g.id === groupId)?.title : null) ?? fallback ?? "";

  // --- "Proyecto aparte": the project imported for `<boardId>:<groupId>`, else a new one named after the group.
  const groupProjects = new Map<string, string>();
  const projectNames = new Map<string, string>([[ctx.project.id, ctx.project.name]]);
  const newProjects: PlannedProject[] = [];
  const wanted = new Map<string, { board: ContextBoard; groupId: string; title: string }>();
  for (const t of ctx.tasks) {
    const s = sourceOf(t);
    if (!s?.boardId || !s.groupId) continue;
    if (inputs.get(s.boardId)?.groupTargets[s.groupId]?.kind !== "project") continue;
    const board = boardsById.get(s.boardId)!;
    const externalId = `${s.boardId}:${s.groupId}`;
    if (!wanted.has(externalId))
      wanted.set(externalId, { board, groupId: s.groupId, title: groupTitle(board, s.groupId, s.groupTitle) });
  }
  if (wanted.size > 0) {
    const existing = await db
      .select({ externalId: importRefs.externalId, projectId: projects.id, name: projects.name })
      .from(importRefs)
      .innerJoin(projects, eq(projects.id, importRefs.rowId))
      .where(
        and(
          eq(importRefs.source, SOURCE),
          eq(importRefs.entity, "project"),
          inArray(importRefs.externalId, [...wanted.keys()]),
          isNull(projects.deletedAt),
        ),
      );
    const liveNames = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(isNull(projects.deletedAt), inArray(projects.status, ["activo", "pausado"])));
    const taken = new Set(liveNames.map((p) => nameKey(p.name)));
    for (const [externalId, w] of wanted) {
      const found = existing.find((e) => e.externalId === externalId);
      if (found) {
        groupProjects.set(externalId, found.projectId);
        projectNames.set(found.projectId, found.name);
        continue;
      }
      const name = w.title.trim() || externalId;
      if (taken.has(nameKey(name))) {
        issue("PROJECT_NAME_TAKEN", true, w.board, `Ya existe un proyecto llamado «${name}»; elige otro destino para el grupo.`);
        continue;
      }
      taken.add(nameKey(name));
      const id = `${NEW_PREFIX}${externalId}`;
      groupProjects.set(externalId, id);
      projectNames.set(id, name);
      newProjects.push({ externalId, name, boardId: w.board.boardId, boardName: w.board.name, groupId: w.groupId, groupTitle: w.title });
    }
  }

  // --- Where each task goes; tasks of ignored groups, of boards left out and made in Cincel stay.
  interface Draft {
    task: ContextTask;
    projectId: string;
    admin: boolean;
    workflowId: string | null;
    groupPhaseId: string | null;
    space: { name: string; boardId: string; groupId: string } | null;
  }
  const drafts: Draft[] = [];
  const missingTramo = new Map<string, Set<string>>();
  for (const t of ctx.tasks) {
    const s = sourceOf(t);
    if (!s?.boardId) continue;
    const entry = inputs.get(s.boardId);
    if (!entry) continue;
    const board = boardsById.get(s.boardId)!;
    const boardFlow = entry.workflowId && workflowById(catalog, entry.workflowId) ? entry.workflowId : null;
    let target: ProjectFlowGroupTarget | null = s.groupId ? (entry.groupTargets[s.groupId] ?? null) : null;
    if (!target && boardFlow) target = { kind: "tramo", workflowId: boardFlow };
    if (!target) {
      const set = missingTramo.get(board.boardId) ?? new Set<string>();
      set.add(groupTitle(board, s.groupId, s.groupTitle) || "Sin grupo");
      missingTramo.set(board.boardId, set);
      continue;
    }
    if (target.kind === "ignore") continue;
    if (target.kind === "tramo" && !workflowById(catalog, target.workflowId)) continue;
    if (target.kind === "phase" && !phaseById(catalog, target.phaseId)) continue;
    const draft: Draft = { task: t, projectId: t.projectId, admin: false, workflowId: boardFlow, groupPhaseId: null, space: null };
    if (target.kind === "admin") {
      draft.admin = true;
      draft.workflowId = null;
    } else if (target.kind === "tramo") {
      draft.workflowId = target.workflowId;
    } else if (target.kind === "phase") {
      draft.workflowId = phaseById(catalog, target.phaseId)!.workflowId;
      draft.groupPhaseId = target.phaseId;
    } else if (target.kind === "space") {
      const name = groupTitle(board, s.groupId, s.groupTitle).trim() || "Espacio";
      draft.space = { name, boardId: board.boardId, groupId: s.groupId ?? "" };
    } else if (target.kind === "project") {
      const pid = groupProjects.get(`${board.boardId}:${s.groupId}`);
      if (!pid) continue; // PROJECT_NAME_TAKEN: stays where it is (and the plan is blocked).
      draft.projectId = pid;
    }
    drafts.push(draft);
  }
  for (const [boardId, titles] of missingTramo) {
    const list = [...titles].map((t) => `«${t}»`).join(", ");
    issue(
      "TRAMO_MISSING",
      true,
      boardsById.get(boardId)!,
      `Elige una etapa para el tablero o para ${titles.size === 1 ? "el grupo" : "los grupos"} ${list}.`,
    );
  }

  // --- Espacios: the target project's one of that name (by nameKey), else a new one.
  const spaceNames = new Map<string, string>();
  const newSpaces: PlannedSpace[] = [];
  const realProjectIds = [...new Set(drafts.map((d) => d.projectId).filter((id) => !isNewRef(id)))];
  const spaceRows = realProjectIds.length
    ? await db
        .select({ id: projectSpaces.id, projectId: projectSpaces.projectId, name: projectSpaces.name })
        .from(projectSpaces)
        .where(inArray(projectSpaces.projectId, realProjectIds))
    : [];
  for (const s of spaceRows) spaceNames.set(s.id, s.name);
  const spaceIdFor = (d: Draft): string | null => {
    if (!d.space) return null;
    const key = nameKey(d.space.name);
    const found = spaceRows.find((s) => s.projectId === d.projectId && nameKey(s.name) === key);
    if (found) return found.id;
    let planned = newSpaces.find((s) => s.projectId === d.projectId && nameKey(s.name) === key);
    if (!planned) {
      planned = {
        key: `${NEW_PREFIX}${d.projectId}/${d.space.name}`,
        projectId: d.projectId,
        name: d.space.name,
        boardId: d.space.boardId,
        groupId: d.space.groupId,
      };
      newSpaces.push(planned);
      spaceNames.set(planned.key, planned.name);
    }
    return planned.key;
  };

  // --- Template slots (one live task per project and template): tasks that don't move hold theirs.
  const moving = new Set(drafts.map((d) => d.task.id));
  const slots = new Set<string>();
  for (const t of ctx.tasks) if (!moving.has(t.id) && t.templateId) slots.add(`${t.projectId}:${t.templateId}`);
  const otherProjects = realProjectIds.filter((id) => id !== ctx.project.id);
  if (otherProjects.length) {
    const held = await db
      .select({ projectId: tasks.projectId, templateId: tasks.templateId })
      .from(tasks)
      .where(and(inArray(tasks.projectId, otherProjects), isNull(tasks.deletedAt), sql`${tasks.templateId} is not null`));
    for (const h of held) slots.add(`${h.projectId}:${h.templateId}`);
  }
  const templateMatch = (t: ContextTask): string | null => {
    const s = sourceOf(t);
    const board = s?.boardId ? boardsById.get(s.boardId) : undefined;
    const itemId = t.ref?.externalId;
    const m = itemId ? board?.mapping?.templateMatches?.[itemId] : undefined;
    return typeof m === "string" ? m : null;
  };
  const candidateOf = (d: Draft): { id: string; current: boolean } | null => {
    if (d.admin || !d.workflowId) return null;
    const inTramo = (id: string | null) => id != null && catalog.templates.get(id)?.workflowId === d.workflowId;
    if (inTramo(d.task.templateId)) return { id: d.task.templateId!, current: true };
    const matched = templateMatch(d.task);
    return inTramo(matched) ? { id: matched!, current: false } : null;
  };
  // Current links claim first, then the mapping's matches, so a second run gives the same answer.
  const ordered = [...drafts].sort(
    (a, b) => Number(candidateOf(b)?.current ?? false) - Number(candidateOf(a)?.current ?? false),
  );

  // --- People of tasks bound for Tareas de administración: who isn't an Administrador.
  const adminBound = drafts.filter((d) => d.admin).map((d) => d.task.id);
  const supportRows = adminBound.length
    ? await db
        .select({ taskId: taskSupport.taskId, staffId: taskSupport.staffId })
        .from(taskSupport)
        .where(inArray(taskSupport.taskId, adminBound))
    : [];
  const peopleIds = [
    ...new Set([
      ...supportRows.map((r) => r.staffId),
      ...drafts.flatMap((d) => (d.admin && d.task.managerId ? [d.task.managerId] : [])),
    ]),
  ];
  const people = peopleIds.length
    ? await db.select({ id: staff.id, role: staff.role, email: staff.email }).from(staff).where(inArray(staff.id, peopleIds))
    : [];
  const isAdmin = new Map(people.map((p) => [p.id, isStaffAdministrator(p.role, p.email)]));

  const changes: TaskChange[] = [];
  let adminCleared = 0;
  const unresolvedByBoard = new Map<string, number>();
  for (const d of ordered) {
    const t = d.task;
    const before = placementOf(t);
    let after: TaskPlacement;
    let clearManager = false;
    let clearSupportIds: string[] = [];
    if (d.admin) {
      after = { projectId: d.projectId, kind: "admin", workflowId: null, phaseId: null, spaceId: null, templateId: null };
      clearManager = t.managerId != null && isAdmin.get(t.managerId) !== true;
      clearSupportIds = supportRows
        .filter((r) => r.taskId === t.id && isAdmin.get(r.staffId) !== true)
        .map((r) => r.staffId);
      if (clearManager || clearSupportIds.length) adminCleared++;
    } else {
      const candidate = candidateOf(d);
      let templateId: string | null = null;
      if (candidate && !slots.has(`${d.projectId}:${candidate.id}`)) {
        templateId = candidate.id;
        slots.add(`${d.projectId}:${candidate.id}`);
      }
      // Fase (brief §4.3): the template's, else the group's, else one named in the title, else none.
      const templatePhase = templateId ? (catalog.templates.get(templateId)?.phaseId ?? null) : null;
      const phaseId = d.workflowId
        ? (templatePhase ?? d.groupPhaseId ?? phaseInText(phasesOf(catalog, d.workflowId), t.title))
        : null;
      after = {
        projectId: d.projectId,
        kind: templateId ? "workflow" : "usuario",
        workflowId: d.workflowId,
        phaseId,
        spaceId: spaceIdFor(d),
        templateId,
      };
      if (d.workflowId && !phaseId) {
        const boardId = sourceOf(t)?.boardId ?? "";
        unresolvedByBoard.set(boardId, (unresolvedByBoard.get(boardId) ?? 0) + 1);
      }
    }
    if (samePlacement(before, after) && !clearManager && clearSupportIds.length === 0) continue;
    changes.push({
      taskId: t.id,
      before,
      after,
      ...(clearManager ? { clearManager } : {}),
      ...(clearSupportIds.length ? { clearSupportIds } : {}),
    });
  }
  const order = new Map(ctx.tasks.map((t, i) => [t.id, i]));
  changes.sort((a, b) => order.get(a.taskId)! - order.get(b.taskId)!);

  for (const [boardId, n] of unresolvedByBoard) {
    issue(
      "PHASE_UNRESOLVED",
      false,
      boardsById.get(boardId) ?? null,
      `${n} ${n === 1 ? "tarea queda" : "tareas quedan"} sin fase · revisar.`,
    );
  }
  if (adminCleared > 0) {
    issue(
      "ADMIN_ASSIGNEE_CLEARED",
      false,
      null,
      `${adminCleared} ${adminCleared === 1 ? "tarea de administración pierde" : "tareas de administración pierden"} responsables o apoyos que no son administradores.`,
    );
  }

  const usedSpaces = new Set(changes.map((c) => c.after.spaceId));
  const usedProjects = new Set(changes.map((c) => c.after.projectId));
  return {
    ctx,
    catalog,
    changes,
    newProjects: newProjects.filter((p) => usedProjects.has(`${NEW_PREFIX}${p.externalId}`)),
    newSpaces: newSpaces.filter((s) => usedSpaces.has(s.key)),
    projectNames,
    spaceNames,
    issues,
    input: [...inputs.values()],
  };
}

function placementLabel(p: TaskPlacement, plan: Plan): string {
  const project =
    p.projectId !== plan.ctx.project.id ? `${plan.projectNames.get(p.projectId) ?? "Otro proyecto"} · ` : "";
  if (p.kind === "admin") return `${project}Tareas de administración`;
  const tramo = workflowById(plan.catalog, p.workflowId)?.name ?? "Sin etapa";
  const phase = phaseById(plan.catalog, p.phaseId)?.name ?? "Sin fase";
  const space = p.spaceId ? ` · ${plan.spaceNames.get(p.spaceId) ?? "Espacio"}` : "";
  return `${project}${tramo} · ${phase}${space}`;
}

function previewOf(plan: Plan): MondayRemapPreview {
  const counts = { tramo: 0, phase: 0, space: 0, admin: 0, otherProject: 0, unchanged: 0, phaseUnresolved: 0 };
  const changed = new Map(plan.changes.map((c) => [c.taskId, c]));
  for (const t of plan.ctx.tasks) {
    const c = changed.get(t.id);
    const after = c?.after ?? placementOf(t);
    if (after.kind !== "admin" && after.workflowId && !after.phaseId) counts.phaseUnresolved++;
    if (!c) {
      counts.unchanged++;
      continue;
    }
    if (c.before.workflowId !== after.workflowId) counts.tramo++;
    if (c.before.phaseId !== after.phaseId) counts.phase++;
    if (c.before.spaceId !== after.spaceId) counts.space++;
    if (after.kind === "admin" && c.before.kind !== "admin") counts.admin++;
    if (c.before.projectId !== after.projectId) counts.otherProject++;
  }
  const titles = new Map(plan.ctx.tasks.map((t) => [t.id, t.title]));
  return {
    tasks: plan.ctx.tasks.length,
    changes: counts,
    samples: plan.changes.slice(0, 10).map((c) => ({
      taskId: c.taskId,
      title: titles.get(c.taskId) ?? "",
      before: placementLabel(c.before, plan),
      after: placementLabel(c.after, plan),
    })),
    issues: plan.issues,
  };
}

/** Matches the project's tasks (by import refs) to the input targets and plans each one's placement; no writes. */
export async function planRemap(
  db: MondayDb,
  projectId: string,
  input: MondayRemapInput,
): Promise<{ preview: MondayRemapPreview; changes: TaskChange[] }> {
  const catalog = await loadCatalog(db);
  const ctx = await loadContext(db, projectId);
  const plan = await computePlan(db, ctx, input, catalog);
  return { preview: previewOf(plan), changes: plan.changes };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const ms = (d: Date | string | null | undefined) => (d == null ? null : new Date(d).getTime());
const asText = (v: unknown): string | null => (v == null ? null : String(v));
const refKey = (entity: string, externalId: string) =>
  and(eq(importRefs.source, SOURCE), eq(importRefs.entity, entity), eq(importRefs.externalId, externalId));

/** Inserts history rows and the `history_event` refs that keep them owned by the batch (rollback check (b)). */
async function writeHistory(tx: FlowTx, batchId: string, rows: (typeof historyEvents.$inferInsert)[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await tx
      .insert(historyEvents)
      .values(rows.slice(i, i + 500))
      .returning({ id: historyEvents.id });
    await tx.insert(importRefs).values(
      inserted.map((h) => ({
        source: SOURCE,
        entity: "history_event",
        externalId: `remap:${h.id}`,
        rowId: h.id,
        batchId,
        data: { remap: true },
        rowUpdatedAt: null,
      })),
    );
  }
}

/**
 * A project's stages after a remap: add the tramos its tasks now have, delete
 * stage rows the import created that have no tasks left, recompute
 * `closed_at`, set `current_workflow_id` to the highest tramo with tasks, and
 * keep the project ref in step (`stageWorkflowIds`, `row_updated_at`).
 */
async function rebuildStages(tx: FlowTx, projectId: string, catalog: Catalog, actorId: string): Promise<void> {
  const [project] = await tx
    .select({ currentWorkflowId: projects.currentWorkflowId, updatedAt: projects.updatedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return;
  const [ref] = await tx
    .select()
    .from(importRefs)
    .where(projectRefWhere(projectId))
    .orderBy(asc(importRefs.createdAt))
    .limit(1);
  const used = await tx
    .select({ workflowId: tasks.workflowId, first: sql<Date | string>`min(${tasks.createdAt})` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt), sql`${tasks.workflowId} is not null`))
    .groupBy(tasks.workflowId);
  const usedIds = new Set(used.map((u) => u.workflowId!));
  const stages = await tx
    .select({ workflowId: projectStages.workflowId })
    .from(projectStages)
    .where(eq(projectStages.projectId, projectId));
  const staged = new Set(stages.map((s) => s.workflowId));
  const data = asJson(ref?.data);
  const owned = new Set<string>([
    ...(typeof data.stageWorkflowId === "string" ? [data.stageWorkflowId] : []),
    ...(Array.isArray(data.stageWorkflowIds) ? data.stageWorkflowIds.map(String) : []),
  ]);
  const ownedBefore = [...owned].sort().join(",");

  for (const u of used) {
    if (staged.has(u.workflowId!)) continue;
    await tx
      .insert(projectStages)
      .values({ projectId, workflowId: u.workflowId!, startedAt: new Date(u.first), startedById: actorId });
    staged.add(u.workflowId!);
    owned.add(u.workflowId!);
  }
  for (const s of stages) {
    if (usedIds.has(s.workflowId) || !owned.has(s.workflowId)) continue;
    await tx
      .delete(projectStages)
      .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, s.workflowId)));
    staged.delete(s.workflowId);
    owned.delete(s.workflowId);
  }
  for (const w of usedIds) await refreshStageClosed(tx, projectId, w);

  const sortOf = (id: string) => workflowById(catalog, id)?.sortOrder ?? -1;
  const highest = [...usedIds].sort((a, b) => sortOf(b) - sortOf(a))[0] ?? null;
  const keep = project.currentWorkflowId && staged.has(project.currentWorkflowId) ? project.currentWorkflowId : null;
  const current = highest ?? keep;
  let projectUpdatedAt: Date = project.updatedAt;
  if (current !== project.currentWorkflowId) {
    const [row] = await tx
      .update(projects)
      .set({ currentWorkflowId: current })
      .where(eq(projects.id, projectId))
      .returning({ updatedAt: projects.updatedAt });
    if (row) projectUpdatedAt = row.updatedAt;
    if (ref) {
      await writeHistory(tx, ref.batchId, [
        {
          entity: "project",
          entityId: projectId,
          kind: "cambio",
          actorId,
          field: "currentWorkflowId",
          beforeValue: asText(project.currentWorkflowId),
          afterValue: asText(current),
        },
      ]);
    }
  }
  if (!ref) return;
  // The ref follows the row only when nobody else edited the project since the import.
  const inSync = ms(project.updatedAt) === ms(ref.rowUpdatedAt);
  const rowChanged = inSync && ms(projectUpdatedAt) !== ms(ref.rowUpdatedAt);
  const ownedNow = [...owned].sort();
  const dataChanged = ownedNow.join(",") !== ownedBefore;
  if (!dataChanged && !rowChanged) return;
  const nextData: Json = { ...data, stageWorkflowIds: ownedNow };
  if (typeof data.stageWorkflowId === "string" && !owned.has(data.stageWorkflowId)) delete nextData.stageWorkflowId;
  await tx
    .update(importRefs)
    .set({ data: nextData, ...(rowChanged ? { rowUpdatedAt: projectUpdatedAt } : {}) })
    .where(refKey("project", ref.externalId));
}

/** One transaction with the project row locked; idempotent. Blocking plan issues throw `INVALID`. */
export async function applyRemap(
  db: MondayDb,
  projectId: string,
  input: MondayRemapInput,
  actorId: string,
): Promise<{ updated: number }> {
  return db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
    const catalog = await loadCatalog(tx);
    const ctx = await loadContext(tx, projectId);
    const plan = await computePlan(tx, ctx, input, catalog);
    const blocking = plan.issues.filter((i) => i.blocking);
    if (blocking.length > 0) throw flowError(FLOW_ERROR.INVALID, blocking.map((i) => i.message).join(" "));

    const batchId = ctx.projectRef.batchId;
    const now = new Date();

    // The targets go on the project ref, so the next remap starts from them.
    const saved = savedTargets(ctx.projectRef);
    const nextSaved: SavedTargets = { ...saved };
    for (const e of plan.input) nextSaved[e.boardId] = { workflowId: e.workflowId, groupTargets: e.groupTargets };
    if (JSON.stringify(nextSaved) !== JSON.stringify(saved)) {
      await tx
        .update(importRefs)
        .set({ data: { ...asJson(ctx.projectRef.data), groupTargets: nextSaved } })
        .where(refKey("project", ctx.projectRef.externalId));
    }
    if (plan.changes.length === 0) return { updated: 0 };

    // "Proyecto aparte": name only, no auto-start; it gets "Asignar cliente y origen" (BE §9.4).
    const projectIds = new Map<string, string>();
    for (const p of plan.newProjects) {
      const [row] = await tx
        .insert(projects)
        .values({ name: p.name, status: "activo" })
        .returning({ id: projects.id, updatedAt: projects.updatedAt });
      projectIds.set(`${NEW_PREFIX}${p.externalId}`, row.id);
      const refRow = {
        source: SOURCE,
        entity: "project",
        externalId: p.externalId,
        rowId: row.id,
        batchId,
        data: {
          source: { boardId: p.boardId, boardName: p.boardName, groupId: p.groupId, groupTitle: p.groupTitle },
          columns: {},
          stageWorkflowIds: [],
          remap: { at: now.toISOString(), by: actorId, fromProjectId: projectId },
        },
        rowUpdatedAt: row.updatedAt,
      };
      await tx
        .insert(importRefs)
        .values(refRow)
        .onConflictDoUpdate({
          target: [importRefs.source, importRefs.entity, importRefs.externalId],
          set: { rowId: row.id, batchId, data: refRow.data, rowUpdatedAt: row.updatedAt },
        });
      const assignId = await ensureAssignClientTask(tx, row.id, actorId);
      if (assignId) {
        const [t] = await tx.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, assignId)).limit(1);
        await tx
          .insert(importRefs)
          .values({
            source: SOURCE,
            entity: "task",
            externalId: `${p.externalId}:assign_client`,
            rowId: assignId,
            batchId,
            data: { remap: true },
            rowUpdatedAt: t?.updatedAt ?? null,
          })
          .onConflictDoUpdate({
            target: [importRefs.source, importRefs.entity, importRefs.externalId],
            set: { rowId: assignId, batchId, rowUpdatedAt: t?.updatedAt ?? null },
          });
      }
    }
    const realProject = (id: string) => projectIds.get(id) ?? id;

    // New espacios, appended after the project's own; their refs (`project_space`, `<boardId>:<groupId>`) let rollback remove them.
    const spaceIds = new Map<string, string>();
    for (const s of plan.newSpaces) {
      const pid = realProject(s.projectId);
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${projectSpaces.sortOrder}) + 1, 0)::int` })
        .from(projectSpaces)
        .where(eq(projectSpaces.projectId, pid));
      const [row] = await tx
        .insert(projectSpaces)
        .values({ projectId: pid, name: s.name, sortOrder: next })
        .returning({ id: projectSpaces.id, updatedAt: projectSpaces.updatedAt });
      spaceIds.set(s.key, row.id);
      await tx
        .insert(importRefs)
        .values({
          source: SOURCE,
          entity: "project_space",
          externalId: `${s.boardId}:${s.groupId}`,
          rowId: row.id,
          batchId,
          data: { remap: true, projectId: pid },
          rowUpdatedAt: row.updatedAt,
        })
        .onConflictDoUpdate({
          target: [importRefs.source, importRefs.entity, importRefs.externalId],
          set: { rowId: row.id, batchId, rowUpdatedAt: row.updatedAt },
        });
    }
    const realSpace = (id: string | null) => (id ? (spaceIds.get(id) ?? id) : null);

    // Tasks giving up a template link go first, so its (project, template) slot is free for the next one.
    const releases = (c: TaskChange) => Number(c.before.templateId != null && c.before.templateId !== c.after.templateId);
    const ordered = [...plan.changes].sort((a, b) => releases(b) - releases(a));
    const byTask = new Map(ctx.tasks.map((t) => [t.id, t]));
    const touchedProjects = new Set<string>([projectId]);
    const historyByBatch = new Map<string, (typeof historyEvents.$inferInsert)[]>();
    const addHistory = (taskId: string, row: typeof historyEvents.$inferInsert) => {
      const b = byTask.get(taskId)?.ref?.batchId ?? batchId;
      historyByBatch.set(b, [...(historyByBatch.get(b) ?? []), row]);
    };

    for (const c of ordered) {
      const t = byTask.get(c.taskId)!;
      const after: TaskPlacement = {
        ...c.after,
        projectId: realProject(c.after.projectId),
        spaceId: realSpace(c.after.spaceId),
      };
      touchedProjects.add(after.projectId);
      const [row] = await tx
        .update(tasks)
        .set({
          projectId: after.projectId,
          kind: after.kind,
          workflowId: after.workflowId,
          phaseId: after.phaseId,
          spaceId: after.spaceId,
          templateId: after.templateId,
          ...(c.clearManager ? { managerId: null } : {}),
        })
        .where(eq(tasks.id, c.taskId))
        .returning({ updatedAt: tasks.updatedAt });

      for (const f of PLACEMENT_FIELDS) {
        if (asText(c.before[f]) === asText(after[f])) continue;
        addHistory(c.taskId, {
          entity: "task",
          entityId: c.taskId,
          kind: "cambio",
          actorId,
          field: f,
          beforeValue: asText(c.before[f]),
          afterValue: asText(after[f]),
        });
      }
      if (c.clearManager) {
        addHistory(c.taskId, {
          entity: "task",
          entityId: c.taskId,
          kind: "cambio",
          actorId,
          field: "managerId",
          beforeValue: asText(t.managerId),
          afterValue: null,
        });
      }
      if (c.clearSupportIds?.length) {
        await tx
          .delete(taskSupport)
          .where(and(eq(taskSupport.taskId, c.taskId), inArray(taskSupport.staffId, c.clearSupportIds)));
        // So a later rollback doesn't look for rows that are gone.
        await tx
          .delete(importRefs)
          .where(
            and(
              eq(importRefs.source, SOURCE),
              eq(importRefs.entity, "task_support"),
              eq(importRefs.rowId, c.taskId),
              inArray(sql<string>`${importRefs.data}->>'staffId'`, c.clearSupportIds),
            ),
          );
      }
      // "Proyecto aparte": the task's files go along, for Drive phase B and rollback.
      if (after.projectId !== c.before.projectId) {
        await tx.update(importFiles).set({ projectId: after.projectId }).where(eq(importFiles.taskId, c.taskId));
      }
      if (t.ref) {
        // The snapshot follows the row only when nobody else edited the task since the import.
        const inSync = ms(t.updatedAt) === ms(t.ref.rowUpdatedAt);
        const data = asJson(t.ref.data);
        const remaps = Array.isArray(data.remaps) ? data.remaps : [];
        await tx
          .update(importRefs)
          .set({
            data: { ...data, remaps: [...remaps, { at: now.toISOString(), by: actorId, before: c.before }] },
            ...(inSync && row ? { rowUpdatedAt: row.updatedAt } : {}),
          })
          .where(refKey("task", t.ref.externalId));
      }
    }
    for (const [b, rows] of historyByBatch) await writeHistory(tx, b, rows);

    for (const pid of touchedProjects) await rebuildStages(tx, pid, catalog, actorId);

    const n = plan.changes.length;
    await writeHistory(tx, batchId, [
      {
        entity: "project",
        entityId: projectId,
        kind: "comentario",
        actorId,
        comment: `Reacomodar importación: ${n} ${n === 1 ? "tarea" : "tareas"}.`,
      },
    ]);
    return { updated: n };
  });
}

// ---------------------------------------------------------------------------
// CLI: npm run monday -- remap (BE §11.2)
// ---------------------------------------------------------------------------

export interface RemapArgs {
  projects: string[];
  /** `--target "<group title>=<target>"`, in order. */
  targets: { group: string; spec: string }[];
  apply: boolean;
  by: string | null;
}

export const REMAP_USAGE =
  'Usage: remap --projects "<name>,<name>" [--target "<group title>=<target>"]... [--apply --by <admin email>]';

/** Parses the remap flags; returns an error message when invalid. `--apply` requires `--by`. */
export function parseRemapArgs(args: string[]): RemapArgs | string {
  let projectsArg: string | undefined;
  const targets: RemapArgs["targets"] = [];
  let apply = false;
  let by: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = (flag: string) => (arg === flag ? args[++i] : arg.slice(flag.length + 1));
    if (arg === "--projects" || arg.startsWith("--projects=")) projectsArg = value("--projects");
    else if (arg === "--target" || arg.startsWith("--target=")) {
      const raw = value("--target") ?? "";
      const at = raw.lastIndexOf("=");
      if (at <= 0 || at === raw.length - 1) return `--target "${raw}" must be "<group title>=<target>"`;
      targets.push({ group: raw.slice(0, at).trim(), spec: raw.slice(at + 1).trim() });
    } else if (arg === "--apply") apply = true;
    else if (arg === "--by" || arg.startsWith("--by=")) by = value("--by")?.trim() || null;
    else return `unknown option ${arg}`;
  }
  const names = (projectsArg ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (names.length === 0) return '--projects "<name>,<name>" is required';
  if (apply && !by) return "--apply requires --by <admin email>";
  return { projects: names, targets, apply, by };
}

/** One project's preview as text for the terminal (and the release issue). */
export function formatRemapPreview(name: string, state: MondayRemapState, preview: MondayRemapPreview): string {
  const c = preview.changes;
  const lines = [`## ${name}`, ""];
  for (const b of state.boards) {
    lines.push(
      b.source
        ? `- Board ${b.name} (${b.boardId}): ${b.source.groups.length} groups`
        : `- Board ${b.name} (${b.boardId}): missing from the stored export (source null); its tasks stay as they are`,
    );
  }
  const moved = c.otherProject ? ` (+${c.otherProject} moved to another project)` : "";
  lines.push(
    "",
    `Tasks: ${preview.tasks} before, ${preview.tasks - c.otherProject} after${moved}`,
    `Changes: tramo ${c.tramo}, fase ${c.phase}, espacio ${c.space}, admin ${c.admin}, other project ${c.otherProject}, unchanged ${c.unchanged}, without fase ${c.phaseUnresolved}`,
  );
  if (preview.samples.length) {
    lines.push("", "Samples:");
    for (const s of preview.samples) lines.push(`- ${s.title}: ${s.before} → ${s.after}`);
  }
  if (preview.issues.length) {
    lines.push("", "Issues:");
    for (const i of preview.issues) {
      lines.push(`- ${i.blocking ? "BLOCKING " : ""}${i.code}${i.boardName ? ` (${i.boardName})` : ""}: ${i.message}`);
    }
  }
  return `${lines.join("\n")}\n\n`;
}

/** Applies `--target` overrides by group title (`nameKey`) on every board that has the group. */
export function applyTargetOverrides(
  state: MondayRemapState,
  input: MondayRemapInput,
  targets: RemapArgs["targets"],
  catalog: RemapCatalog,
): { input: MondayRemapInput; errors: string[]; unused: string[] } {
  const errors: string[] = [];
  const used = new Set<string>();
  for (const { group, spec } of targets) {
    const parsed = parseTargetSpec(spec, catalog);
    if (typeof parsed === "string") {
      errors.push(`--target "${group}=${spec}": ${parsed}`);
      continue;
    }
    for (const entry of input) {
      const board = state.boards.find((b) => b.boardId === entry.boardId);
      for (const g of board?.source?.groups ?? []) {
        if (nameKey(g.title) !== nameKey(group)) continue;
        entry.groupTargets[g.id] = parsed;
        used.add(group);
      }
    }
  }
  const unused = targets.filter((t) => !used.has(t.group) && !errors.some((e) => e.startsWith(`--target "${t.group}=`)));
  return { input, errors, unused: unused.map((t) => t.group) };
}

export interface RemapDeps {
  openDb: () => MondayDbHandle;
}

/** Builds the `remap` handler; tests pass their own database. */
export function createRemapCommand(deps: RemapDeps = { openDb: () => createMondayDb() }): CommandHandler {
  return async (args: string[], io: CliIo) => {
    const parsed = parseRemapArgs(args);
    if (typeof parsed === "string") {
      io.stderr(`monday remap: ${parsed}.\n${REMAP_USAGE}\n`);
      return 1;
    }
    const handle = deps.openDb();
    try {
      const db = handle.db;
      let actorId: string | null = null;
      if (parsed.apply) {
        const [by] = await db
          .select({ id: staff.id, role: staff.role, email: staff.email })
          .from(staff)
          .where(
            and(sql`lower(${staff.email}) = ${parsed.by!.toLowerCase()}`, eq(staff.active, true), isNull(staff.deletedAt)),
          )
          .limit(1);
        if (!by || !isStaffAdministrator(by.role, by.email)) {
          io.stderr(`monday remap: --by ${parsed.by} is not the email of an active Administrador.\n`);
          return 1;
        }
        actorId = by.id;
      }
      const live = await db.select({ id: projects.id, name: projects.name }).from(projects).where(isNull(projects.deletedAt));
      const catalog = await loadCatalog(db);

      const ready: { id: string; name: string; input: MondayRemapInput }[] = [];
      let failed = false;
      for (const name of parsed.projects) {
        const matches = live.filter((p) => nameKey(p.name) === nameKey(name));
        if (matches.length !== 1) {
          io.stderr(`monday remap: ${matches.length === 0 ? "no project" : `${matches.length} projects`} named "${name}".\n`);
          failed = true;
          continue;
        }
        const project = matches[0];
        let state: MondayRemapState;
        try {
          state = await loadRemapState(db, project.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message === MONDAY_FLOW_ERROR.EXPORT_MISSING) {
            io.stderr(`monday remap: ${project.name}: EXPORT_MISSING. ${EXPORT_MISSING_TEXT}\n`);
          } else if (message === MONDAY_FLOW_ERROR.NOT_IMPORTED) {
            io.stderr(`monday remap: ${project.name}: NOT_IMPORTED. Este proyecto no viene de una importación de monday.\n`);
          } else throw err;
          failed = true;
          continue;
        }
        const { input, errors, unused } = applyTargetOverrides(state, currentRemapInput(state), parsed.targets, catalog);
        for (const e of errors) io.stderr(`monday remap: ${e}\n`);
        for (const g of unused) io.stdout(`(${project.name}: no group titled "${g}"; that --target is not used)\n`);
        if (errors.length) {
          failed = true;
          continue;
        }
        const { preview } = await planRemap(db, project.id, input);
        io.stdout(formatRemapPreview(project.name, state, preview));
        if (preview.issues.some((i) => i.blocking)) failed = true;
        ready.push({ id: project.id, name: project.name, input });
      }
      if (failed) {
        if (parsed.apply) io.stderr("monday remap: nothing applied; fix the problems above first.\n");
        return 1;
      }
      if (!parsed.apply) {
        io.stdout("Dry run: nothing written. Add --apply --by <admin email> to write.\n");
        return 0;
      }
      for (const p of ready) {
        const { updated } = await applyRemap(db, p.id, p.input, actorId!);
        io.stdout(`${p.name}: ${updated} ${updated === 1 ? "task" : "tasks"} updated.\n`);
      }
      return 0;
    } finally {
      await handle.close();
    }
  };
}

export const remapCommand: CommandHandler = createRemapCommand();
