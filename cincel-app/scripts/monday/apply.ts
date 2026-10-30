/**
 * `npm run monday -- apply --export exports/<client> --by <staff email>`
 * (docs/specs/monday-migration/backend.md §7, §8, §12 #3, #4, #5).
 *
 * 1. `--by` must be an active `core.staff` email: that staff member is the
 *    `created_by_id` of every task and the fallback comment author.
 * 2. Resume: when a batch of the same monday `account_id` is `applying`,
 *    phase A is skipped and that batch goes to phase B.
 * 3. Otherwise the plan runs (scripts/monday/plan.ts) and any blocking issue
 *    aborts before anything is written.
 * 4. Phase A, one transaction: `import_batches (applying)` → contacts
 *    (+ `contact_people`, `provider_profiles`) → projects →
 *    `project_schedules` → tasks → child tasks → checklist →
 *    `task_support` → `task_dependencies` → `history_events` →
 *    `schedule_tasks`; `import_files (pending)`; an `import_refs` row for
 *    every created row, with `row_updated_at` = the row's `updated_at`
 *    after insert (null for rows without one). Rows already in
 *    `import_refs` are skipped, so a second apply of the same export
 *    creates an empty batch, marked `applied`: "Nada nuevo que importar".
 * 5. Phase B (Drive folders and uploads) runs after the commit through
 *    `ApplyDeps.phaseB`; until it exists the batch stays `applying` and a
 *    later apply resumes it.
 *
 * Project rollups (progress, dates, status per §0.4) come from translate.
 * Comments keep their monday `event_at`; no `cambio` history rows are
 * written for imported values.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  contactPeople,
  contacts,
  historyEvents,
  importBatches,
  importFiles,
  projects,
  projectSchedules,
  providerProfiles,
  scheduleTasks,
  staff,
  taskChecklistItems,
  taskDependencies,
  tasks,
  taskSupport,
} from "../../lib/db/schema";
import type { DriveAdmin } from "../../lib/google/drive-admin";
import {
  insertImportRefs,
  type ImportDb,
  type ImportEntity,
  type ImportRefInput,
} from "../../lib/import/refs";
import { createMondayDb, type MondayDbHandle } from "./db";
import { readJson } from "./init";
import type { Manifest } from "./export";
import {
  buildPlan,
  checkDriveConfigured,
  createPlanDbLookups,
  readMappingFile,
  readPlanExport,
  type Plan,
  type PlanLookups,
  type PlanTranslation,
} from "./plan";
import { openServiceAccountDrive } from "./rollback";
import type { CliIo, CommandHandler } from "./run";
import type { RowRef } from "./translate";

export const NOTHING_NEW = "Nada nuevo que importar";

const SOURCE = "monday";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export interface ApplyArgs {
  exportDir: string;
  by: string;
}

/** Parses `--export <dir> --by <email>`; returns an error message when invalid. */
export function parseApplyArgs(args: string[]): ApplyArgs | string {
  let exportDir: string | undefined;
  let by: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--export") exportDir = args[++i];
    else if (arg.startsWith("--export="))
      exportDir = arg.slice("--export=".length);
    else if (arg === "--by") by = args[++i];
    else if (arg.startsWith("--by=")) by = arg.slice("--by=".length);
    else return `unknown option "${arg}"`;
  }
  if (!exportDir) return "--export exports/<client> is required";
  if (!by?.trim()) return "--by <staff email> is required";
  return { exportDir, by: by.trim() };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The live, active staff member with this email (case-insensitive), or null. */
export async function findActiveStaffByEmail(
  db: ImportDb,
  email: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(
      and(
        sql`lower(${staff.email}) = ${email.toLowerCase()}`,
        eq(staff.active, true),
        isNull(staff.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The `applying` monday batch of an account, if any (the one to resume). */
export async function findApplyingBatch(
  db: ImportDb,
  accountId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.source, SOURCE),
        eq(importBatches.accountId, accountId),
        eq(importBatches.status, "applying"),
      ),
    )
    .orderBy(importBatches.appliedAt)
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Phase A
// ---------------------------------------------------------------------------

/** Rows phase A created, per table. */
export interface PhaseACounts {
  contacts: number;
  contactPeople: number;
  providerProfiles: number;
  projects: number;
  projectSchedules: number;
  tasks: number;
  childTasks: number;
  checklistItems: number;
  taskSupport: number;
  dependencies: number;
  comments: number;
  cronogramaRows: number;
  files: number;
}

function emptyCounts(): PhaseACounts {
  return {
    contacts: 0,
    contactPeople: 0,
    providerProfiles: 0,
    projects: 0,
    projectSchedules: 0,
    tasks: 0,
    childTasks: 0,
    checklistItems: 0,
    taskSupport: 0,
    dependencies: 0,
    comments: 0,
    cronogramaRows: 0,
    files: 0,
  };
}

export const countTotal = (c: PhaseACounts) =>
  Object.values(c).reduce((sum, n) => sum + n, 0);

export interface BatchInfo {
  accountId: string;
  accountSlug: string | null;
  accountName: string | null;
  exportedByEmail: string | null;
  exportedAt: Date;
  exportPath: string;
  apiVersion: string;
}

/**
 * Rows per INSERT. The widest insert (tasks) binds about 20 parameters a
 * row; Postgres caps a statement at 65,535.
 */
const INSERT_CHUNK = 500;

/** Inserts rows in chunks and returns what each `returning` gave, in input order. */
async function insertAll<R>(
  rows: readonly unknown[],
  insert: (chunk: unknown[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK)
    out.push(...(await insert(rows.slice(i, i + INSERT_CHUNK) as unknown[])));
  return out;
}

const toDate = (iso: string | null) => (iso ? new Date(iso) : undefined);

/**
 * Writes a clean plan's new rows in the transaction `tx`: the batch, every
 * planned row not yet in `import_refs`, the pending `import_files` and an
 * import ref per created row. An empty batch is marked `applied`.
 */
export async function writePhaseA(
  tx: ImportDb,
  translation: PlanTranslation,
  batch: BatchInfo,
  importedById: string,
): Promise<{ batchId: string; counts: PhaseACounts }> {
  const { result, mapping, imported } = translation;
  const counts = emptyCounts();

  const [batchRow] = await tx
    .insert(importBatches)
    .values({
      source: SOURCE,
      accountId: batch.accountId,
      accountSlug: batch.accountSlug,
      accountName: batch.accountName,
      exportedByEmail: batch.exportedByEmail,
      exportedAt: batch.exportedAt,
      exportPath: batch.exportPath,
      apiVersion: batch.apiVersion,
      mapping,
      status: "applying",
      appliedById: importedById,
    })
    .returning({ id: importBatches.id });
  const batchId = batchRow.id;

  // entity → externalId → row id: what exists already plus what this run creates.
  const ids = new Map<ImportEntity, Map<string, string>>();
  for (const [entity, map] of imported) ids.set(entity, new Map(map));
  const idsOf = (entity: ImportEntity) => {
    let map = ids.get(entity);
    if (!map) ids.set(entity, (map = new Map()));
    return map;
  };
  const isNew = (entity: ImportEntity, externalId: string) =>
    !idsOf(entity).has(externalId);
  const idOf = (ref: RowRef): string => {
    if (ref.kind === "existing") return ref.id;
    const id = idsOf(ref.entity).get(ref.externalId);
    if (!id)
      throw new Error(
        `apply: ${ref.entity} ${ref.externalId} is neither imported nor created in this batch`,
      );
    return id;
  };

  const refs: ImportRefInput[] = [];
  const record = (
    entity: ImportEntity,
    externalId: string,
    rowId: string,
    rowUpdatedAt: Date | null,
    data: unknown = null,
  ) => {
    idsOf(entity).set(externalId, rowId);
    refs.push({
      source: SOURCE,
      entity,
      externalId,
      rowId,
      batchId,
      data,
      rowUpdatedAt,
    });
  };

  /** Inserts the new rows of one entity and records an import ref for each. */
  async function step<T extends { externalId: string }>(
    entity: ImportEntity,
    planned: readonly T[],
    table: PgTable,
    values: (row: T) => Record<string, unknown>,
    returned: (row: Record<string, unknown>) => {
      id: string;
      updatedAt: Date | null;
    },
    data: (row: T) => unknown = () => null,
  ): Promise<T[]> {
    const fresh = planned.filter((p) => isNew(entity, p.externalId));
    if (fresh.length === 0) return fresh;
    const rows = await insertAll(
      fresh.map(values),
      (chunk) =>
        tx
          .insert(table)
          .values(chunk as never)
          .returning() as unknown as Promise<Record<string, unknown>[]>,
    );
    fresh.forEach((p, i) => {
      const r = returned(rows[i]);
      record(entity, p.externalId, r.id, r.updatedAt, data(p));
    });
    return fresh;
  }
  const byId = (r: Record<string, unknown>) => ({
    id: r.id as string,
    updatedAt: (r.updatedAt as Date | undefined) ?? null,
  });

  // --- contacts (+ contact_people, provider_profiles) -----------------------
  counts.contacts = (
    await step(
      "contact",
      result.contacts,
      contacts,
      (c) => ({
        type: c.type,
        kind: c.kind,
        name: c.name,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
      }),
      byId,
      (c) => c.data,
    )
  ).length;
  counts.contactPeople = (
    await step(
      "contact_person",
      result.contactPeople,
      contactPeople,
      (p) => ({ contactId: idOf(p.contact), name: p.name, email: p.email }),
      byId,
    )
  ).length;
  counts.providerProfiles = (
    await step(
      "provider_profile",
      result.providerProfiles,
      providerProfiles,
      (p) => ({ contactId: idOf(p.contact), subtype: p.subtype }),
      (r) => ({
        id: r.contactId as string,
        updatedAt: (r.updatedAt as Date | undefined) ?? null,
      }),
    )
  ).length;

  // --- projects, project_schedules ----------------------------------------
  counts.projects = (
    await step(
      "project",
      result.projects,
      projects,
      (p) => {
        if (!p.client)
          throw new Error(`apply: project ${p.externalId} has no client`);
        return {
          name: p.name,
          code: p.code,
          clientId: idOf(p.client),
          status: p.status,
          progress: p.progress,
          startDate: p.startDate,
          endDate: p.endDate,
        };
      },
      byId,
      (p) => p.data,
    )
  ).length;
  counts.projectSchedules = (
    await step(
      "project_schedule",
      result.projectSchedules,
      projectSchedules,
      (s) => ({ projectId: idOf(s.project), sourceFileName: s.sourceFileName }),
      byId,
    )
  ).length;

  // --- tasks, then child tasks --------------------------------------------
  const taskValues = (t: (typeof result.tasks)[number]) => ({
    projectId: idOf(t.project),
    parentTaskId: t.parentTask ? idOf(t.parentTask) : null,
    kind: t.kind,
    templateId: t.templateId,
    workflowId: t.workflowId,
    phase: t.phase,
    title: t.title,
    notes: t.notes,
    createdById: t.createdById,
    managerId: t.managerId,
    status: t.status,
    customStatusId: t.customStatusId,
    priority: t.priority,
    sortOrder: t.sortOrder,
    commitmentDate: t.commitmentDate,
    deliveryDate: t.deliveryDate,
    ...(t.createdAt ? { createdAt: new Date(t.createdAt) } : {}),
  });
  counts.tasks = (
    await step(
      "task",
      result.tasks.filter((t) => t.parentTask == null),
      tasks,
      taskValues,
      byId,
      (t) => t.data,
    )
  ).length;
  counts.childTasks = (
    await step(
      "task",
      result.tasks.filter((t) => t.parentTask != null),
      tasks,
      taskValues,
      byId,
      (t) => t.data,
    )
  ).length;

  // --- checklist, task_support, task_dependencies ---------------------------
  counts.checklistItems = (
    await step(
      "checklist_item",
      result.checklistItems,
      taskChecklistItems,
      (c) => ({
        taskId: idOf(c.task),
        title: c.title,
        completed: c.completed,
        sortOrder: c.sortOrder,
      }),
      byId,
      (c) => ({ source: c.source }),
    )
  ).length;
  counts.taskSupport = (
    await step(
      "task_support",
      result.taskSupport,
      taskSupport,
      (s) => ({ taskId: idOf(s.task), staffId: s.staffId }),
      (r) => ({
        id: r.taskId as string,
        updatedAt: (r.updatedAt as Date | undefined) ?? null,
      }),
      (s) => ({ staffId: s.staffId }),
    )
  ).length;
  counts.dependencies = (
    await step(
      "task_dependency",
      result.taskDependencies,
      taskDependencies,
      (d) => ({
        taskId: idOf(d.task),
        dependsOnTaskId: idOf(d.dependsOn),
        kind: d.kind,
      }),
      byId,
    )
  ).length;

  // --- history_events (comments; append-only, no updated_at) ---------------
  counts.comments = (
    await step(
      "history_event",
      result.historyEvents,
      historyEvents,
      (h) => ({
        entity: h.target.entity,
        entityId: idOf(h.target.ref),
        kind: h.kind,
        actorId: h.actorId,
        comment: h.comment,
        ...(h.eventAt ? { eventAt: toDate(h.eventAt) } : {}),
      }),
      (r) => ({ id: r.id as string, updatedAt: null }),
      (h) => ({ source: h.source }),
    )
  ).length;

  // --- schedule_tasks -------------------------------------------------------
  counts.cronogramaRows = (
    await step(
      "schedule_task",
      result.scheduleTasks,
      scheduleTasks,
      (s) => {
        if (s.project.kind !== "planned")
          throw new Error(
            `apply: cronograma row ${s.externalId} points at an existing project`,
          );
        return {
          scheduleId: scheduleIdOf(s.project.externalId),
          stableKey: s.stableKey,
          planta: s.planta,
          seccion: s.seccion,
          seccionOrder: s.seccionOrder,
          tarea: s.tarea,
          inicio: s.inicio,
          fin: s.fin,
          status: s.status,
          responsable: s.responsable,
          sortOrder: s.sortOrder,
        };
      },
      byId,
    )
  ).length;
  function scheduleIdOf(projectExternalId: string): string {
    const id = idsOf("project_schedule").get(projectExternalId);
    if (!id)
      throw new Error(
        `apply: project ${projectExternalId} has cronograma rows but no project_schedules row`,
      );
    return id;
  }

  // --- import_files (pending; uploaded in phase B) --------------------------
  if (translation.files.length > 0) {
    await insertAll(
      translation.files.map((f) => ({
        batchId,
        assetId: f.assetId,
        projectId: idOf(f.project),
        taskId: f.task ? idOf(f.task) : null,
        groupName: f.groupName,
        fileName: f.fileName,
        sizeBytes: f.sizeBytes,
        sha256: f.sha256,
        localPath: f.localPath,
      })),
      (chunk) =>
        tx
          .insert(importFiles)
          .values(chunk as never)
          .returning({ id: importFiles.id }),
    );
    counts.files = translation.files.length;
  }

  // --- import_refs, stats ---------------------------------------------------
  await insertImportRefs(tx, refs);
  const empty = countTotal(counts) === 0;
  await tx
    .update(importBatches)
    .set({
      stats: { created: counts },
      ...(empty ? { status: "applied" as const } : {}),
    })
    .where(eq(importBatches.id, batchId));

  return { batchId, counts };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface PhaseBContext {
  db: MondayDbHandle["db"];
  batchId: string;
  /** The export folder, absolute. */
  exportDir: string;
  io: CliIo;
}

/** Phase B (Drive folders and uploads); returns the exit code. */
export type PhaseB = (ctx: PhaseBContext) => Promise<number>;

/** Until phase B exists, the batch stays `applying` and a later apply resumes it. */
export const pendingPhaseB: PhaseB = async ({ batchId, io }) => {
  io.stdout(
    `Phase B (Drive) is not available yet; batch ${batchId} stays applying and the next apply resumes it.\n`,
  );
  return 0;
};

type Env = Record<string, string | undefined>;

export interface ApplyDeps {
  openDb: () => MondayDbHandle;
  /** The plan lookups over the transaction; `createPlanDbLookups` by default. */
  lookups?: (db: ImportDb) => PlanLookups;
  /** The Drive client for the DRIVE_NOT_CONFIGURED check; the env service account by default. */
  openDrive?: () => DriveAdmin;
  env?: Env;
  phaseB?: PhaseB;
}

/** Thrown inside the transaction to undo it when the plan is not clean. */
class Blocked extends Error {
  constructor(readonly plan: Plan) {
    super("apply refused");
  }
}

function formatCounts(c: PhaseACounts): string {
  return `${c.contacts} contacts, ${c.contactPeople} contact people, ${c.providerProfiles} provider profiles, ${c.projects} projects, ${c.projectSchedules} cronogramas, ${c.tasks} tasks, ${c.childTasks} child tasks, ${c.checklistItems} checklist items, ${c.taskSupport} task support rows, ${c.dependencies} dependencies, ${c.comments} comments, ${c.cronogramaRows} cronograma rows, ${c.files} files pending upload`;
}

/** Builds the `apply` handler; tests pass their own database, Drive and phase B. */
export function createApplyCommand(
  deps: ApplyDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  const phaseB = deps.phaseB ?? pendingPhaseB;
  return async (args: string[], io: CliIo) => {
    const parsed = parseApplyArgs(args);
    if (typeof parsed === "string") {
      io.stderr(
        `monday apply: ${parsed}.\nUsage: apply --export exports/<client> --by <staff email>\n`,
      );
      return 1;
    }
    const dir = resolve(parsed.exportDir);
    const manifest = await readJson<Manifest>(join(dir, "manifest.json"));
    if (!manifest) {
      io.stderr(
        `monday apply: ${dir}/manifest.json not found; is this an export folder?\n`,
      );
      return 1;
    }

    const handle = deps.openDb();
    try {
      const by = await findActiveStaffByEmail(handle.db, parsed.by);
      if (!by) {
        io.stderr(
          `monday apply: --by ${parsed.by} is not the email of an active staff member.\n`,
        );
        return 1;
      }

      const applying = await findApplyingBatch(handle.db, manifest.account.id);
      if (applying) {
        io.stdout(
          `Batch ${applying.id} of account ${manifest.account.slug} (${manifest.account.id}) is applying; skipping phase A and resuming it.\n`,
        );
        return await phaseB({
          db: handle.db,
          batchId: applying.id,
          exportDir: dir,
          io,
        });
      }

      const { data, incomplete } = await readPlanExport(dir);
      for (const id of incomplete) {
        io.stderr(
          `monday apply: board ${id} has no .done marker; its export is incomplete.\n`,
        );
      }
      const mapping = await readMappingFile(dir);

      let written: { batchId: string; counts: PhaseACounts };
      try {
        written = await handle.db.transaction(async (tx) => {
          const plan =
            "issue" in mapping
              ? ({ issues: [mapping.issue], boards: [] } as unknown as Plan)
              : await buildPlan(
                  data,
                  mapping.raw,
                  (deps.lookups ?? createPlanDbLookups)(tx),
                  {
                    fileExists: (localPath) => existsSync(join(dir, localPath)),
                    checkDrive: () =>
                      checkDriveConfigured(
                        deps.openDrive ?? openServiceAccountDrive,
                        deps.env,
                      ),
                    importedById: by.id,
                  },
                );
          if (plan.issues.some((i) => i.blocking) || !plan.translation)
            throw new Blocked(plan);
          return writePhaseA(
            tx,
            plan.translation,
            {
              accountId: manifest.account.id,
              accountSlug: manifest.account.slug ?? null,
              accountName: manifest.account.name ?? null,
              exportedByEmail: manifest.token_user?.email ?? null,
              exportedAt: new Date(manifest.exported_at),
              exportPath: dir,
              apiVersion: manifest.api_version,
            },
            by.id,
          );
        });
      } catch (err) {
        if (!(err instanceof Blocked)) throw err;
        const blocking = err.plan.issues.filter((i) => i.blocking);
        io.stderr(
          `monday apply: refused, ${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}; nothing was written. Run plan, fix mapping.json and try again.\n` +
            blocking
              .map(
                (i) =>
                  `${i.code}${i.boardId ? ` board ${i.boardId}` : ""}${i.itemId ? ` item ${i.itemId}` : ""}: ${i.message}\n`,
              )
              .join(""),
        );
        return 1;
      }

      const { batchId, counts } = written;
      if (countTotal(counts) === 0) {
        io.stdout(`${NOTHING_NEW}. Batch ${batchId} (empty, applied).\n`);
        return 0;
      }
      io.stdout(`Phase A done: ${formatCounts(counts)}.\nBatch ${batchId}.\n`);
      return await phaseB({ db: handle.db, batchId, exportDir: dir, io });
    } finally {
      await handle.close();
    }
  };
}

export const applyCommand: CommandHandler = createApplyCommand();
