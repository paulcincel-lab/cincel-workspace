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

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import {
  areas,
  areaWorkflows,
  contacts,
  importBatches,
  projects,
  providerSubtype,
  staff,
  taskStatuses,
  workflows,
  workflowTaskTemplates,
} from "@/lib/db/schema";
import type { DriveAdmin } from "@/lib/google/drive-admin";
import type { ImportDb } from "@/lib/import/refs";
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
  MondayPreview,
  MondayRollbackCheck,
} from "@/lib/types/monday-import";
import { createApplyCommand, type PhaseB } from "@/scripts/monday/apply";
import { createMondayClient, MondayApiError, type MondayClient } from "@/scripts/monday/client";
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
import { Mapping } from "@/scripts/monday/mapping.schema";
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
import { taskAreaValue } from "@/scripts/monday/translate";

import { importedProjectHref } from "./links";

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
    version: 1,
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

/** Column types whose values can give tasks their área and workflow (#686). */
const TASK_AREA_COLUMN_TYPES = new Set(["dropdown", "status", "text"]);
/** Values listed per column; more are mapped in mapping.json by hand. */
const TASK_AREA_VALUES_MAX = 200;

/**
 * Distinct values per dropdown, status or text column (#686), read as translate reads them: item columns from the
 * active items, subitem columns from their active subitems (the tasks of item_as_project boards).
 */
function taskAreaColumnValues(
  board: Awaited<ReturnType<typeof readExport>>["boards"][number]["board"],
  items: Awaited<ReturnType<typeof readExport>>["boards"][number]["items"],
): Record<string, string[]> {
  const active = <T extends { state?: unknown }>(list: readonly (T | null | undefined)[]): T[] =>
    list.filter((i): i is T => i != null && (i.state == null || i.state === "active"));
  const out: Record<string, string[]> = {};
  const collect = (columns: readonly { id: string; type: string }[], rows: readonly unknown[]) => {
    for (const c of columns) {
      if (!TASK_AREA_COLUMN_TYPES.has(c.type)) continue;
      const values = (out[c.id] ??= []);
      for (const row of rows) {
        const value = taskAreaValue(row as Parameters<typeof taskAreaValue>[0], c.id);
        if (value && !values.includes(value) && values.length < TASK_AREA_VALUES_MAX) values.push(value);
      }
    }
  };
  const top = active(items);
  collect(board.columns, top);
  collect(board.subitem_columns ?? [], top.flatMap((i) => active(i.subitems ?? [])));
  return out;
}

/** Paso 2–4 source side: every board's columns, groups, status labels and the monday users. */
export async function getExportSource(runId: string, deps: WizardDeps): Promise<MondayExportSource> {
  const run = await requireRun(runId, deps);
  const dir = runDir(run.runId, envOf(deps));
  if (!existsSync(join(dir, "manifest.json"))) throw new WizardError("Primero exporta los tableros.");
  const data = await readExport(dir);
  const picked = new Set(run.boardIds);
  // An item and a subitem column can share an id; init maps the union of their labels, so the source lists it too.
  const labelsOf = (cols: { id: string; type: string; title: string; settings: unknown }[]) => {
    const out: Record<string, { id: string; name: string; isDone: boolean }[]> = {};
    for (const c of cols) {
      if (c.type !== "status") continue;
      const list = (out[c.id] ??= []);
      for (const l of statusLabels(c)) {
        if (!list.some((x) => x.id === l.id)) list.push({ id: l.id, name: l.label, isDone: l.isDone });
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
        statusLabels: labelsOf([...board.columns, ...(board.subitem_columns ?? [])]),
        itemCount: items.length,
        items: items
          .filter((i) => i.state == null || i.state === "active")
          .map((i) => ({ id: i.id, name: i.name, groupId: i.group?.id ?? null })),
        taskAreaValues: taskAreaColumnValues(board, items),
      })),
    users: data.users.map((u) => ({ id: u.id, name: u.name, email: u.email ?? null, kind: u.kind ?? null })),
    hasFiles: existsSync(join(dir, FILES_DIR, FILES_INDEX)),
    hasUpdates: run.exportOptions.updates,
  };
}

/** The Cincel side of every Equivalencias select. */
export async function getImportChoices(db: ImportDb): Promise<MondayImportChoices> {
  const [statusRows, areaRows, areaFlowRows, workflowRows, templateRows, clientRows, staffRows] = await Promise.all([
    db
      .select({ id: taskStatuses.id, name: taskStatuses.name, closes: taskStatuses.closes })
      .from(taskStatuses)
      .where(isNull(taskStatuses.deletedAt))
      .orderBy(asc(taskStatuses.sortOrder), asc(taskStatuses.name)),
    db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(and(isNull(areas.deletedAt), eq(areas.active, true)))
      .orderBy(asc(areas.sortOrder), asc(areas.name)),
    db.select({ areaId: areaWorkflows.areaId, workflowId: areaWorkflows.workflowId }).from(areaWorkflows),
    db
      .select({ id: workflows.id, name: workflows.name })
      .from(workflows)
      .where(and(isNull(workflows.deletedAt), eq(workflows.active, true)))
      .orderBy(asc(workflows.sortOrder), asc(workflows.name)),
    db
      .select({
        id: workflowTaskTemplates.id,
        workflowId: workflowTaskTemplates.workflowId,
        name: workflowTaskTemplates.title,
        phase: workflowTaskTemplates.phase,
      })
      .from(workflowTaskTemplates)
      .where(eq(workflowTaskTemplates.active, true))
      .orderBy(asc(workflowTaskTemplates.workflowId), asc(workflowTaskTemplates.sortOrder)),
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
  ]);
  const flows = new Map<string, string[]>();
  for (const r of areaFlowRows) flows.set(r.areaId, [...(flows.get(r.areaId) ?? []), r.workflowId]);
  return {
    statuses: statusRows,
    areas: areaRows.map((a) => ({ ...a, workflowIds: flows.get(a.id) ?? [] })),
    workflows: workflowRows,
    templates: templateRows,
    clients: clientRows,
    staff: staffRows,
    providerSubtypes: [...providerSubtype.enumValues],
  };
}

/** Zod issues as "path: message" lines. */
export function mappingIssues(raw: unknown): string[] {
  const parsed = Mapping.safeParse(raw);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "(raíz)"}: ${i.message}`);
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
  await requireRun(runId, deps);
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    throw new WizardError("Las equivalencias no tienen un formato válido.");
  const env = envOf(deps);
  await writeDraftMapping(runId, mapping, env);
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
  await requireRun(runId, deps);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { issues: ["El archivo no es JSON válido."] };
  }
  const issues = mappingIssues(raw);
  if (issues.length > 0) return { issues };
  await writeDraftMapping(runId, raw, envOf(deps));
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

/** Paso 6: the plan dry run as counts, issues and sample items. */
export async function previewImport(runId: string, importedById: string, deps: WizardDeps): Promise<MondayPreview> {
  const run = await requireRun(runId, deps);
  const env = envOf(deps);
  const dir = runDir(run.runId, env);
  const stored = await readDraftMapping(run.runId, env);
  if (!stored) throw new WizardError("Todavía no hay equivalencias: primero exporta los tableros.");
  const mapping = await enforceDisabledOptions(run, stored, deps);
  const { data } = await readPlanExport(dir);
  const lookups = (deps.planLookups ?? createPlanDbLookups)(deps.db);
  const plan = await buildPlan(data, mapping, lookups, {
    fileExists: (localPath) => existsSync(join(dir, localPath)),
    checkDrive: () => checkDriveConfigured(deps.openDrive ?? openServiceAccountDrive, env),
    importedById,
  });
  const names = await lookups.translateLookups();
  return buildPreview(plan, data, names);
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
  const stored = await readDraftMapping(run.runId, env);
  if (!stored) throw new WizardError("Todavía no hay equivalencias.");
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
    sql`select p.id::text as id, p.name from core.import_refs r
          join ${projects} p on p.id = r.row_id
          where r.batch_id = ${batch.id} and r.entity = 'project' and p.deleted_at is null
          order by p.name`,
  )) as unknown as { id: string; name: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, href: importedProjectHref(r.id) }));
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
