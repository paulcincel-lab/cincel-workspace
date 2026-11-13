import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  contacts,
  driveFiles,
  historyEvents,
  portalAuditEvents,
  projectContacts,
  projectLinks,
  projectMembers,
  projectPortalAccess,
  projectStages,
  projects,
  staff,
  tasks,
  workflows,
} from "@/lib/db/schema";
import { listHistory, recordChanges, recordComment } from "@/lib/repositories/history-repository";
import type {
  ContactRef,
  ContactType,
  DriveFileInput,
  HistoryEvent,
  Project,
  ProjectCreateInput,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectLinkInput,
  ProjectListItem,
  ProjectStatus,
  ProjectEtapa,
  StaffRef,
  ViewerScope,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import { startEtapa } from "@/lib/project-flow/start-etapa";
import { UNSCOPED_VIEWER, scopeProjectDto } from "@/lib/auth/viewer-scope";
import { normalizeTaskLinkUrl } from "@/lib/tasks/task-links";
import { closeAssignClientTask, ensureAssignClientTask } from "@/lib/project-flow/admin-tasks";
import { autoStartOnCreate, startChosenOnCreate } from "@/lib/project-flow/auto-start";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import { parseInput, ProjectCreateInputSchema } from "@/lib/validation/project-flow";
import {
  PROJECT_RESTORE_DAYS,
  type DeletedProjectRow,
  type ProjectDeletePreview,
  type ProjectDeleteResult,
  type ProjectRestoreResult,
} from "@/lib/types/project-delete";

type ProjectRow = typeof projects.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Project DTO; `clientId`, `origin` and `originStaffId` are null unless the viewer is admin (BE §8.5). */
export function toProject(row: ProjectRow, viewer: ViewerScope): Project {
  return scopeProjectDto({
    id: row.id,
    code: row.code,
    name: row.name,
    clientId: row.clientId,
    // Admin only: null for non-admins (scopeProjectDto).
    origin: row.origin,
    originStaffId: row.originStaffId,
    status: row.status,
    currentWorkflowId: row.currentWorkflowId,
    projectType: row.projectType,
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    addressState: row.addressState,
    managerId: row.managerId,
    coordinatorId: row.coordinatorId,
    progress: row.progress,
    startDate: row.startDate,
    endDate: row.endDate,
    contractAmountMxn: row.contractAmountMxn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }, viewer);
}

const PROJECT_TRACKED_FIELDS = [
  "code",
  "name",
  "clientId",
  "origin",
  "originStaffId",
  "status",
  "currentWorkflowId",
  "projectType",
  "addressStreet",
  "addressCity",
  "addressState",
  "managerId",
  "coordinatorId",
  "progress",
  "startDate",
  "endDate",
  "contractAmountMxn",
] as const;

type StageRow = WorkflowRef & { startedAt: Date; closedAt: Date | null };

/** Every started etapa of each project, in workflow order (Presale → Diseño → …). */
async function loadStageRows(projectIds: string[]): Promise<Map<string, StageRow[]>> {
  const out = new Map<string, StageRow[]>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({
      projectId: projectStages.projectId,
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
      sortOrder: workflows.sortOrder,
      startedAt: projectStages.startedAt,
      closedAt: projectStages.closedAt,
    })
    .from(projectStages)
    .innerJoin(workflows, eq(workflows.id, projectStages.workflowId))
    .where(and(inArray(projectStages.projectId, projectIds), isNull(workflows.deletedAt)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name));
  for (const { projectId, ...r } of rows) {
    const list = out.get(projectId) ?? [];
    list.push(r);
    out.set(projectId, list);
  }
  return out;
}

/** Active staff in `project_members` of each project, by name (one statement). */
async function loadMemberRefs(projectIds: string[]): Promise<Map<string, StaffRef[]>> {
  const out = new Map<string, StaffRef[]>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({ projectId: projectMembers.projectId, id: staff.id, name: staff.name })
    .from(projectMembers)
    .innerJoin(staff, eq(staff.id, projectMembers.staffId))
    .where(and(inArray(projectMembers.projectId, projectIds), eq(staff.active, true), isNull(staff.deletedAt)))
    .orderBy(asc(staff.name));
  for (const { projectId, id, name } of rows) {
    const list = out.get(projectId) ?? [];
    if (!list.some((m) => m.id === id)) list.push({ id, name });
    out.set(projectId, list);
  }
  return out;
}

const stageRef = (r: StageRow): WorkflowRef => ({ id: r.id, key: r.key, name: r.name, sortOrder: r.sortOrder });

/** `ProjectEtapa`s from stage rows; `current` = the project's `current_workflow_id`. */
function toEtapas(rows: StageRow[] | undefined, currentWorkflowId: string | null): ProjectEtapa[] {
  return (rows ?? []).map((r) => ({
    ...stageRef(r),
    startedAt: r.startedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    current: r.id === currentWorkflowId,
  }));
}

const toClient = (clientId: string | null, name: string | null, type: ContactType | null): ContactRef | null =>
  clientId && name && type ? { id: clientId, name, type } : null;

const manager = alias(staff, "manager");
const coordinator = alias(staff, "coordinator");

export type ProjectFilters = {
  status?: ProjectStatus | ProjectStatus[];
  clientId?: string;
  managerId?: string;
  involvesStaffId?: string;
  currentWorkflowId?: string;
  search?: string;
};

/**
 * Project list for `viewer`. Non-admins get no client data, can't filter or
 * search by client, and admin tasks don't count in their task counts (BE §12).
 */
export async function listProjects(filters: ProjectFilters, viewer: ViewerScope): Promise<ProjectListItem[]> {
  const countedKinds = viewer.isAdmin ? sql`` : sql` and t.kind <> 'admin'`;
  const statuses = filters.status
    ? Array.isArray(filters.status)
      ? filters.status
      : [filters.status]
    : undefined;

  const rows = await db
    .select({
      project: projects,
      clientName: contacts.name,
      clientType: contacts.type,
      workflowId: workflows.id,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSortOrder: workflows.sortOrder,
      managerId: manager.id,
      managerName: manager.name,
      coordinatorId: coordinator.id,
      coordinatorName: coordinator.name,
      totalTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false${countedKinds})::int`,
      openTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status <> 'completado'${countedKinds})::int`,
      blockedTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status = 'bloqueado'${countedKinds})::int`,
      // First catalog fase of the current etapa with an open, live, unarchived task.
      activePhase: sql<WorkflowPhaseRef | null>`(select json_build_object('id', p.id, 'name', p.name, 'sortOrder', p.sort_order) from core.workflow_phases p where p.workflow_id = ${projects.currentWorkflowId} and exists (select 1 from core.tasks t where t.project_id = ${projects.id} and t.phase_id = p.id and t.deleted_at is null and t.archived = false and t.status <> 'completado') order by p.sort_order, p.name limit 1)`,
    })
    .from(projects)
    // A project's client is optional (project flow): a left join keeps client-less projects.
    .leftJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(workflows, eq(workflows.id, projects.currentWorkflowId))
    .leftJoin(manager, eq(manager.id, projects.managerId))
    .leftJoin(coordinator, eq(coordinator.id, projects.coordinatorId))
    .where(
      and(
        isNull(projects.deletedAt),
        statuses && statuses.length > 0 ? inArray(projects.status, statuses) : undefined,
        filters.clientId && viewer.isAdmin ? eq(projects.clientId, filters.clientId) : undefined,
        filters.managerId ? eq(projects.managerId, filters.managerId) : undefined,
        // A project is "in" every one of its stages, not only its primary one.
        filters.currentWorkflowId
          ? sql`exists (select 1 from core.project_stages ps where ps.project_id = ${projects.id} and ps.workflow_id = ${filters.currentWorkflowId})`
          : undefined,
        filters.involvesStaffId
          ? sql`(${projects.managerId} = ${filters.involvesStaffId} or ${projects.coordinatorId} = ${filters.involvesStaffId} or exists (select 1 from core.project_members pm where pm.project_id = ${projects.id} and pm.staff_id = ${filters.involvesStaffId}))`
          : undefined,
        filters.search
          ? viewer.isAdmin
            ? sql`(${projects.name} ilike ${"%" + filters.search.trim() + "%"} or ${contacts.name} ilike ${"%" + filters.search.trim() + "%"})`
            : sql`${projects.name} ilike ${"%" + filters.search.trim() + "%"}`
          : undefined
      )
    )
    .orderBy(asc(projects.name));

  const ids = rows.map((r) => r.project.id);
  const [stagesByProject, membersByProject] = await Promise.all([loadStageRows(ids), loadMemberRefs(ids)]);
  return rows.map((r) => ({
    ...toProject(r.project, viewer),
    client: viewer.isAdmin ? toClient(r.project.clientId, r.clientName, r.clientType) : null,
    currentWorkflow: r.workflowId
      ? { id: r.workflowId, key: r.workflowKey!, name: r.workflowName!, sortOrder: r.workflowSortOrder! }
      : null,
    etapas: toEtapas(stagesByProject.get(r.project.id), r.project.currentWorkflowId),
    activePhase: r.activePhase ?? null,
    needsEtapa: r.project.currentWorkflowId === null,
    stages: (stagesByProject.get(r.project.id) ?? []).map(stageRef),
    manager: r.managerId ? { id: r.managerId, name: r.managerName! } : null,
    coordinator: r.coordinatorId ? { id: r.coordinatorId, name: r.coordinatorName! } : null,
    members: membersByProject.get(r.project.id) ?? [],
    taskCounts: { total: r.totalTasks, open: r.openTasks, blocked: r.blockedTasks },
  }));
}

/**
 * The monday boards a project was imported from (import refs of entity `project`), or null when it wasn't
 * imported. Admin-only data (BE §8.5): "Reacomodar importación" uses it.
 */
/** The project's monday import refs' `data`, read inside the project query (no extra statement). */
const mondayImportRefsData = sql<unknown[] | null>`(select json_agg(ir.data) from core.import_refs ir where ir.source = 'monday' and ir.entity = 'project' and ir.row_id = ${projects.id})`;

function mondayImportOf(refsData: unknown[] | null): ProjectDetail["mondayImport"] {
  const refs = (refsData ?? []).map((data) => ({ data }));
  if (refs.length === 0) return null;
  const boards = new Map<string, string>();
  for (const ref of refs) {
    const source = (ref.data as { source?: { boardId?: unknown; boardName?: unknown } } | null)?.source;
    if (source?.boardId == null) continue;
    const boardId = String(source.boardId);
    if (!boards.has(boardId)) boards.set(boardId, typeof source.boardName === "string" ? source.boardName : boardId);
  }
  return { boards: [...boards].map(([boardId, name]) => ({ id: boardId, name })) };
}

/** Project detail for `viewer`: client, origin, origin staff and monday import are admin only (BE §8.5). */
export async function getProject(id: string, viewer: ViewerScope): Promise<ProjectDetail | null> {
  const row = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    with: {
      client: true,
      currentWorkflow: true,
      manager: true,
      coordinator: true,
      originStaff: true,
      members: { with: { staff: true } },
      contacts: { with: { contact: true } },
      links: { orderBy: asc(projectLinks.createdAt) },
    },
    extras: { mondayImportRefs: mondayImportRefsData.as("monday_import_refs") },
  });
  if (!row) return null;
  const stageRows = (await loadStageRows([row.id])).get(row.id);
  return {
    ...toProject(row, viewer),
    client: viewer.isAdmin && row.client ? { id: row.client.id, name: row.client.name, type: row.client.type } : null,
    currentWorkflow: row.currentWorkflow
      ? {
          id: row.currentWorkflow.id,
          key: row.currentWorkflow.key,
          name: row.currentWorkflow.name,
          sortOrder: row.currentWorkflow.sortOrder,
        }
      : null,
    etapas: toEtapas(stageRows, row.currentWorkflowId),
    needsEtapa: row.currentWorkflowId === null,
    stages: (stageRows ?? []).map(stageRef),
    manager: row.manager ? { id: row.manager.id, name: row.manager.name } : null,
    coordinator: row.coordinator ? { id: row.coordinator.id, name: row.coordinator.name } : null,
    originStaff: viewer.isAdmin && row.originStaff ? { id: row.originStaff.id, name: row.originStaff.name } : null,
    // Admins only (BE §8.5).
    mondayImport: viewer.isAdmin ? mondayImportOf(row.mondayImportRefs) : null,
    members: row.members
      .filter((m) => m.staff.deletedAt === null)
      .map((m) => ({ id: m.staff.id, name: m.staff.name, role: m.role, active: m.staff.active }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    contacts: row.contacts
      .filter((c) => c.contact.deletedAt === null)
      .map((c) => ({ id: c.contact.id, name: c.contact.name, type: c.contact.type, role: c.role })),
    links: row.links.map(toLink),
  };
}

function toLink(row: typeof projectLinks.$inferSelect): ProjectLink {
  return { id: row.id, kind: row.kind as ProjectLink["kind"], title: row.title, url: row.url, driveFileId: row.driveFileId };
}

/** Patch keys `updateProject` writes; `phase`/`phases`/`currentWorkflowId` are no longer edited here. */
const PROJECT_EDITABLE_FIELDS = [
  "code",
  "name",
  "clientId",
  "origin",
  "originStaffId",
  "status",
  "projectType",
  "addressStreet",
  "addressCity",
  "addressState",
  "managerId",
  "coordinatorId",
  "progress",
  "startDate",
  "endDate",
  "contractAmountMxn",
] as const satisfies ReadonlyArray<keyof ProjectInput & keyof ProjectRow>;

/** Patch keys only administrators may send (BE §7.3, RD-12). */
export const PROJECT_ADMIN_FIELDS = ["clientId", "origin", "originStaffId"] as const;

/** Free-text patch fields: trimmed, blank → null. */
const PROJECT_TEXT_FIELDS = new Set<string>([
  "code",
  "origin",
  "projectType",
  "addressStreet",
  "addressCity",
  "addressState",
  "startDate",
  "endDate",
  "contractAmountMxn",
]);

/** Live project statuses the firm-wide name rule covers (BE §9.9). */
const NAME_UNIQUE_STATUSES: ProjectStatus[] = ["activo", "pausado"];

/**
 * NAME_TAKEN pre-check (BE §9.9): another live, active or paused project with
 * the same name, case-insensitive. `projects_name_lower_uq` is the final guard.
 */
async function assertProjectNameFree(exec: FlowExecutor, name: string, exceptId?: string): Promise<void> {
  const [clash] = await exec
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        isNull(projects.deletedAt),
        inArray(projects.status, NAME_UNIQUE_STATUSES),
        sql`lower(${projects.name}) = lower(${name})`,
        exceptId ? ne(projects.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (clash) throw flowError(FLOW_ERROR.NAME_TAKEN);
}

const UNIQUE_VIOLATION = "23505";
/** `projects_name_lower_uq` (0024) and the per-client index it replaces. */
const PROJECT_NAME_INDEXES = new Set(["projects_name_lower_uq", "projects_client_name_lower_uq"]);

/** Whether an error (or its `cause`, as drizzle wraps driver errors) is a project name unique violation. */
export function isProjectNameTaken(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
      if (e.code === UNIQUE_VIOLATION) {
        const constraint = e.constraint_name ?? e.constraint;
        return typeof constraint === "string" && PROJECT_NAME_INDEXES.has(constraint);
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Create a project with only a name (BE §9.4), in one transaction: the row
 * (no client), the admin task "Asignar cliente y origen", the starting etapa
 * and the history `created` change. Without `startWorkflowId` the first
 * etapa starts when its auto-start is on; `null` starts none; an id starts
 * that etapa with `phaseIds` (#1034). Drive folders are the action's
 * `after()` work. Errors: EMPTY, INVALID, NAME_TAKEN, PHASE_MISMATCH,
 * NO_PHASES.
 */
export async function createProject(input: ProjectCreateInput, actorId: string): Promise<ProjectDetail> {
  const { name, startWorkflowId, phaseIds } = parseInput(ProjectCreateInputSchema, input);
  if (phaseIds !== undefined && !startWorkflowId) throw flowError(FLOW_ERROR.INVALID, "phaseIds");

  let projectId: string;
  try {
    projectId = await db.transaction(async (tx) => {
      await assertProjectNameFree(tx, name);
      const [row] = await tx
        .insert(projects)
        .values({ name, status: "activo", clientId: null })
        .returning({ id: projects.id, name: projects.name });
      await ensureAssignClientTask(tx, row.id, actorId);
      if (startWorkflowId === undefined) await autoStartOnCreate(tx, row.id, actorId);
      else if (startWorkflowId !== null) await startChosenOnCreate(tx, row.id, actorId, startWorkflowId, phaseIds);
      await recordChanges(
        {
          entity: "project",
          entityId: row.id,
          actorId,
          before: { created: null },
          after: { created: row.name },
          fields: ["created"],
        },
        tx
      );
      return row.id;
    });
  } catch (err) {
    if (isProjectNameTaken(err)) throw flowError(FLOW_ERROR.NAME_TAKEN);
    throw err;
  }
  return (await getProject(projectId, UNSCOPED_VIEWER))!;
}

/**
 * Edits a project's general data (BE §8.5). `clientId`, `origin` and
 * `originStaffId` are admin only (FORBIDDEN). Setting a client on a project
 * without one closes its "Asignar cliente y origen" task (BE §9.5); the
 * caller schedules the folder sync. Errors: FORBIDDEN, NOT_FOUND, EMPTY,
 * NAME_TAKEN.
 */
export async function updateProject(
  id: string,
  patch: Partial<ProjectInput>,
  actorId: string,
  viewer: ViewerScope
): Promise<ProjectDetail> {
  if (!viewer.isAdmin && PROJECT_ADMIN_FIELDS.some((k) => patch[k] !== undefined)) {
    throw flowError(FLOW_ERROR.FORBIDDEN, "admin only fields");
  }

  const values: Partial<Record<(typeof PROJECT_EDITABLE_FIELDS)[number], unknown>> = {};
  for (const key of PROJECT_EDITABLE_FIELDS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "name") {
      const trimmed = String(value).trim();
      if (!trimmed) throw flowError(FLOW_ERROR.EMPTY);
      if (trimmed.length > 120) throw flowError(FLOW_ERROR.INVALID, "name");
      values.name = trimmed;
    } else if (PROJECT_TEXT_FIELDS.has(key)) {
      values[key] = clean(value as string | null);
    } else {
      values[key] = value;
    }
  }

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1)
        .for("update");
      if (!before) throw flowError(FLOW_ERROR.NOT_FOUND);

      const nextName = (values.name as string | undefined) ?? before.name;
      const nextStatus = (values.status as ProjectStatus | undefined) ?? before.status;
      const nameChanged = nextName.toLowerCase() !== before.name.toLowerCase();
      const reentersRule = !NAME_UNIQUE_STATUSES.includes(before.status) && NAME_UNIQUE_STATUSES.includes(nextStatus);
      if (NAME_UNIQUE_STATUSES.includes(nextStatus) && (nameChanged || reentersRule)) {
        await assertProjectNameFree(tx, nextName, id);
      }

      if (Object.keys(values).length === 0) return;
      const [after] = await tx
        .update(projects)
        .set(values as Partial<typeof projects.$inferInsert>)
        .where(eq(projects.id, id))
        .returning();
      await recordChanges(
        { entity: "project", entityId: id, actorId, before, after, fields: PROJECT_TRACKED_FIELDS },
        tx
      );
      if (before.clientId === null && after.clientId !== null) {
        await closeAssignClientTask(tx, id, actorId);
      }
    });
  } catch (err) {
    if (isProjectNameTaken(err)) throw flowError(FLOW_ERROR.NAME_TAKEN);
    throw err;
  }
  return (await getProject(id, viewer))!;
}

/** The live project's current etapa and whether `workflowId` has a stage row on it. */
async function loadEtapaState(
  id: string,
  workflowId: string
): Promise<{ currentWorkflowId: string | null; started: boolean } | null> {
  const [row] = await db
    .select({
      currentWorkflowId: projects.currentWorkflowId,
      started: sql<boolean>`exists (select 1 from core.project_stages ps where ps.project_id = ${projects.id} and ps.workflow_id = ${workflowId})`,
    })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Sets the current etapa (BE §8.5), replacing the old stage setters:
 * requires a `project_stages` row (NOT_STARTED) and records the history change.
 * Errors: NOT_FOUND (project or etapa), NOT_STARTED.
 */
export async function setProjectCurrentEtapa(id: string, workflowId: string, actorId: string): Promise<ProjectDetail> {
  const state = await loadEtapaState(id, workflowId);
  if (!state) throw flowError("NOT_FOUND");
  if (!state.started) throw flowError("NOT_STARTED");
  if (state.currentWorkflowId !== workflowId) {
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ currentWorkflowId: workflowId }).where(eq(projects.id, id));
      await recordChanges(
        {
          entity: "project",
          entityId: id,
          actorId,
          before: { currentWorkflowId: state.currentWorkflowId },
          after: { currentWorkflowId: workflowId },
          fields: ["currentWorkflowId"],
        },
        tx
      );
    });
  }
  return (await getProject(id, UNSCOPED_VIEWER))!;
}

/**
 * Admin "Asignar etapa" (BE §7.3): on a project without a current etapa, opens
 * the stage of `workflowId` and makes it current through `startEtapa` with
 * `stageOnly` (no fases, no tasks), so only `startEtapa` writes stages.
 * Errors: NOT_FOUND, NOT_STARTED (the project already has a current etapa).
 */
export async function assignProjectEtapa(id: string, workflowId: string, actorId: string): Promise<ProjectDetail> {
  const state = await loadEtapaState(id, workflowId);
  if (!state) throw flowError("NOT_FOUND");
  if (state.currentWorkflowId !== null) throw flowError("NOT_STARTED");
  await db.transaction((tx) =>
    startEtapa(tx, {
      projectId: id,
      workflowId,
      phaseIds: [],
      assignment: { mode: "none" },
      actorId,
      trigger: "manual",
      stageOnly: true,
    })
  );
  return (await getProject(id, UNSCOPED_VIEWER))!;
}

// ── Delete and restore (#1050) ───────────────────────────────────────────────

const PROJECT_RESTORE_WINDOW_MS = PROJECT_RESTORE_DAYS * 24 * 60 * 60 * 1000;

/** Open: not completado and not in a live custom status that closes (as in the tasks repository). */
const openTaskSql = sql`(${tasks.status} <> 'completado' and not exists (select 1 from core.task_statuses ts_open where ts_open.id = ${tasks.customStatusId} and ts_open.deleted_at is null and ts_open.closes))`;

/** One `deleted` change per task, in one statement. */
async function recordTasksDeleted(tx: FlowExecutor, taskIds: string[], actorId: string | null, deleted: boolean) {
  if (taskIds.length === 0) return;
  await tx.insert(historyEvents).values(
    taskIds.map((entityId) => ({
      entity: "task" as const,
      entityId,
      kind: "cambio" as const,
      actorId,
      field: "deleted",
      beforeValue: String(!deleted),
      afterValue: String(deleted),
    }))
  );
}

/**
 * The delete dialog's counts: live tasks and subtasks of a live project, and
 * how many of them are open. Null when the project doesn't exist or is deleted.
 */
export async function getProjectDeletePreview(id: string): Promise<ProjectDeletePreview | null> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;
  const [counts] = await db
    .select({
      taskCount: sql<number>`count(*)::int`,
      openTaskCount: sql<number>`count(*) filter (where ${openTaskSql})::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)));
  return { ...project, taskCount: counts?.taskCount ?? 0, openTaskCount: counts?.openTaskCount ?? 0 };
}

/**
 * Deletes a project in one transaction (#1050): the project and all its live
 * tasks and subtasks get the same `deleted_at`, every active portal access to
 * it is revoked (with the portal audit row, as `revokeAccess` writes) and the
 * history rows are written. The Drive folder, the stages and the monday data
 * stay as they are. PROJECT_NOT_FOUND when it doesn't exist or is already deleted.
 */
export async function deleteProjectWithTasks(id: string, actorId: string): Promise<ProjectDeleteResult> {
  const deletedAt = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(projects)
      .set({ deletedAt })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning({ id: projects.id });
    if (!row) throw new Error("PROJECT_NOT_FOUND");
    const gone = await tx
      .update(tasks)
      .set({ deletedAt })
      .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    const revoked = await tx
      .update(projectPortalAccess)
      .set({ revokedAt: deletedAt, revokedByStaffId: actorId, updatedAt: deletedAt })
      .where(and(eq(projectPortalAccess.projectId, id), isNull(projectPortalAccess.revokedAt)))
      .returning({ portalUserId: projectPortalAccess.portalUserId });
    if (revoked.length > 0) {
      await tx
        .insert(portalAuditEvents)
        .values(revoked.map((r) => ({ kind: "revoke" as const, portalUserId: r.portalUserId, projectId: id, staffId: actorId })));
    }
    await recordChanges(
      { entity: "project", entityId: id, actorId, before: { deleted: false }, after: { deleted: true }, fields: ["deleted"] },
      tx
    );
    await recordTasksDeleted(
      tx,
      gone.map((t) => t.id),
      actorId,
      true
    );
    return { id, deletedAt: deletedAt.toISOString(), deletedTaskCount: gone.length };
  });
}

/** Who deleted the project last (its latest `deleted → true` history row). */
async function projectDeleterId(id: string): Promise<string | null> {
  const [event] = await db
    .select({ actorId: historyEvents.actorId })
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.entity, "project"),
        eq(historyEvents.entityId, id),
        eq(historyEvents.field, "deleted"),
        eq(historyEvents.afterValue, "true")
      )
    )
    .orderBy(desc(historyEvents.eventAt), desc(historyEvents.createdAt))
    .limit(1);
  return event?.actorId ?? null;
}

/**
 * Undoes `deleteProjectWithTasks` (#1050): the project and exactly the tasks
 * deleted with it (same `deleted_at`) come back. Within `PROJECT_RESTORE_DAYS`,
 * for an admin or the person who deleted it. Portal access is not restored.
 * Errors: NOT_FOUND (missing or not deleted), INVALID (window passed),
 * FORBIDDEN, NAME_TAKEN (a live project took the name meanwhile).
 */
export async function restoreProject(
  id: string,
  actor: { staffId: string; isAdmin: boolean },
  now: Date = new Date()
): Promise<ProjectRestoreResult> {
  const [row] = await db.select({ deletedAt: projects.deletedAt }).from(projects).where(eq(projects.id, id)).limit(1);
  const deletedAt = row?.deletedAt ?? null;
  if (!deletedAt) throw flowError(FLOW_ERROR.NOT_FOUND, "project");
  if (now.getTime() - deletedAt.getTime() > PROJECT_RESTORE_WINDOW_MS) throw flowError(FLOW_ERROR.INVALID, "restore window");
  if (!actor.isAdmin && (await projectDeleterId(id)) !== actor.staffId) {
    throw flowError(FLOW_ERROR.FORBIDDEN, "project restore");
  }
  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({ deletedAt: null })
        .where(and(eq(projects.id, id), eq(projects.deletedAt, deletedAt)))
        .returning({ id: projects.id });
      if (!project) throw flowError(FLOW_ERROR.NOT_FOUND, "project");
      const back = await tx
        .update(tasks)
        .set({ deletedAt: null })
        .where(and(eq(tasks.projectId, id), eq(tasks.deletedAt, deletedAt)))
        .returning({ id: tasks.id });
      await recordChanges(
        {
          entity: "project",
          entityId: id,
          actorId: actor.staffId || null,
          before: { deleted: true },
          after: { deleted: false },
          fields: ["deleted"],
        },
        tx
      );
      await recordTasksDeleted(
        tx,
        back.map((t) => t.id),
        actor.staffId || null,
        false
      );
      return { id, restoredTaskCount: back.length };
    });
  } catch (err) {
    if (isProjectNameTaken(err)) throw flowError(FLOW_ERROR.NAME_TAKEN);
    throw err;
  }
}

/**
 * Projects deleted within the last `PROJECT_RESTORE_DAYS`, newest first, with
 * who deleted them and how many tasks went with them.
 */
export async function listDeletedProjects(now: Date = new Date()): Promise<DeletedProjectRow[]> {
  const since = new Date(now.getTime() - PROJECT_RESTORE_WINDOW_MS);
  const deleter = alias(staff, "deleter");
  const deleterId = sql<string | null>`(select he.actor_id from core.history_events he where he.entity = 'project' and he.entity_id = ${projects.id} and he.field = 'deleted' and he.after_value = 'true' order by he.event_at desc, he.created_at desc limit 1)`;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: contacts.name,
      deletedAt: projects.deletedAt,
      deletedById: deleter.id,
      deletedByName: deleter.name,
      taskCount: sql<number>`(select count(*)::int from core.tasks t where t.project_id = ${projects.id} and t.deleted_at = ${projects.deletedAt})`,
    })
    .from(projects)
    .leftJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(deleter, eq(deleter.id, deleterId))
    .where(and(isNotNull(projects.deletedAt), gte(projects.deletedAt, since)))
    .orderBy(desc(projects.deletedAt));
  return rows.map((r) => {
    const deletedAt = r.deletedAt!;
    return {
      id: r.id,
      name: r.name,
      clientName: r.clientName ?? null,
      deletedAt: deletedAt.toISOString(),
      deletedBy: r.deletedById ? { id: r.deletedById, name: r.deletedByName ?? "" } : null,
      taskCount: r.taskCount,
      restorableUntil: new Date(deletedAt.getTime() + PROJECT_RESTORE_WINDOW_MS).toISOString(),
    };
  });
}

export async function setProjectMembers(
  projectId: string,
  members: Array<{ staffId: string; role?: string | null }>,
  actorId: string
): Promise<void> {
  const wanted = new Map(members.map((m) => [m.staffId, clean(m.role)]));
  const current = await db
    .select({ staffId: projectMembers.staffId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const currentIds = current.map((c) => c.staffId);
  const toRemove = currentIds.filter((id) => !wanted.has(id));

  await db.transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), inArray(projectMembers.staffId, toRemove)));
    }
    for (const [staffId, role] of wanted) {
      await tx
        .insert(projectMembers)
        .values({ projectId, staffId, role })
        .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.staffId], set: { role } });
    }
  });

  const added = [...wanted.keys()].filter((id) => !currentIds.includes(id));
  if (added.length > 0 || toRemove.length > 0) {
    await recordChanges({
      entity: "project",
      entityId: projectId,
      actorId,
      before: { members: currentIds.length },
      after: { members: wanted.size },
      fields: ["members"],
    });
  }
}

export async function setProjectContacts(
  projectId: string,
  list: Array<{ contactId: string; role?: string | null }>
): Promise<void> {
  const wanted = new Map(list.map((c) => [c.contactId, clean(c.role)]));
  const current = await db
    .select({ contactId: projectContacts.contactId })
    .from(projectContacts)
    .where(eq(projectContacts.projectId, projectId));
  const toRemove = current.map((c) => c.contactId).filter((id) => !wanted.has(id));

  await db.transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx
        .delete(projectContacts)
        .where(and(eq(projectContacts.projectId, projectId), inArray(projectContacts.contactId, toRemove)));
    }
    for (const [contactId, role] of wanted) {
      await tx
        .insert(projectContacts)
        .values({ projectId, contactId, role })
        .onConflictDoUpdate({ target: [projectContacts.projectId, projectContacts.contactId], set: { role } });
    }
  });
}

/** Add a link to a project; only http(s) URLs (see normalizeTaskLinkUrl). */
export async function addProjectLink(projectId: string, input: ProjectLinkInput): Promise<ProjectLink> {
  const title = input.title.trim();
  if (!title) throw new Error("PROJECT_LINK_TITLE_REQUIRED");
  const url = normalizeTaskLinkUrl(input.url);
  if (!url) throw new Error("PROJECT_LINK_URL_INVALID");
  if (input.kind !== "interno" && input.kind !== "cliente") throw new Error("PROJECT_LINK_KIND_INVALID");
  const [row] = await db.insert(projectLinks).values({ projectId, kind: input.kind, title, url }).returning();
  return toLink(row);
}

export async function removeProjectLink(projectId: string, linkId: string): Promise<void> {
  await db.delete(projectLinks).where(and(eq(projectLinks.id, linkId), eq(projectLinks.projectId, projectId)));
}

/** True when the project exists and isn't deleted. */
export async function projectExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  return Boolean(row);
}

/** Project bitácora: comments and changes, newest first. */
export async function listProjectHistory(projectId: string): Promise<HistoryEvent[]> {
  return listHistory("project", projectId);
}

/** Append a `comentario` to the project bitácora. `comment` must be non-blank. */
export async function addProjectComment(projectId: string, comment: string, actorId: string): Promise<HistoryEvent> {
  return recordComment({ entity: "project", entityId: projectId, actorId, comment });
}

export async function upsertDriveFile(input: DriveFileInput): Promise<string> {
  const values = {
    fileName: input.fileName,
    mimeType: input.mimeType,
    iconLink: input.iconLink,
    thumbnailLink: input.thumbnailLink,
    webViewLink: input.webViewLink,
    // A caller that doesn't know the size leaves the stored one as is.
    ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
    syncedAt: input.syncedAt ? new Date(input.syncedAt) : new Date(),
  };
  const [row] = await db
    .insert(driveFiles)
    .values({ googleFileId: input.googleFileId, ...values })
    .onConflictDoUpdate({ target: driveFiles.googleFileId, set: values })
    .returning({ id: driveFiles.id });
  return row.id;
}
