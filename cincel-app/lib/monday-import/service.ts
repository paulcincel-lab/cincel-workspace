/**
 * The monday import wizard's server side (#672) over the migration CLI in
 * scripts/monday, used as a library: the same export, init (draftMapping),
 * plan (buildPlan), apply and rollback code the CLI runs, against an export
 * folder per run (./runs.ts). No translation logic lives here.
 *
 * Token rule (same as scripts/monday/token.ts): the monday token comes from
 * the caller for one call (Conectar, export) or from MONDAY_TOKEN; it is
 * handed to the monday client only and never stored, logged or returned.
 *
 * Every function takes its DB (any drizzle client over the full schema) and
 * optional fakes, so tests run it without Next. Errors meant for the wizard
 * are thrown as `WizardError` with Spanish copy.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  appSettings,
  contacts,
  importBatches,
  positionPhases,
  positions,
  projects,
  providerSubtype,
  staff,
  taskStatuses,
  workflowPhases,
  workflows,
  workflowTaskTemplates,
} from "@/lib/db/schema";
import type { DriveAdmin } from "@/lib/google/drive-admin";
import type { ImportDb } from "@/lib/import/refs";
import {
  mondayPeopleByItem,
  personTaskPlacements,
  suggestPositionFrom,
  type PositionSuggestionCatalog,
} from "@/lib/monday-import/people";
import { buildPreview } from "@/lib/monday-import/preview";
import {
  createRun,
  importRoot,
  jobView,
  latestRun,
  readDraftMapping,
  readRun,
  runDir,
  startJob,
  UNEXPECTED_JOB_ERROR,
  updateRun,
  writeDraftMapping,
  type StoredRun,
} from "@/lib/monday-import/runs";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type {
  MappingInput,
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportedProject,
  MondayImportJob,
  MondayImportOptionsInfo,
  MondayImportRunState,
  MondayImportStep,
  MondayPositionSuggestion,
  MondayPreview,
  MondayRollbackCheck,
} from "@/lib/types/monday-import";
import { createApplyCommand, type PhaseB } from "@/scripts/monday/apply";
import { createMondayClient, MondayApiError, type MondayClient } from "@/scripts/monday/client";
import { keepVerifiedCreatedStaff } from "@/scripts/monday/created-staff";
import type { MondayDbHandle } from "@/scripts/monday/db";
import {
  DONE_FILE,
  estimateCalls,
  fetchAllBoards,
  fetchAllWorkspaces,
  FILES_DIR,
  FILES_INDEX,
  pageSizeFor,
  runExport,
  subitemBoardIds,
} from "@/scripts/monday/export";
import { createDbLookups, draftMapping, readExport, readJson, statusLabels, type InitLookups } from "@/scripts/monday/init";
import {
  Mapping,
  MondayStatusMap as MondayStatusMapSchema,
  statusLabelKey,
  type MondayStatusMap,
} from "@/scripts/monday/mapping.schema";
import {
  buildPlan,
  checkDriveConfigured,
  createPlanDbLookups,
  readPlanExport,
  type PlanLookups,
} from "@/scripts/monday/plan";
import { MeDocument } from "@/scripts/monday/queries";
import { createRollbackCommand, findRollbackBlockers, openServiceAccountDrive } from "@/scripts/monday/rollback";
import { TOKEN_ENV } from "@/scripts/monday/token";

import { importedProjectHref } from "./links";
import { parseStoredStatusMap, STATUS_MAP_SETTING_KEY, statusMapCustomIds } from "./status-map";

type Env = Record<string, string | undefined>;

/** An error the wizard shows inline, in Spanish. */
export class WizardError extends Error {}

export interface WizardDeps {
  db: ImportDb;
  env?: Env;
  /** The monday client for a token; the real API by default. */
  createClient?: (token: string) => MondayClient;
  /** Drive for the files check, phase B and the rollback; the env service account by default. */
  openDrive?: () => DriveAdmin;
  /** Phase B of apply; the CLI's by default. */
  phaseB?: PhaseB;
  /** init / plan lookups; the DB ones by default. */
  initLookups?: (db: ImportDb) => InitLookups;
  planLookups?: (db: ImportDb) => PlanLookups;
  /** The saved firm-wide status map; `readSavedStatusMap` (app_settings) by default. */
  savedStatusMap?: (db: ImportDb) => Promise<MondayStatusMap>;
  /** Puestos with candidate fases and the fase and tramo names, for the puesto suggestion; the DB ones by default. */
  positionCatalog?: (db: ImportDb) => Promise<PositionSuggestionCatalog>;
}

const STEPS: readonly MondayImportStep[] = [
  "conectar",
  "tableros",
  "equivalencias",
  "personas",
  "opciones",
  "vista_previa",
  "importar",
];
export const isStep = (value: unknown): value is MondayImportStep => STEPS.includes(value as MondayImportStep);

const envOf = (deps: WizardDeps) => deps.env ?? process.env;

/** The handle the CLI commands open; the wizard's DB is shared, so closing is a no-op. */
const handleOf = (db: ImportDb): MondayDbHandle => ({ db, close: async () => {} }) as unknown as MondayDbHandle;

// ---------------------------------------------------------------------------
// Token and Conectar
// ---------------------------------------------------------------------------

/** The token typed in the wizard, else MONDAY_TOKEN; null when neither is set. */
export function resolveWizardToken(
  input: string | null | undefined,
  env: Env = process.env,
): { token: string; source: "input" | "env" } | null {
  const typed = typeof input === "string" ? input.trim() : "";
  if (typed) return { token: typed, source: "input" };
  const fromEnv = env[TOKEN_ENV]?.trim();
  return fromEnv ? { token: fromEnv, source: "env" } : null;
}

/** Whether MONDAY_TOKEN is set on the server (the wizard can skip the token field). */
export const hasServerToken = (env: Env = process.env) => Boolean(env[TOKEN_ENV]?.trim());

function clientFor(token: string, deps: WizardDeps): MondayClient {
  return (deps.createClient ?? ((t) => createMondayClient({ token: t })))(token);
}

/** monday errors in wizard words; never echoes the token. */
function mondayError(err: unknown): WizardError {
  if (err instanceof MondayApiError) {
    if (err.status === 401 || err.status === 403 || /unauthorized|invalid_token/i.test(err.code ?? ""))
      return new WizardError("monday rechazó el token. Revisa que sea un token personal vigente.");
    return new WizardError(`monday respondió con un error: ${err.message}`);
  }
  return new WizardError("No se pudo conectar con monday. Intenta de nuevo.");
}

/**
 * Paso 1: tests the token with `me`, then lists the workspaces and the boards
 * with their item counts and the call estimate (§4.3).
 */
export async function connectMonday(tokenInput: string | null | undefined, deps: WizardDeps): Promise<MondayConnection> {
  const resolved = resolveWizardToken(tokenInput, envOf(deps));
  if (!resolved) throw new WizardError("Escribe el token de monday.");
  const client = clientFor(resolved.token, deps);
  try {
    const me = (await client.request(MeDocument, {})).me;
    if (!me) throw new WizardError("El token no tiene usuario en monday.");
    const [boards, workspaces] = await Promise.all([fetchAllBoards(client), fetchAllWorkspaces(client)]);
    const wsName = new Map(workspaces.map((w) => [String(w.id), w.name]));
    const perBoard = (b: (typeof boards)[number]) =>
      estimateCalls({
        totalBoards: 0,
        boards: [{ items_count: b.items_count ?? null, pageSize: pageSizeFor(b) }],
        subitemBoards: 0,
        updates: true,
        files: false,
      });
    const all = estimateCalls({
      totalBoards: boards.length,
      boards: boards.map((b) => ({ items_count: b.items_count ?? null, pageSize: pageSizeFor(b) })),
      subitemBoards: new Set(boards.flatMap((b) => subitemBoardIds(b))).size,
      updates: true,
      files: true,
    });
    return {
      account: { id: me.account.id, slug: me.account.slug, name: me.account.name },
      tokenUser: { name: me.name, email: me.email },
      tokenSource: resolved.source,
      workspaces: workspaces.map((w) => ({ id: String(w.id), name: w.name })),
      boards: boards.map((b) => {
        const e = perBoard(b);
        return {
          id: b.id,
          name: b.name,
          workspaceId: b.workspace_id ? String(b.workspace_id) : null,
          workspaceName: b.workspace_id ? (wsName.get(String(b.workspace_id)) ?? null) : null,
          itemsCount: b.items_count ?? null,
          hierarchyType: b.hierarchy_type ?? null,
          estimatedCalls: e.items + e.updates,
        };
      }),
      estimatedCalls: all.total,
    };
  } catch (err) {
    if (err instanceof WizardError) throw err;
    throw mondayError(err);
  }
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export const NOT_WRITABLE = "La carpeta de importación no tiene permisos de escritura.";

/** File system codes meaning the import folder can't be created or written. */
const NOT_WRITABLE_CODES = new Set(["EACCES", "EPERM", "EROFS"]);
/** Folders already logged as not writable, so each one is logged once. */
const loggedNotWritable = new Set<string>();

/** A permission error on the import folder as a WizardError, logging its path once; anything else as is. */
export function folderError(err: unknown, env: Env = process.env): unknown {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (!code || !NOT_WRITABLE_CODES.has(code)) return err;
  const root = importRoot(env);
  if (!loggedNotWritable.has(root)) {
    loggedNotWritable.add(root);
    console.error(`[monday-import] import folder not writable (${code}): ${root}; set MONDAY_IMPORT_DIR`);
  }
  return new WizardError(NOT_WRITABLE);
}

/** The on-screen error of a job whose body threw: a WizardError's own text, else a fixed Spanish message. */
function jobError(env: Env): (err: unknown) => string {
  return (err) => {
    const mapped = folderError(err, env);
    return mapped instanceof WizardError ? mapped.message : UNEXPECTED_JOB_ERROR;
  };
}

/** The newest run, or a new one when there is none (or `fresh`). */
export async function openRun(staffId: string, deps: WizardDeps, fresh = false): Promise<StoredRun> {
  const env = envOf(deps);
  try {
    const latest = fresh ? null : await latestRun(env);
    return latest ?? (await createRun(staffId, env));
  } catch (err) {
    throw folderError(err, env);
  }
}

async function requireRun(runId: string, deps: WizardDeps): Promise<StoredRun> {
  const run = await readRun(runId, envOf(deps));
  if (!run) throw new WizardError("No se encontró esta importación. Vuelve a empezar desde Conectar monday.");
  return run;
}

/** The latest import batch apply created from the run's folder. */
export async function runBatch(
  db: ImportDb,
  dir: string,
): Promise<{ id: string; status: "applying" | "applied" | "rolled_back" } | null> {
  const [row] = await db
    .select({ id: importBatches.id, status: importBatches.status })
    .from(importBatches)
    .where(and(eq(importBatches.source, "monday"), eq(importBatches.exportPath, dir)))
    .orderBy(desc(importBatches.appliedAt))
    .limit(1);
  return row ?? null;
}

function exportedAll(dir: string, boardIds: readonly string[]): boolean {
  return boardIds.length > 0 && boardIds.every((id) => existsSync(join(dir, "boards", id, DONE_FILE)));
}

/** Upload progress of an `applying` batch from its `import_files`. */
async function uploadProgress(db: ImportDb, batchId: string): Promise<{ done: number; total: number }> {
  const [row] = (await db.execute(
    sql`select count(*)::int as total, count(*) filter (where drive_file_id is not null)::int as done
          from core.import_files where batch_id = ${batchId}`,
  )) as unknown as { total: number; done: number }[];
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}

/** The polling payload: state, draft mapping and each job as it is now. */
export async function getRunState(runId: string, deps: WizardDeps): Promise<MondayImportRunState> {
  const run = await requireRun(runId, deps);
  const env = envOf(deps);
  const dir = runDir(run.runId, env);
  const batch = await runBatch(deps.db, dir);
  const jobs: MondayImportRunState["jobs"] = {};
  for (const kind of ["export", "apply", "rollback"] as const) {
    const job = jobView(run, kind);
    if (job) jobs[kind] = job;
  }
  const apply = jobs.apply;
  if (apply?.status === "running" && batch?.status === "applying") {
    const files = await uploadProgress(deps.db, batch.id);
    if (files.total > 0) apply.progress = { ...files, label: "Subiendo archivos a Drive" };
  }
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    step: run.step,
    account: run.account,
    boardIds: run.boardIds,
    exportOptions: run.exportOptions,
    exported: exportedAll(dir, run.boardIds),
    mapping: await readDraftMapping(run.runId, env),
    jobs,
    batchId: batch?.id ?? run.batchId,
    batchStatus: batch?.status ?? null,
  };
}

export async function saveStep(runId: string, step: MondayImportStep, deps: WizardDeps): Promise<void> {
  await requireRun(runId, deps);
  await updateRun(runId, (r) => {
    r.step = step;
  }, envOf(deps));
}

// ---------------------------------------------------------------------------
// Export (background) + init
// ---------------------------------------------------------------------------

export interface StartExportInput {
  boardIds: string[];
  updates?: boolean;
  files?: boolean;
}

/**
 * Merges a fresh init draft into the admin's draft: boards and people the
 * admin already mapped keep their values, new ones come from init, boards
 * no longer picked are dropped.
 */
export function mergeDraft(existing: MappingInput | null, drafted: MappingInput, boardIds: readonly string[]): MappingInput {
  const picked = new Set(boardIds);
  if (!existing) return { ...drafted, boards: drafted.boards.filter((b) => picked.has(b.mondayBoardId)) };
  const kept = new Map(existing.boards.map((b) => [b.mondayBoardId, b]));
  return {
    version: 2,
    boards: drafted.boards
      .filter((b) => picked.has(b.mondayBoardId))
      .map((b) => kept.get(b.mondayBoardId) ?? b),
    people: { ...drafted.people, ...existing.people },
    options: {
      ...(existing.options ?? drafted.options),
      // what the current export skipped can't be imported, whatever the old draft said
      ...(drafted.options.includeFiles === false ? { includeFiles: false } : {}),
      ...(drafted.options.includeUpdates === false ? { includeUpdates: false } : {}),
    },
    // The saved firm-wide map plus defaults for this export's labels; preview and apply read the saved setting.
    statusMap: drafted.statusMap ?? {},
  };
}

/** Runs init over the run's export (only the picked boards) and saves the merged draft. */
export async function draftRunMapping(run: StoredRun, deps: WizardDeps): Promise<MappingInput> {
  const env = envOf(deps);
  const dir = runDir(run.runId, env);
  const data = await readExport(dir);
  const picked = new Set(run.boardIds);
  data.boards = data.boards.filter((b) => picked.has(b.board.id));
  const drafted = (await draftMapping(data, (deps.initLookups ?? createDbLookups)(deps.db))) as MappingInput;
  if (!run.exportOptions.files) drafted.options = { ...drafted.options, includeFiles: false };
  if (!run.exportOptions.updates) drafted.options = { ...drafted.options, includeUpdates: false };
  const merged = mergeDraft(await readDraftMapping(run.runId, env), drafted, run.boardIds);
  await writeDraftMapping(run.runId, merged, env);
  return merged;
}

/**
 * Starts the export of the picked boards in the background; when it finishes,
 * init drafts (or extends) mapping.json. A finished board is not exported
 * again, so starting it again resumes an interrupted export.
 */
export async function startExport(
  runId: string,
  tokenInput: string | null | undefined,
  input: StartExportInput,
  deps: WizardDeps,
): Promise<MondayImportJob> {
  const run = await requireRun(runId, deps);
  const env = envOf(deps);
  const boardIds = [...new Set((input.boardIds ?? []).map(String))].filter((id) => /^\d+$/.test(id));
  if (boardIds.length === 0) throw new WizardError("Elige al menos un tablero.");
  const resolved = resolveWizardToken(tokenInput, env);
  if (!resolved) throw new WizardError("Escribe el token de monday.");
  if (run.batchId) throw new WizardError("Esta importación ya se aplicó. Empieza una nueva para exportar otra vez.");
  const options = { updates: input.updates !== false, files: input.files !== false };
  await updateRun(runId, (r) => {
    r.boardIds = boardIds;
    r.exportOptions = options;
    r.step = "tableros";
  }, env);

  const client = clientFor(resolved.token, deps);
  const dir = runDir(runId, env);
  try {
    return startJob(
      runId,
      "export",
      "Exportando tableros",
      async ({ io, progress, note }) => {
        let code: number;
        try {
          code = await runExport(
            { out: dir, boards: boardIds, updates: options.updates, files: options.files },
            {
              client,
              io,
              confirm: async () => true,
              onProgress: (p) => progress(p.boardsDone, p.boardsTotal, "Exportando tableros"),
            },
          );
        } catch (err) {
          return mondayError(err).message;
        }
        if (code !== 0) return "La exportación se detuvo. Revisa el registro y vuelve a intentarlo; los tableros terminados no se exportan otra vez.";
        progress(boardIds.length, boardIds.length, "Preparando equivalencias");
        const account = await readManifestAccount(dir);
        const latest = await updateRun(runId, (r) => {
          if (account) r.account = account;
          r.step = "tableros";
        }, env);
        await draftRunMapping(latest, deps);
        note("Equivalencias preparadas a partir de la exportación.");
        progress(boardIds.length, boardIds.length, "Exportación terminada");
        return null;
      },
      env,
      jobError(env),
    );
  } catch (err) {
    if (err instanceof Error && err.message === "JOB_RUNNING") throw new WizardError("Ya hay un proceso en curso en esta importación.");
    throw err;
  }
}

async function readManifestAccount(dir: string): Promise<StoredRun["account"]> {
  const manifest = await readJson<{ account?: { id: string; slug: string; name: string } }>(join(dir, "manifest.json"));
  return manifest?.account ? { id: manifest.account.id, slug: manifest.account.slug, name: manifest.account.name } : null;
}

// ---------------------------------------------------------------------------
// Equivalencias
// ---------------------------------------------------------------------------

/** Active items and subitems per status column and label: `${columnId}\0${statusLabelKey(label)}` → count. */
function statusLabelCounts(items: readonly unknown[]): Map<string, number> {
  const out = new Map<string, number>();
  const active = (row: unknown) => {
    const state = (row as { state?: unknown } | null)?.state;
    return row != null && (state == null || state === "active");
  };
  const visit = (row: unknown) => {
    for (const value of (row as { column_values?: unknown[] } | null)?.column_values ?? []) {
      const v = value as { __typename?: string; id?: string; label?: string | null } | null;
      if (v?.__typename !== "StatusValue" || !v.id || !v.label) continue;
      const key = `${v.id}\u0000${statusLabelKey(v.label)}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  };
  for (const item of items) {
    if (!active(item)) continue;
    visit(item);
    for (const sub of (item as { subitems?: unknown[] | null }).subitems ?? []) if (active(sub)) visit(sub);
  }
  return out;
}

/** monday people in the people columns of the active items and subitems, in first-seen order (#685). */
function boardPeople(items: Awaited<ReturnType<typeof readExport>>["boards"][number]["items"]): string[] {
  const out = new Set<string>();
  const visit = (row: unknown) => {
    const values = (row as { column_values?: unknown[] } | null)?.column_values ?? [];
    for (const value of values) {
      const v = value as { __typename?: string; persons_and_teams?: { id: string; kind?: string | null }[] | null };
      if (v?.__typename !== "PeopleValue") continue;
      for (const p of v.persons_and_teams ?? []) if (p.kind === "person") out.add(String(p.id));
    }
  };
  const active = (row: unknown) => {
    const state = (row as { state?: unknown } | null)?.state;
    return row != null && (state == null || state === "active");
  };
  for (const item of items) {
    if (!active(item)) continue;
    visit(item);
    for (const sub of (item as { subitems?: unknown[] | null }).subitems ?? []) if (active(sub)) visit(sub);
  }
  return [...out];
}

/** Paso 2–4 source side: every board's columns, groups, status labels and the monday users. */
export async function getExportSource(runId: string, deps: WizardDeps): Promise<MondayExportSource> {
  const run = await requireRun(runId, deps);
  const dir = runDir(run.runId, envOf(deps));
  if (!existsSync(join(dir, "manifest.json"))) throw new WizardError("Primero exporta los tableros.");
  const data = await readExport(dir);
  const picked = new Set(run.boardIds);
  // An item and a subitem column can share an id; init maps the union of their labels, so the source lists it too.
  const labelsOf = (cols: { id: string; type: string; title: string; settings: unknown }[], items: readonly unknown[]) => {
    const counts = statusLabelCounts(items);
    const out: Record<string, { id: string; name: string; isDone: boolean; items: number }[]> = {};
    for (const c of cols) {
      if (c.type !== "status") continue;
      const list = (out[c.id] ??= []);
      for (const l of statusLabels(c)) {
        if (list.some((x) => x.id === l.id)) continue;
        list.push({ id: l.id, name: l.label, isDone: l.isDone, items: counts.get(`${c.id}\u0000${statusLabelKey(l.label)}`) ?? 0 });
      }
    }
    return out;
  };
  const plain = (cols: { id: string; type: string; title: string }[]) =>
    cols.map((c) => ({ id: c.id, title: c.title, type: c.type }));
  return {
    boards: data.boards
      .filter((b) => picked.has(b.board.id))
      .map(({ board, items }) => ({
        id: board.id,
        name: board.name,
        columns: plain(board.columns),
        subitemColumns: plain(board.subitem_columns ?? []),
        groups: board.groups.map((g) => ({ id: g.id, title: g.title })),
        statusLabels: labelsOf([...board.columns, ...(board.subitem_columns ?? [])], items),
        itemCount: items.length,
        items: items
          .filter((i) => i.state == null || i.state === "active")
          .map((i) => ({ id: i.id, name: i.name, groupId: i.group?.id ?? null })),
        userIds: boardPeople(items),
      })),
    users: data.users.map((u) => ({ id: u.id, name: u.name, email: u.email ?? null, kind: u.kind ?? null })),
    hasFiles: existsSync(join(dir, FILES_DIR, FILES_INDEX)),
    hasUpdates: run.exportOptions.updates,
  };
}

/** The Cincel side of every Equivalencias select (project flow FE §7.8): tramos with fases, puestos, saved status map. */
export async function getImportChoices(db: ImportDb): Promise<MondayImportChoices> {
  const [statusRows, workflowRows, phaseRows, templateRows, positionRows, positionPhaseRows, clientRows, staffRows, statusMap] =
    await Promise.all([
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
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
        .orderBy(asc(workflows.sortOrder), asc(workflows.name)),
      db
        .select({
          id: workflowPhases.id,
          workflowId: workflowPhases.workflowId,
          name: workflowPhases.name,
          sortOrder: workflowPhases.sortOrder,
        })
        .from(workflowPhases)
        .where(eq(workflowPhases.active, true))
        .orderBy(asc(workflowPhases.workflowId), asc(workflowPhases.sortOrder), asc(workflowPhases.name)),
      db
        .select({
          id: workflowTaskTemplates.id,
          workflowId: workflowTaskTemplates.workflowId,
          phaseId: workflowTaskTemplates.phaseId,
          name: workflowTaskTemplates.title,
        })
        .from(workflowTaskTemplates)
        .where(and(eq(workflowTaskTemplates.active, true), isNotNull(workflowTaskTemplates.phaseId)))
        .orderBy(asc(workflowTaskTemplates.workflowId), asc(workflowTaskTemplates.sortOrder)),
      db
        .select({ id: positions.id, name: positions.name })
        .from(positions)
        .where(and(isNull(positions.deletedAt), eq(positions.active, true)))
        .orderBy(asc(positions.sortOrder), asc(positions.name)),
      db.select({ positionId: positionPhases.positionId, phaseId: positionPhases.phaseId }).from(positionPhases),
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
      readSavedStatusMap(db),
    ]);
  const phasesOf = new Map<string, { id: string; name: string; sortOrder: number }[]>();
  for (const p of phaseRows)
    phasesOf.set(p.workflowId, [...(phasesOf.get(p.workflowId) ?? []), { id: p.id, name: p.name, sortOrder: p.sortOrder }]);
  const candidates = new Map<string, string[]>();
  for (const r of positionPhaseRows) candidates.set(r.positionId, [...(candidates.get(r.positionId) ?? []), r.phaseId]);
  return {
    statuses: statusRows,
    workflows: workflowRows.map((w) => ({ ...w, phases: phasesOf.get(w.id) ?? [] })),
    templates: templateRows.flatMap((t) => (t.phaseId ? [{ ...t, phaseId: t.phaseId }] : [])),
    positions: positionRows.map((p) => ({ ...p, phaseIds: candidates.get(p.id) ?? [] })),
    clients: clientRows,
    staff: staffRows,
    providerSubtypes: [...providerSubtype.enumValues],
    statusMap,
  };
}

// ---------------------------------------------------------------------------
// Firm-wide status map (project flow BE §7.8, RD-5)
// ---------------------------------------------------------------------------

/** The saved firm-wide status map (app_settings `monday.status_map`); empty when none is saved. */
export async function readSavedStatusMap(db: ImportDb): Promise<MondayStatusMap> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, STATUS_MAP_SETTING_KEY));
  return parseStoredStatusMap(row?.value ?? null);
}

/**
 * Saves the whole firm-wide map, keyed by `statusLabelKey(label)`, and returns what was stored. Every later import
 * reads it, so labels saved once aren't asked again. Throws `WizardError("STATUS_NOT_FOUND")` when an entry points at
 * a custom status that doesn't exist (or was deleted).
 */
export async function saveStatusMap(db: ImportDb, map: unknown): Promise<MondayStatusMap> {
  const parsed = MondayStatusMapSchema.safeParse(map);
  if (!parsed.success) throw new WizardError("El mapa de estatus no tiene un formato válido.");
  const entries: MondayStatusMap = {};
  for (const [label, entry] of Object.entries(parsed.data)) {
    const key = statusLabelKey(label);
    if (key) entries[key] = entry;
  }
  const ids = statusMapCustomIds(entries);
  if (ids.length > 0) {
    const found = await db
      .select({ id: taskStatuses.id })
      .from(taskStatuses)
      .where(and(inArray(taskStatuses.id, ids), isNull(taskStatuses.deletedAt)));
    const live = new Set(found.map((r) => r.id));
    if (ids.some((id) => !live.has(id))) throw new WizardError("STATUS_NOT_FOUND");
  }
  const value = JSON.stringify(entries);
  await db
    .insert(appSettings)
    .values({ key: STATUS_MAP_SETTING_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return entries;
}

/** The draft with the saved firm-wide map as its `statusMap`: what preview and apply translate with. */
async function withSavedStatusMap(deps: WizardDeps, mapping: MappingInput): Promise<MappingInput> {
  return { ...mapping, statusMap: await (deps.savedStatusMap ?? readSavedStatusMap)(deps.db) };
}

/** Zod issues as "path: message" lines. */
export function mappingIssues(raw: unknown): string[] {
  const parsed = Mapping.safeParse(raw);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`);
}

/** The staff ids this run's "Crear integrante" made, kept server side (#689). */
const createdStaffOf = (run: StoredRun): ReadonlySet<string> => new Set(run.createdStaffIds ?? []);

/** Remembers a staff member "Crear integrante" made for the run, so its mapping may mark them `created`. */
export async function recordCreatedStaff(runId: string, staffId: string, deps: WizardDeps): Promise<void> {
  await updateRun(runId, (r) => {
    r.createdStaffIds = [...new Set([...(r.createdStaffIds ?? []), staffId])];
  }, envOf(deps));
}

/**
 * Saves the draft (even an incomplete one, so the wizard resumes where the
 * admin left it) and returns what `mapping.schema.ts` still rejects.
 */
export async function saveDraft(
  runId: string,
  mapping: unknown,
  step: MondayImportStep | null,
  deps: WizardDeps,
): Promise<{ issues: string[] }> {
  const run = await requireRun(runId, deps);
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    throw new WizardError("Las equivalencias no tienen un formato válido.");
  const env = envOf(deps);
  await writeDraftMapping(runId, keepVerifiedCreatedStaff(mapping, createdStaffOf(run)), env);
  if (step) await saveStep(runId, step, deps);
  return { issues: mappingIssues(mapping) };
}

/** mapping.json download, the same file the CLI reads. */
export async function downloadDraft(runId: string, deps: WizardDeps): Promise<{ fileName: string; content: string }> {
  await requireRun(runId, deps);
  const mapping = await readDraftMapping(runId, envOf(deps));
  if (!mapping) throw new WizardError("Todavía no hay equivalencias: primero exporta los tableros.");
  return { fileName: "mapping.json", content: `${JSON.stringify(mapping, null, 2)}\n` };
}

/** mapping.json upload: replaces the draft only when it parses and validates. */
export async function uploadDraft(runId: string, text: string, deps: WizardDeps): Promise<{ issues: string[] }> {
  const run = await requireRun(runId, deps);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { issues: ["El archivo no es JSON válido."] };
  }
  const issues = mappingIssues(raw);
  if (issues.length > 0) return { issues };
  await writeDraftMapping(runId, keepVerifiedCreatedStaff(raw, createdStaffOf(run)), envOf(deps));
  return { issues: [] };
}

// ---------------------------------------------------------------------------
// Opciones and Vista previa
// ---------------------------------------------------------------------------

const DRIVE_DISABLED = "Drive no está configurado; los archivos no se pueden importar.";

/** Paso 5: why "Incluir archivos" / "Incluir bitácora" are disabled, if they are. */
export async function getOptionsInfo(runId: string, deps: WizardDeps): Promise<MondayImportOptionsInfo> {
  return optionsInfoFor(await requireRun(runId, deps), deps);
}

async function optionsInfoFor(run: StoredRun, deps: WizardDeps): Promise<MondayImportOptionsInfo> {
  let filesDisabledReason: string | null = null;
  if (!run.exportOptions.files) filesDisabledReason = "Los archivos no se exportaron de monday.";
  else {
    const drive = await checkDriveConfigured(deps.openDrive ?? openServiceAccountDrive, envOf(deps));
    if (drive) filesDisabledReason = DRIVE_DISABLED;
  }
  return {
    filesDisabledReason,
    updatesDisabledReason: run.exportOptions.updates ? null : "La bitácora no se exportó de monday.",
  };
}

/**
 * Opciones shows a disabled switch as off; this stores that in the draft so
 * the plan doesn't block on an option the admin can't turn off.
 */
async function enforceDisabledOptions(run: StoredRun, mapping: MappingInput, deps: WizardDeps): Promise<MappingInput> {
  const info = await optionsInfoFor(run, deps);
  const options = { ...mapping.options };
  if (info.filesDisabledReason && options.includeFiles !== false) options.includeFiles = false;
  if (info.updatesDisabledReason && options.includeUpdates !== false) options.includeUpdates = false;
  if (options.includeFiles === mapping.options.includeFiles && options.includeUpdates === mapping.options.includeUpdates)
    return mapping;
  const next = { ...mapping, options };
  await writeDraftMapping(run.runId, next, envOf(deps));
  return next;
}

/** The plan dry run of a run's draft, translated with the saved firm-wide status map (what apply will use). */
async function planRun(run: StoredRun, importedById: string | undefined, deps: WizardDeps) {
  const env = envOf(deps);
  const dir = runDir(run.runId, env);
  const stored = await readDraftMapping(run.runId, env);
  if (!stored) throw new WizardError("Todavía no hay equivalencias: primero exporta los tableros.");
  const mapping = await withSavedStatusMap(deps, await enforceDisabledOptions(run, stored, deps));
  const { data } = await readPlanExport(dir);
  const lookups = (deps.planLookups ?? createPlanDbLookups)(deps.db);
  const plan = await buildPlan(data, mapping, lookups, {
    fileExists: (localPath) => existsSync(join(dir, localPath)),
    checkDrive: () => checkDriveConfigured(deps.openDrive ?? openServiceAccountDrive, env),
    ...(importedById ? { importedById } : {}),
  });
  return { plan, data, lookups, mapping };
}

/** Paso 6: the plan dry run as counts, issues and sample items. */
export async function previewImport(runId: string, importedById: string, deps: WizardDeps): Promise<MondayPreview> {
  const run = await requireRun(runId, deps);
  const { plan, data, lookups } = await planRun(run, importedById, deps);
  const names = await lookups.translateLookups();
  return buildPreview(plan, data, names);
}

// ---------------------------------------------------------------------------
// Puesto suggestion for "Crear integrante" (project flow BE §10.8)
// ---------------------------------------------------------------------------

/** Live, active puestos with their candidate fases, and the fase and tramo names the suggestion shows. */
export async function suggestionCatalog(db: ImportDb): Promise<PositionSuggestionCatalog> {
  const [positionRows, candidateRows, phaseRows, workflowRows] = await Promise.all([
    db
      .select({ id: positions.id, name: positions.name, sortOrder: positions.sortOrder })
      .from(positions)
      .where(and(isNull(positions.deletedAt), eq(positions.active, true)))
      .orderBy(asc(positions.sortOrder), asc(positions.name)),
    db.select({ positionId: positionPhases.positionId, phaseId: positionPhases.phaseId }).from(positionPhases),
    db
      .select({
        id: workflowPhases.id,
        workflowId: workflowPhases.workflowId,
        name: workflowPhases.name,
        sortOrder: workflowPhases.sortOrder,
      })
      .from(workflowPhases),
    db.select({ id: workflows.id, name: workflows.name, sortOrder: workflows.sortOrder }).from(workflows),
  ]);
  const phaseIds = new Map<string, string[]>();
  for (const r of candidateRows) phaseIds.set(r.positionId, [...(phaseIds.get(r.positionId) ?? []), r.phaseId]);
  return {
    positions: positionRows.map((p) => ({ ...p, phaseIds: phaseIds.get(p.id) ?? [] })),
    phases: Object.fromEntries(phaseRows.map((p) => [p.id, { workflowId: p.workflowId, name: p.name, sortOrder: p.sortOrder }])),
    workflows: Object.fromEntries(workflowRows.map((w) => [w.id, { name: w.name, sortOrder: w.sortOrder }])),
  };
}

/**
 * "Crear integrante": the puesto suggested by where a monday person's tasks land in this import. Translates the run
 * as the Vista previa does, takes the tasks where the person is manager or support, counts them per resolved fase and
 * scores each live, active puesto by the tasks in its candidate fases (BE §10.8).
 */
export async function suggestPosition(
  runId: string,
  mondayUserId: string,
  deps: WizardDeps,
): Promise<MondayPositionSuggestion> {
  const run = await requireRun(runId, deps);
  const { plan, data, mapping } = await planRun(run, undefined, deps);
  const tasks = plan.translation?.result.tasks ?? [];
  const support = new Set((plan.translation?.result.taskSupport ?? []).map((s) => s.externalId));
  const person = mapping.people?.[mondayUserId];
  const placements = personTaskPlacements(tasks, mondayUserId, {
    staffId: person && person.action === "staff" ? person.staffId : null,
    supportKeys: support,
    peopleByItem: mondayPeopleByItem(data.boards.flatMap((b) => b.items)),
  });
  return suggestPositionFrom(placements, await (deps.positionCatalog ?? suggestionCatalog)(deps.db));
}

// ---------------------------------------------------------------------------
// Apply (background), result, rollback
// ---------------------------------------------------------------------------

/**
 * Paso 7: runs `apply` in the background as `by` (an active staff email). A
 * run whose batch is still `applying` resumes phase B. The plan runs again
 * inside apply, so a blocking issue fails the job without writing anything.
 * `onApplied` runs once the import succeeds (the action marks the admin's first-login wizard as finished).
 */
export async function startApply(
  runId: string,
  by: { email: string },
  deps: WizardDeps,
  onApplied?: () => Promise<void>,
): Promise<MondayImportJob> {
  const run = await requireRun(runId, deps);
  const env = envOf(deps);
  const dir = runDir(run.runId, env);
  const batch = await runBatch(deps.db, dir);
  if (batch?.status === "applied") throw new WizardError("Esta importación ya se aplicó.");
  const draft = await readDraftMapping(run.runId, env);
  if (!draft) throw new WizardError("Todavía no hay equivalencias.");
  // The batch's mapping is what rollback reads: only staff this run created may stay marked `created`.
  const stored = keepVerifiedCreatedStaff(draft, createdStaffOf(run));
  if (stored !== draft) await writeDraftMapping(run.runId, stored, env);
  await enforceDisabledOptions(run, stored, deps);
  if (!by.email) throw new WizardError("Tu cuenta no tiene correo; no se puede registrar quién importó.");
  const command = createApplyCommand({
    openDb: () => handleOf(deps.db),
    openDrive: deps.openDrive,
    env: deps.env,
    phaseB: deps.phaseB,
  });
  await saveStep(runId, "importar", deps);
  try {
    return startJob(
      runId,
      "apply",
      "Importando a Cincel",
      async ({ io, progress }) => {
        // Snapshot of the saved firm-wide status map, right before apply: the batch records what was used.
        const latest = await readDraftMapping(run.runId, env);
        if (latest) await writeDraftMapping(run.runId, await withSavedStatusMap(deps, latest), env);
        const code = await command(["--export", dir, "--by", by.email], io);
        const created = await runBatch(deps.db, dir);
        if (created) await updateRun(runId, (r) => {
          r.batchId = created.id;
        }, env);
        if (code !== 0)
          return created?.status === "applying"
            ? "Los datos se importaron pero faltan archivos por subir a Drive. Revisa el registro y vuelve a intentarlo."
            : "La importación no se aplicó. Revisa el registro.";
        progress(1, 1, "Importación terminada");
        if (onApplied) {
          try {
            await onApplied();
          } catch {
            io.stderr("No se pudo marcar el asistente como terminado; usa «Ir al tablero».");
          }
        }
        return null;
      },
      env,
      jobError(env),
    );
  } catch (err) {
    if (err instanceof Error && err.message === "JOB_RUNNING") throw new WizardError("Ya hay un proceso en curso en esta importación.");
    throw err;
  }
}

/** The projects the run's batch created, for the links at the end. */
export async function importedProjects(runId: string, deps: WizardDeps): Promise<MondayImportedProject[]> {
  const run = await requireRun(runId, deps);
  const batch = await runBatch(deps.db, runDir(run.runId, envOf(deps)));
  if (!batch || batch.status === "rolled_back") return [];
  const rows = (await deps.db.execute(
    sql`select p.id::text as id, p.name, r.data->'source'->>'boardId' as "boardId" from core.import_refs r
          join ${projects} p on p.id = r.row_id
          where r.batch_id = ${batch.id} and r.entity = 'project' and p.deleted_at is null
          order by p.name`,
  )) as unknown as { id: string; name: string; boardId: string | null }[];
  return rows.map((r) => ({ id: r.id, name: r.name, href: importedProjectHref(r.id), boardId: r.boardId ?? null }));
}

/** What blocks "Deshacer importación" (§9), read-only. */
export async function checkRollback(runId: string, deps: WizardDeps): Promise<MondayRollbackCheck> {
  const run = await requireRun(runId, deps);
  const batch = await runBatch(deps.db, runDir(run.runId, envOf(deps)));
  if (!batch) throw new WizardError("Esta importación todavía no se aplicó.");
  if (batch.status === "rolled_back") throw new WizardError("Esta importación ya se deshizo.");
  const blockers = await findRollbackBlockers(deps.db, batch.id);
  return { batchId: batch.id, canRollback: blockers.length === 0, blockers };
}

/** Runs `rollback` for the run's batch in the background. */
export async function startRollback(runId: string, deps: WizardDeps): Promise<MondayImportJob> {
  const check = await checkRollback(runId, deps);
  if (!check.canRollback)
    throw new WizardError("No se puede deshacer: hay cambios hechos en Cincel sobre lo importado.");
  const command = createRollbackCommand({ openDb: () => handleOf(deps.db), openDrive: deps.openDrive });
  try {
    return startJob(
      runId,
      "rollback",
      "Deshaciendo importación",
      async ({ io, progress }) => {
        const code = await command(["--batch", check.batchId], io);
        if (code === 0) {
          progress(1, 1, "Importación deshecha");
          return null;
        }
        const after = await runBatch(deps.db, runDir(runId, envOf(deps)));
        return after?.status === "rolled_back"
          ? "Se borró lo importado en Cincel, pero algunos archivos de Drive no se movieron a la papelera. Revisa el registro."
          : "No se pudo deshacer la importación. Revisa el registro.";
      },
      envOf(deps),
      jobError(envOf(deps)),
    );
  } catch (err) {
    if (err instanceof Error && err.message === "JOB_RUNNING") throw new WizardError("Ya hay un proceso en curso en esta importación.");
    throw err;
  }
}

// --- Project flow (BE §7.8, §10.8): contracts implemented with the wizard choices and suggestion work ---

/**
 * Stores the whole firm-wide status map in app_settings `monday.status_map` (JSON). The caller has parsed the map
 * and checked that every `customStatusId` is a live status (`STATUS_NOT_FOUND` otherwise).
 */
export async function saveStatusMap(db: ImportDb, map: import("@/lib/types/monday-import").MondayStatusMap): Promise<void> {
  return notImplemented("saveStatusMap", db, map);
}

/** "Crear integrante": the puesto suggested by the fases of the person's tasks in the run's translation (BE §10.8). */
export async function suggestPosition(
  runId: string,
  mondayUserId: string,
  deps: WizardDeps,
): Promise<import("@/lib/types/monday-import").MondayPositionSuggestion> {
  return notImplemented("suggestPosition", runId, mondayUserId, deps);
}
