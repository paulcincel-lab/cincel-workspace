import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  contacts,
  driveFiles,
  projectContacts,
  projectLinks,
  projectMembers,
  projectStages,
  projects,
  staff,
  workflowPhases,
  workflows,
} from "@/lib/db/schema";
import { listHistory, recordChanges, recordComment } from "@/lib/repositories/history-repository";
import type {
  ContactRef,
  ContactType,
  DriveFileInput,
  HistoryEvent,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectLinkInput,
  ProjectListItem,
  ProjectStatus,
  ProjectTramo,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import { flowError } from "@/lib/project-flow/errors";
import { startTramo } from "@/lib/project-flow/start-tramo";
import type { FlowTx } from "@/lib/project-flow/db";
import { normalizeTaskLinkUrl } from "@/lib/tasks/task-links";

type ProjectRow = typeof projects.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    clientId: row.clientId,
    // Not written by any path yet; filtered by viewer once DTOs take a ViewerScope.
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
  };
}

const PROJECT_TRACKED_FIELDS = [
  "code",
  "name",
  "clientId",
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

/** Every started tramo of each project, in workflow order (Presale → Diseño → …). */
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

const stageRef = (r: StageRow): WorkflowRef => ({ id: r.id, key: r.key, name: r.name, sortOrder: r.sortOrder });

/** `ProjectTramo`s from stage rows; `current` = the project's `current_workflow_id`. */
function toTramos(rows: StageRow[] | undefined, currentWorkflowId: string | null): ProjectTramo[] {
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

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
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
      totalTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false)::int`,
      openTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status <> 'completado')::int`,
      blockedTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status = 'bloqueado')::int`,
      // First catalog fase of the current tramo with an open, live, unarchived task.
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
        filters.clientId ? eq(projects.clientId, filters.clientId) : undefined,
        filters.managerId ? eq(projects.managerId, filters.managerId) : undefined,
        // A project is "in" every one of its stages, not only its primary one.
        filters.currentWorkflowId
          ? sql`exists (select 1 from core.project_stages ps where ps.project_id = ${projects.id} and ps.workflow_id = ${filters.currentWorkflowId})`
          : undefined,
        filters.involvesStaffId
          ? sql`(${projects.managerId} = ${filters.involvesStaffId} or ${projects.coordinatorId} = ${filters.involvesStaffId} or exists (select 1 from core.project_members pm where pm.project_id = ${projects.id} and pm.staff_id = ${filters.involvesStaffId}))`
          : undefined,
        filters.search
          ? sql`(${projects.name} ilike ${"%" + filters.search.trim() + "%"} or ${contacts.name} ilike ${"%" + filters.search.trim() + "%"})`
          : undefined
      )
    )
    .orderBy(asc(projects.name));

  const stagesByProject = await loadStageRows(rows.map((r) => r.project.id));
  return rows.map((r) => ({
    ...toProject(r.project),
    client: toClient(r.project.clientId, r.clientName, r.clientType),
    currentWorkflow: r.workflowId
      ? { id: r.workflowId, key: r.workflowKey!, name: r.workflowName!, sortOrder: r.workflowSortOrder! }
      : null,
    tramos: toTramos(stagesByProject.get(r.project.id), r.project.currentWorkflowId),
    activePhase: r.activePhase ?? null,
    needsTramo: r.project.currentWorkflowId === null,
    stages: (stagesByProject.get(r.project.id) ?? []).map(stageRef),
    manager: r.managerId ? { id: r.managerId, name: r.managerName! } : null,
    coordinator: r.coordinatorId ? { id: r.coordinatorId, name: r.coordinatorName! } : null,
    taskCounts: { total: r.totalTasks, open: r.openTasks, blocked: r.blockedTasks },
  }));
}

export async function getProject(id: string): Promise<ProjectDetail | null> {
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
  });
  if (!row) return null;
  const stageRows = (await loadStageRows([row.id])).get(row.id);
  return {
    ...toProject(row),
    client: row.client ? { id: row.client.id, name: row.client.name, type: row.client.type } : null,
    currentWorkflow: row.currentWorkflow
      ? {
          id: row.currentWorkflow.id,
          key: row.currentWorkflow.key,
          name: row.currentWorkflow.name,
          sortOrder: row.currentWorkflow.sortOrder,
        }
      : null,
    tramos: toTramos(stageRows, row.currentWorkflowId),
    needsTramo: row.currentWorkflowId === null,
    stages: (stageRows ?? []).map(stageRef),
    manager: row.manager ? { id: row.manager.id, name: row.manager.name } : null,
    coordinator: row.coordinator ? { id: row.coordinator.id, name: row.coordinator.name } : null,
    originStaff: row.originStaff ? { id: row.originStaff.id, name: row.originStaff.name } : null,
    // Admins only; filled once getProject takes a ViewerScope (BE §8.5).
    mondayImport: null,
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

/** Column values of a project input; the current tramo is written only by `startTramo` / `setProjectCurrentTramo`. */
function toValues(input: ProjectInput) {
  return {
    code: clean(input.code),
    name: input.name.trim(),
    clientId: input.clientId,
    status: input.status ?? "activo",
    projectType: clean(input.projectType),
    addressStreet: clean(input.addressStreet),
    addressCity: clean(input.addressCity),
    addressState: clean(input.addressState),
    managerId: input.managerId ?? null,
    coordinatorId: input.coordinatorId ?? null,
    progress: input.progress ?? 0,
    startDate: clean(input.startDate),
    endDate: clean(input.endDate),
    contractAmountMxn: clean(input.contractAmountMxn),
  };
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

/** Rethrows a project name unique violation as NAME_TAKEN. */
function rethrowNameTaken(err: unknown): never {
  if (isProjectNameTaken(err)) throw flowError("NAME_TAKEN");
  throw err;
}

/** The first active tramo by `sort_order` when it auto-starts on create, with its active fases in catalog order. */
async function onCreateTramo(tx: FlowTx): Promise<{ id: string; phaseIds: string[] } | null> {
  const [first] = await tx
    .select({ id: workflows.id, autoStart: workflows.autoStart })
    .from(workflows)
    .where(and(eq(workflows.active, true), isNull(workflows.deletedAt)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name))
    .limit(1);
  if (!first || first.autoStart !== "on_create") return null;
  const phases = await tx
    .select({ id: workflowPhases.id })
    .from(workflowPhases)
    .where(and(eq(workflowPhases.workflowId, first.id), eq(workflowPhases.active, true)))
    .orderBy(asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  return { id: first.id, phaseIds: phases.map((p) => p.id) };
}

/**
 * Create a project (BE §9.4), in one transaction: insert it, then, when the
 * first active tramo auto-starts on create, start it with every active fase
 * and no assignee (`startTramo`, trigger `on_create`). The create form still
 * requires a client until the name-only sheet ships. Errors:
 * PROJECT_CLIENT_REQUIRED, EMPTY, NAME_TAKEN.
 */
export async function createProject(input: ProjectInput, actorId: string): Promise<ProjectDetail> {
  if (!input.clientId) throw new Error("PROJECT_CLIENT_REQUIRED");
  const name = input.name?.trim() ?? "";
  if (!name) throw flowError("EMPTY");
  if (name.length > 120) throw flowError("INVALID", "name");

  const id = await db
    .transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ ...toValues({ ...input, name }), currentWorkflowId: null })
        .returning();
      const tramo = await onCreateTramo(tx);
      if (tramo && tramo.phaseIds.length > 0) {
        await startTramo(tx, {
          projectId: row.id,
          workflowId: tramo.id,
          phaseIds: tramo.phaseIds,
          assignment: { mode: "none" },
          actorId,
          trigger: "on_create",
        });
      }
      await recordChanges(
        {
          entity: "project",
          entityId: row.id,
          actorId,
          before: { name: null },
          after: { name: row.name },
          fields: ["name"],
        },
        tx
      );
      return row.id;
    })
    .catch(rethrowNameTaken);
  return (await getProject(id))!;
}

export async function updateProject(
  id: string,
  patch: Partial<ProjectInput>,
  actorId: string
): Promise<ProjectDetail> {
  const [before] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  if (!before) throw new Error("PROJECT_NOT_FOUND");

  const pick = <K extends keyof ProjectInput & keyof ProjectRow>(k: K) =>
    (patch[k] === undefined ? before[k] : patch[k]) as ProjectInput[K];

  const merged = toValues({
    code: pick("code"),
    name: pick("name") ?? before.name,
    clientId: pick("clientId") ?? before.clientId,
    status: pick("status"),
    projectType: pick("projectType"),
    addressStreet: pick("addressStreet"),
    addressCity: pick("addressCity"),
    addressState: pick("addressState"),
    managerId: pick("managerId"),
    coordinatorId: pick("coordinatorId"),
    progress: pick("progress"),
    startDate: pick("startDate"),
    endDate: pick("endDate"),
    contractAmountMxn: pick("contractAmountMxn"),
  });
  // NAME_TAKEN also on un-archiving a project whose name is now taken (BE §7.3).
  if (!merged.name) throw flowError("EMPTY");
  const [after] = await db
    .update(projects)
    .set(merged)
    .where(eq(projects.id, id))
    .returning()
    .catch(rethrowNameTaken);
  await recordChanges({
    entity: "project",
    entityId: id,
    actorId,
    before,
    after,
    fields: PROJECT_TRACKED_FIELDS,
  });
  return (await getProject(id))!;
}

/** The live project's current tramo and whether `workflowId` has a stage row on it. */
async function loadTramoState(
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
 * Sets the current tramo (BE §8.5), replacing the old stage setters:
 * requires a `project_stages` row (NOT_STARTED) and records the history change.
 * Errors: NOT_FOUND (project or tramo), NOT_STARTED.
 */
export async function setProjectCurrentTramo(id: string, workflowId: string, actorId: string): Promise<ProjectDetail> {
  const state = await loadTramoState(id, workflowId);
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
  return (await getProject(id))!;
}

/**
 * Admin "Asignar tramo" (BE §7.3): on a project without a current tramo, opens
 * the stage of `workflowId` and makes it current through `startTramo` with
 * `stageOnly` (no fases, no tasks), so only `startTramo` writes stages.
 * Errors: NOT_FOUND, NOT_STARTED (the project already has a current tramo).
 */
export async function assignProjectTramo(id: string, workflowId: string, actorId: string): Promise<ProjectDetail> {
  const state = await loadTramoState(id, workflowId);
  if (!state) throw flowError("NOT_FOUND");
  if (state.currentWorkflowId !== null) throw flowError("NOT_STARTED");
  await db.transaction((tx) =>
    startTramo(tx, {
      projectId: id,
      workflowId,
      phaseIds: [],
      assignment: { mode: "none" },
      actorId,
      trigger: "manual",
      stageOnly: true,
    })
  );
  return (await getProject(id))!;
}

/** Soft delete. Tasks stay linked; they disappear with the project on read. */
export async function softDeleteProject(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning();
  if (!row) throw new Error("PROJECT_NOT_FOUND");
  await recordChanges({
    entity: "project",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
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
    syncedAt: input.syncedAt ? new Date(input.syncedAt) : new Date(),
  };
  const [row] = await db
    .insert(driveFiles)
    .values({ googleFileId: input.googleFileId, ...values })
    .onConflictDoUpdate({ target: driveFiles.googleFileId, set: values })
    .returning({ id: driveFiles.id });
  return row.id;
}
