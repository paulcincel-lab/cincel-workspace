/**
 * Runs of the monday import wizard (#672): one export folder per run under
 * `MONDAY_IMPORT_DIR` (default `<cwd>/exports/wizard`), laid out exactly like
 * a CLI export (scripts/monday/export.ts §4.1) so `init`, `plan`, `apply`
 * and `rollback` read it unchanged. Next to the export:
 *
 *   mapping.json   the draft mapping (the same file the CLI edits)
 *   wizard.json    the wizard state: step, picked boards, export options,
 *                  the batch id and the last job of each kind
 *
 * Background jobs run in this server process; their live state is kept in
 * memory and copied to wizard.json, so polling works from any request and a
 * job that was running when the process stopped reads back as
 * `interrupted` (export and apply both resume when started again).
 *
 * Nothing here ever receives or writes the monday token.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  MappingInput,
  MondayImportJob,
  MondayImportJobKind,
  MondayImportStep,
} from "@/lib/types/monday-import";
import type { CliIo } from "@/scripts/monday/run";

export const WIZARD_FILE = "wizard.json";
export const MAPPING_FILE = "mapping.json";
/** Log lines kept per job. */
export const JOB_LOG_LIMIT = 500;

type Env = Record<string, string | undefined>;

/** Where run folders live. */
export function importRoot(env: Env = process.env): string {
  const configured = env.MONDAY_IMPORT_DIR?.trim();
  // Runtime folders, not app files: keep them out of the standalone output trace.
  if (configured) return resolve(/*turbopackIgnore: true*/ configured);
  return join(/*turbopackIgnore: true*/ process.cwd(), "exports", "wizard");
}

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRunId = (value: unknown): value is string => typeof value === "string" && RUN_ID.test(value);

/** The run's export folder; throws on anything but a run id (no path tricks). */
export function runDir(runId: string, env: Env = process.env): string {
  if (!isRunId(runId)) throw new Error("invalid run id");
  return join(/*turbopackIgnore: true*/ importRoot(env), runId.toLowerCase());
}

/** What wizard.json holds. */
export interface StoredRun {
  runId: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  step: MondayImportStep;
  account: { id: string; slug: string; name: string } | null;
  boardIds: string[];
  exportOptions: { updates: boolean; files: boolean };
  batchId: string | null;
  jobs: Partial<Record<MondayImportJobKind, MondayImportJob>>;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Writes through a temp file so a poll never reads half a file. */
async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}

export async function createRun(createdById: string, env: Env = process.env, now = new Date()): Promise<StoredRun> {
  const runId = randomUUID();
  const dir = runDir(runId, env);
  await mkdir(dir, { recursive: true });
  const run: StoredRun = {
    runId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdById,
    step: "conectar",
    account: null,
    boardIds: [],
    exportOptions: { updates: true, files: true },
    batchId: null,
    jobs: {},
  };
  await writeJsonFile(join(dir, WIZARD_FILE), run);
  return run;
}

export async function readRun(runId: string, env: Env = process.env): Promise<StoredRun | null> {
  if (!isRunId(runId)) return null;
  return readJsonFile<StoredRun>(join(runDir(runId, env), WIZARD_FILE));
}

/** Serialises wizard.json writes per run inside this process. */
const writeQueues = new Map<string, Promise<unknown>>();

/** Reads, changes and writes wizard.json; returns the new state. */
export function updateRun(
  runId: string,
  change: (run: StoredRun) => void,
  env: Env = process.env,
): Promise<StoredRun> {
  const previous = writeQueues.get(runId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const run = await readRun(runId, env);
      if (!run) throw new Error(`run ${runId} not found`);
      change(run);
      run.updatedAt = new Date().toISOString();
      await writeJsonFile(join(runDir(runId, env), WIZARD_FILE), run);
      return run;
    });
  writeQueues.set(runId, next);
  return next;
}

/** The newest run folder, or null. */
export async function latestRun(env: Env = process.env): Promise<StoredRun | null> {
  let names: string[];
  try {
    names = (await readdir(importRoot(env), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let latest: StoredRun | null = null;
  for (const name of names.filter(isRunId)) {
    const run = await readRun(name, env);
    if (run && (!latest || run.createdAt > latest.createdAt)) latest = run;
  }
  return latest;
}

export async function readDraftMapping(runId: string, env: Env = process.env): Promise<MappingInput | null> {
  return readJsonFile<MappingInput>(join(runDir(runId, env), MAPPING_FILE));
}

export async function writeDraftMapping(runId: string, mapping: unknown, env: Env = process.env): Promise<void> {
  await writeJsonFile(join(runDir(runId, env), MAPPING_FILE), mapping);
}

export const hasDraftMapping = (runId: string, env: Env = process.env) =>
  existsSync(join(runDir(runId, env), MAPPING_FILE));

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

interface LiveJob {
  job: MondayImportJob;
  promise: Promise<void>;
}

const globalJobs = globalThis as unknown as { __mondayImportJobs?: Map<string, LiveJob> };
const live = (globalJobs.__mondayImportJobs ??= new Map<string, LiveJob>());
const jobKey = (runId: string, kind: MondayImportJobKind) => `${runId}:${kind}`;

/** Whether any job of the run is running in this process. */
export function runningJob(runId: string): MondayImportJob | null {
  for (const kind of ["export", "apply", "rollback"] as const) {
    const j = live.get(jobKey(runId, kind));
    if (j && j.job.status === "running") return j.job;
  }
  return null;
}

/** The job as polling should see it: the live one, else wizard.json's (running there = interrupted). */
export function jobView(run: StoredRun, kind: MondayImportJobKind): MondayImportJob | null {
  const j = live.get(jobKey(run.runId, kind));
  if (j) return structuredClone(j.job);
  const stored = run.jobs[kind];
  if (!stored) return null;
  return stored.status === "running" ? { ...stored, status: "interrupted" } : stored;
}

/** What a job body gets: a CLI io that feeds the log, progress updates and Spanish notes for the Registro. */
export interface JobContext {
  io: CliIo;
  /** Also notes the label (with "n de m") in the Registro when it changes. */
  progress: (done: number, total: number | null, label: string) => void;
  /** One Spanish line for the Registro on screen; never a server path. */
  note: (text: string) => void;
}

/** What a job shows when its body throws something it doesn't describe. */
export const UNEXPECTED_JOB_ERROR = "Ocurrió un error inesperado. Revisa el registro técnico.";

/** The Registro line of a progress update. */
export function progressNote(done: number, total: number | null, label: string): string {
  return total && total > 1 ? `${label} (${done} de ${total})` : label;
}

/**
 * Starts `body` in the background as the run's `kind` job. The body returns
 * an error message (Spanish) to fail the job, or null when it succeeded.
 * Throws when another job of the run is running. An error the body throws
 * goes to the server log and the downloadable log as is; the screen gets
 * `describeError(err)`, a fixed Spanish message by default.
 */
export function startJob(
  runId: string,
  kind: MondayImportJobKind,
  label: string,
  body: (ctx: JobContext) => Promise<string | null>,
  env: Env = process.env,
  describeError: (err: unknown) => string = () => UNEXPECTED_JOB_ERROR,
): MondayImportJob {
  if (runningJob(runId)) throw new Error("JOB_RUNNING");
  const job: MondayImportJob = {
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: { done: 0, total: null, label },
    log: [],
    notes: [label],
    error: null,
  };
  let lastSaved = 0;
  const persist = (force = false) => {
    const at = Date.now();
    if (!force && at - lastSaved < 1000) return Promise.resolve();
    lastSaved = at;
    const copy = structuredClone(job);
    return updateRun(runId, (run) => {
      run.jobs[kind] = copy;
    }, env).then(
      () => {},
      () => {},
    );
  };
  const push = (text: string) => {
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      job.log.push(line);
    }
    if (job.log.length > JOB_LOG_LIMIT) job.log.splice(0, job.log.length - JOB_LOG_LIMIT);
    void persist();
  };
  const note = (text: string) => {
    const notes = (job.notes ??= []);
    if (notes[notes.length - 1] === text) return;
    notes.push(text);
    if (notes.length > JOB_LOG_LIMIT) notes.splice(0, notes.length - JOB_LOG_LIMIT);
    void persist();
  };
  const ctx: JobContext = {
    io: { stdout: push, stderr: push },
    progress: (done, total, progressLabel) => {
      job.progress = { done, total, label: progressLabel };
      note(progressNote(done, total, progressLabel));
    },
    note,
  };
  const promise = (async () => {
    await persist(true);
    let error: string | null;
    try {
      error = await body(ctx);
    } catch (err) {
      console.error(`[monday-import] ${kind} job of run ${runId} failed:`, err);
      push(err instanceof Error ? err.message : String(err));
      error = describeError(err);
    }
    job.status = error ? "failed" : "succeeded";
    job.error = error;
    note(error ? "No se terminó." : "Terminado.");
    job.finishedAt = new Date().toISOString();
    await persist(true);
  })();
  live.set(jobKey(runId, kind), { job, promise });
  return structuredClone(job);
}

/** Waits for the run's `kind` job (tests). */
export async function waitForJob(runId: string, kind: MondayImportJobKind): Promise<void> {
  await live.get(jobKey(runId, kind))?.promise;
}
