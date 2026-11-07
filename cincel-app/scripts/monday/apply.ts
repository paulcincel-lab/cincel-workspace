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
 *    (+ `contact_people`, `provider_profiles`) → projects (`origin
 *    'monday'`, client optional, a `project_stages` row per tramo with
 *    tasks) → `project_schedules` → espacios (`findOrCreateSpace`, ref
 *    `project_space`) → tasks → child tasks → the "Asignar cliente y
 *    origen" admin task of projects without a client → checklist →
 *    `task_support` → `task_dependencies` → `history_events` →
 *    `schedule_tasks`; `import_files (pending)`; `refreshStageClosed` per
 *    (project, tramo) written (project flow BE §10.5); an `import_refs` row for
 *    every created row, with `row_updated_at` = the row's `updated_at`
 *    after insert (null for rows without one). Rows already in
 *    `import_refs` are skipped, so a second apply of the same export
 *    creates an empty batch, marked `applied`: "Nada nuevo que importar".
 * 5. Phase B (Drive folders and uploads, scripts/monday/apply-phase-b.ts)
 *    runs after the commit; it ends the batch `applied`, or leaves it
 *    `applying` for a later apply to resume.
 *
 * Project rollups (progress, dates, status per §0.4) come from translate.
 * Comments keep their monday `event_at`; no `cambio` history rows are
 * written for imported values.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  appSettings,
  contactPeople,
  contacts,
  historyEvents,
  importBatches,
  importFiles,
  projects,
  projectSchedules,
  projectSpaces,
  projectStages,
  providerProfiles,
  scheduleTasks,
  staff,
  taskChecklistItems,
  taskDependencies,
  tasks,
  taskSupport,
  workflows,
} from "../../lib/db/schema";
import type { DriveAdmin } from "../../lib/google/drive-admin";
import { ensureAssignClientTask } from "../../lib/project-flow/admin-tasks";
import {
  ASSIGN_CLIENT_SYSTEM_KEY,
  MONDAY_STATUS_MAP_SETTING,
} from "../../lib/project-flow/catalog";
import { refreshStageClosed } from "../../lib/project-flow/closing";
import type { FlowTx } from "../../lib/project-flow/db";
import { findOrCreateSpace } from "../../lib/repositories/project-spaces-repository";
import {
  findImportRefs,
  insertImportRefs,
  type ImportDb,
  type ImportEntity,
  type ImportRefInput,
} from "../../lib/import/refs";
import { createPhaseB } from "./apply-phase-b";
import { createMondayDb, type MondayDbHandle } from "./db";
import { readJson } from "./init";
import type { Manifest } from "./export";
import {
  MondayStatusMap,
  type Mapping,
} from "./mapping.schema";
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
import type { PlannedProject, PlannedTask, RowRef } from "./translate";

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
  /** Espacios created for `space` groups (project flow BE §10.5). */
  spaces: number;
  /** `project_stages` rows: one per tramo with tasks of each new project. */
  stages: number;
  /** "Asignar cliente y origen" admin tasks of projects without a client. */
  assignClientTasks: number;
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
    spaces: 0,
    stages: 0,
    assignClientTasks: 0,
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
 * The project flow fields of a planned task (BE §10.3): fase, espacio (the
 * group title of a `space` group), closing date, system key and the admin
 * kind. Optional here so apply reads whatever translate sets.
 */
type FlowTask = Omit<PlannedTask, "kind"> & {
  kind: "workflow" | "usuario" | "admin";
  phaseId?: string | null;
  space?: string | null;
  closedAt?: string | null;
  systemKey?: string | null;
};

/** The project flow fields of a planned project (BE §10.3). */
type FlowProject = PlannedProject & {
  tramos?: string[];
  currentWorkflowId?: string | null;
};

/** `import_refs.external_id` suffix of a project's "Asignar cliente y origen" task. */
export const ASSIGN_CLIENT_REF_SUFFIX = `:${ASSIGN_CLIENT_SYSTEM_KEY}`;

/**
 * The import ref key of the espacio a `space` group makes (BE §10.3):
 * `<boardId>:<groupId>` when the project is the board (`board_as_project`);
 * prefixed with the project's external id otherwise, since one board's group
 * then lands in several projects.
 */
export function spaceExternalId(
  projectExternalId: string,
  source: { boardId: string; groupId: string | null },
): string {
  const group = `${source.boardId}:${source.groupId ?? ""}`;
  return projectExternalId === source.boardId
    ? group
    : `${projectExternalId}/${group}`;
}

/**
 * The task columns of a planned task under the project flow rules: an admin
 * task has no tramo, fase, espacio or template; a fase needs a tramo;
 * `closed_at` only on a `completado` task (the table's checks).
 */
export function flowTaskColumns(
  t: FlowTask,
  spaceId: string | null,
): {
  kind: FlowTask["kind"];
  templateId: string | null;
  workflowId: string | null;
  phaseId: string | null;
  spaceId: string | null;
  closedAt: Date | null;
  systemKey: string | null;
} {
  const admin = t.kind === "admin";
  const workflowId = admin ? null : t.workflowId;
  const closed = t.status === "completado" && t.closedAt ? new Date(t.closedAt) : null;
  return {
    kind: t.kind,
    templateId: admin ? null : t.templateId,
    workflowId,
    phaseId: workflowId ? (t.phaseId ?? null) : null,
    spaceId: admin ? null : spaceId,
    closedAt: closed && !Number.isNaN(closed.getTime()) ? closed : null,
    systemKey:
      t.systemKey ??
      (t.externalId.endsWith(ASSIGN_CLIENT_REF_SUFFIX) ? ASSIGN_CLIENT_SYSTEM_KEY : null),
  };
}

/**
 * The tramos a new project gets a `project_stages` row for and its current
 * tramo (BE §10.3, §10.5): every tramo its tasks carry (`tramos` when
 * translate sets it), and the current one = translate's `currentWorkflowId`,
 * else the highest `sort_order` tramo with tasks, else the board's tramo.
 * The current tramo always has a stage row (BE §3.7).
 */
export function projectTramos(
  project: FlowProject,
  taskWorkflowIds: readonly (string | null)[],
  sortOrder: ReadonlyMap<string, number>,
): { tramos: string[]; currentWorkflowId: string | null } {
  const withTasks = [
    ...new Set([
      ...(project.tramos ?? []),
      ...taskWorkflowIds.filter((w): w is string => !!w),
    ]),
  ];
  const highest = [...withTasks].sort(
    (a, b) => (sortOrder.get(b) ?? 0) - (sortOrder.get(a) ?? 0),
  )[0];
  const currentWorkflowId =
    project.currentWorkflowId !== undefined
      ? project.currentWorkflowId
      : (highest ?? project.workflowId ?? null);
  const tramos = currentWorkflowId && !withTasks.includes(currentWorkflowId)
    ? [...withTasks, currentWorkflowId]
    : withTasks;
  return {
    tramos: [...tramos].sort((a, b) => (sortOrder.get(a) ?? 0) - (sortOrder.get(b) ?? 0)),
    currentWorkflowId,
  };
}

/**
 * The mapping `import_batches.mapping` keeps: v2 with the saved firm-wide
 * status map as of this apply (BE §10.5). The saved setting wins over the
 * mapping's own snapshot; a setting that doesn't parse leaves it as is.
 */
export async function snapshotMapping(
  tx: ImportDb,
  mapping: Mapping,
): Promise<Mapping> {
  const [row] = await tx
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MONDAY_STATUS_MAP_SETTING))
    .limit(1);
  let saved: MondayStatusMap | null = null;
  if (row) {
    try {
      const parsed = MondayStatusMap.safeParse(JSON.parse(row.value));
      if (parsed.success) saved = parsed.data as MondayStatusMap;
    } catch {
      saved = null;
    }
  }
  return { ...mapping, version: 2, statusMap: saved ?? mapping.statusMap ?? {} };
}

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
  const { result, imported } = translation;
  const mapping = await snapshotMapping(tx, translation.mapping);
  const counts = emptyCounts();
  const flowTx = tx as unknown as FlowTx;

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

  // --- projects (+ a stage per tramo with tasks), project_schedules --------
  const plannedTasks = result.tasks as FlowTask[];
  const tasksOf = new Map<string, FlowTask[]>();
  for (const t of plannedTasks) {
    const list = tasksOf.get(t.project.externalId) ?? [];
    list.push(t);
    tasksOf.set(t.project.externalId, list);
  }
  const workflowOrder = new Map<string, number>(
    (
      await tx
        .select({ id: workflows.id, sortOrder: workflows.sortOrder })
        .from(workflows)
    ).map((w) => [w.id, w.sortOrder]),
  );
  const tramosOf = new Map<string, ReturnType<typeof projectTramos>>();
  for (const p of result.projects as FlowProject[]) {
    tramosOf.set(
      p.externalId,
      projectTramos(
        p,
        (tasksOf.get(p.externalId) ?? []).map((t) =>
          t.kind === "admin" ? null : t.workflowId,
        ),
        workflowOrder,
      ),
    );
  }
  const newProjects = await step(
    "project",
    result.projects as FlowProject[],
    projects,
    (p) => ({
      name: p.name,
      code: p.code,
      // Optional (BE §10.3): a project without a client gets "Asignar cliente y origen".
      clientId: p.client ? idOf(p.client) : null,
      origin: SOURCE,
      status: p.status,
      progress: p.progress,
      startDate: p.startDate,
      endDate: p.endDate,
      currentWorkflowId: tramosOf.get(p.externalId)?.currentWorkflowId ?? null,
    }),
    byId,
    // The project's import ref names the stages apply wrote (`stageWorkflowIds`), so rollback owns them.
    (p) => ({
      ...p.data,
      stageWorkflowId: undefined,
      stageWorkflowIds: tramosOf.get(p.externalId)?.tramos ?? [],
    }),
  );
  counts.projects = newProjects.length;
  const earliest = (list: FlowTask[]) =>
    list
      .map((t) => t.createdAt)
      .filter((d): d is string => !!d)
      .sort()[0];
  const stages = newProjects.flatMap((p) => {
    const projectId = idOf({ kind: "planned", entity: "project", externalId: p.externalId });
    const list = tasksOf.get(p.externalId) ?? [];
    return (tramosOf.get(p.externalId)?.tramos ?? []).map((workflowId) => {
      const first = earliest(list.filter((t) => t.kind !== "admin" && t.workflowId === workflowId));
      return {
        projectId,
        workflowId,
        startedById: importedById,
        ...(first ? { startedAt: new Date(first) } : {}),
      };
    });
  });
  await insertAll(stages, (chunk) =>
    tx.insert(projectStages).values(chunk as (typeof stages)[number][]).returning(),
  );
  counts.stages = stages.length;
  counts.projectSchedules = (
    await step(
      "project_schedule",
      result.projectSchedules,
      projectSchedules,
      (s) => ({ projectId: idOf(s.project), sourceFileName: s.sourceFileName }),
      byId,
    )
  ).length;

  // --- espacios of `space` groups (ref `project_space`) ---------------------
  // Created through findOrCreateSpace (deduped by name per project); a ref is
  // recorded only for the espacios this batch created, so rollback owns those.
  const spaceIdOf = new Map<string, string>();
  const freshTasks = plannedTasks.filter((t) => isNew("task", t.externalId));
  const spaceKeys = new Map<string, { projectExternalId: string; name: string }>();
  for (const t of freshTasks) {
    const name = t.kind === "admin" ? null : t.space?.trim();
    if (!name) continue;
    const key = spaceExternalId(t.project.externalId, t.source);
    if (!spaceKeys.has(key)) spaceKeys.set(key, { projectExternalId: t.project.externalId, name });
  }
  if (spaceKeys.size > 0) {
    const known = await findImportRefs(tx, SOURCE, "project_space", [...spaceKeys.keys()]);
    for (const [key, ref] of known) spaceIdOf.set(key, ref.rowId);
    const before = new Map<string, Set<string>>();
    for (const [key, { projectExternalId, name }] of spaceKeys) {
      if (spaceIdOf.has(key)) continue;
      const projectId = idOf({ kind: "planned", entity: "project", externalId: projectExternalId });
      let existing = before.get(projectId);
      if (!existing) {
        existing = new Set(
          (
            await tx
              .select({ id: projectSpaces.id })
              .from(projectSpaces)
              .where(eq(projectSpaces.projectId, projectId))
          ).map((r) => r.id),
        );
        before.set(projectId, existing);
      }
      const spaceId = await findOrCreateSpace(flowTx, projectId, name);
      spaceIdOf.set(key, spaceId);
      if (existing.has(spaceId)) continue;
      existing.add(spaceId);
      const [row] = await tx
        .select({ updatedAt: projectSpaces.updatedAt })
        .from(projectSpaces)
        .where(eq(projectSpaces.id, spaceId));
      record("project_space", key, spaceId, row?.updatedAt ?? null, { name });
      counts.spaces++;
    }
  }

  // --- tasks, then child tasks --------------------------------------------
  const taskValues = (t: FlowTask) => {
    const spaceKey = t.space?.trim() ? spaceExternalId(t.project.externalId, t.source) : null;
    return {
      projectId: idOf(t.project),
      parentTaskId: t.parentTask ? idOf(t.parentTask) : null,
      ...flowTaskColumns(t, spaceKey ? (spaceIdOf.get(spaceKey) ?? null) : null),
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
    };
  };
  counts.tasks = (
    await step(
      "task",
      plannedTasks.filter((t) => t.parentTask == null),
      tasks,
      taskValues,
      byId,
      (t) => t.data,
    )
  ).length;
  counts.childTasks = (
    await step(
      "task",
      plannedTasks.filter((t) => t.parentTask != null),
      tasks,
      taskValues,
      byId,
      (t) => t.data,
    )
  ).length;

  // --- "Asignar cliente y origen" of new projects without a client ---------
  // translate plans it as task `<project>:assign_client` (BE §10.3); when it
  // didn't, the project flow rule writes it here, with its ref.
  for (const p of newProjects) {
    if (p.client) continue;
    const externalId = `${p.externalId}${ASSIGN_CLIENT_REF_SUFFIX}`;
    if (!isNew("task", externalId)) continue;
    const projectId = idOf({ kind: "planned", entity: "project", externalId: p.externalId });
    await ensureAssignClientTask(flowTx, projectId, importedById);
    const [row] = await tx
      .select({ id: tasks.id, updatedAt: tasks.updatedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          eq(tasks.systemKey, ASSIGN_CLIENT_SYSTEM_KEY),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    if (!row) continue;
    record("task", externalId, row.id, row.updatedAt ?? null, { source: p.source });
    counts.assignClientTasks++;
  }

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

  // --- project_stages.closed_at of every (project, tramo) written ----------
  const written = new Map<string, { projectId: string; workflowId: string }>();
  for (const s of stages) written.set(`${s.projectId}:${s.workflowId}`, s);
  for (const t of freshTasks) {
    if (t.kind === "admin" || !t.workflowId) continue;
    const projectId = idOf(t.project);
    written.set(`${projectId}:${t.workflowId}`, { projectId, workflowId: t.workflowId });
  }
  if (written.size > 0) {
    // Only pairs with a stage row: a refresh never creates one.
    const pairs = [...written.values()];
    const existing = await tx
      .select({ projectId: projectStages.projectId, workflowId: projectStages.workflowId })
      .from(projectStages)
      .where(inArray(projectStages.projectId, [...new Set(pairs.map((p) => p.projectId))]));
    const has = new Set(existing.map((r) => `${r.projectId}:${r.workflowId}`));
    for (const pair of pairs) {
      if (has.has(`${pair.projectId}:${pair.workflowId}`))
        await refreshStageClosed(flowTx, pair.projectId, pair.workflowId);
    }
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

type Env = Record<string, string | undefined>;

export interface ApplyDeps {
  openDb: () => MondayDbHandle;
  /** The plan lookups over the transaction; `createPlanDbLookups` by default. */
  lookups?: (db: ImportDb) => PlanLookups;
  /** The Drive client for the DRIVE_NOT_CONFIGURED check and phase B; the env service account by default. */
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
  return `${c.contacts} contacts, ${c.contactPeople} contact people, ${c.providerProfiles} provider profiles, ${c.projects} projects, ${c.projectSchedules} cronogramas, ${c.tasks} tasks, ${c.childTasks} child tasks, ${c.checklistItems} checklist items, ${c.taskSupport} task support rows, ${c.dependencies} dependencies, ${c.comments} comments, ${c.cronogramaRows} cronograma rows, ${c.files} files pending upload, ${c.stages} tramo stages${c.spaces ? `, ${c.spaces} espacios` : ""}${c.assignClientTasks ? `, ${c.assignClientTasks} "Asignar cliente y origen" tasks` : ""}`;
}

/** Builds the `apply` handler; tests pass their own database, Drive and phase B. */
export function createApplyCommand(
  deps: ApplyDeps = { openDb: () => createMondayDb() },
): CommandHandler {
  const phaseB =
    deps.phaseB ??
    createPhaseB({
      openDrive: deps.openDrive ?? openServiceAccountDrive,
      env: deps.env,
    });
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
