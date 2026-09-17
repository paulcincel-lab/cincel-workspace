import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  contacts,
  driveFiles,
  projectContacts,
  projectLinks,
  projectMembers,
  projects,
  staff,
  tasks,
  workflowTaskTemplates,
  workflows,
} from "@/lib/db/schema";
import { recordChanges } from "@/lib/repositories/history-repository";
import { toTemplate } from "@/lib/repositories/workflows-repository";
import type {
  ApplyWorkflowPreview,
  DriveFileInput,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectLink,
  ProjectListItem,
  ProjectStatus,
  Task,
} from "@/lib/types/core";
import { toTask } from "@/lib/repositories/tasks-repository";

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
    status: row.status,
    currentWorkflowId: row.currentWorkflowId,
    phase: row.phase,
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
  "phase",
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
      managerId: manager.id,
      managerName: manager.name,
      coordinatorId: coordinator.id,
      coordinatorName: coordinator.name,
      totalTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false)::int`,
      openTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status <> 'completado')::int`,
      blockedTasks: sql<number>`(select count(*) from core.tasks t where t.project_id = ${projects.id} and t.deleted_at is null and t.archived = false and t.status = 'bloqueado')::int`,
    })
    .from(projects)
    .innerJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(workflows, eq(workflows.id, projects.currentWorkflowId))
    .leftJoin(manager, eq(manager.id, projects.managerId))
    .leftJoin(coordinator, eq(coordinator.id, projects.coordinatorId))
    .where(
      and(
        isNull(projects.deletedAt),
        statuses && statuses.length > 0 ? inArray(projects.status, statuses) : undefined,
        filters.clientId ? eq(projects.clientId, filters.clientId) : undefined,
        filters.managerId ? eq(projects.managerId, filters.managerId) : undefined,
        filters.currentWorkflowId ? eq(projects.currentWorkflowId, filters.currentWorkflowId) : undefined,
        filters.involvesStaffId
          ? sql`(${projects.managerId} = ${filters.involvesStaffId} or ${projects.coordinatorId} = ${filters.involvesStaffId} or exists (select 1 from core.project_members pm where pm.project_id = ${projects.id} and pm.staff_id = ${filters.involvesStaffId}))`
          : undefined,
        filters.search
          ? sql`(${projects.name} ilike ${"%" + filters.search.trim() + "%"} or ${contacts.name} ilike ${"%" + filters.search.trim() + "%"})`
          : undefined
      )
    )
    .orderBy(asc(projects.name));

  return rows.map((r) => ({
    ...toProject(r.project),
    client: { id: r.project.clientId, name: r.clientName, type: r.clientType },
    currentWorkflow: r.workflowId
      ? { id: r.workflowId, key: r.workflowKey!, name: r.workflowName! }
      : null,
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
      members: { with: { staff: true } },
      contacts: { with: { contact: true } },
      links: { orderBy: asc(projectLinks.kind) },
    },
  });
  if (!row) return null;
  return {
    ...toProject(row),
    client: { id: row.client.id, name: row.client.name, type: row.client.type },
    currentWorkflow: row.currentWorkflow
      ? { id: row.currentWorkflow.id, key: row.currentWorkflow.key, name: row.currentWorkflow.name }
      : null,
    manager: row.manager ? { id: row.manager.id, name: row.manager.name } : null,
    coordinator: row.coordinator ? { id: row.coordinator.id, name: row.coordinator.name } : null,
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
  return { id: row.id, kind: row.kind, title: row.title, url: row.url, driveFileId: row.driveFileId };
}

function toValues(input: ProjectInput) {
  return {
    code: clean(input.code),
    name: input.name.trim(),
    clientId: input.clientId,
    status: input.status ?? "activo",
    currentWorkflowId: input.currentWorkflowId ?? null,
    phase: clean(input.phase),
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

/**
 * Create a project. The client must be a `cliente` contact and the stage a
 * workflow; the database enforces the first, this checks the second up front
 * so the caller gets a clear error.
 */
export async function createProject(input: ProjectInput, actorId: string): Promise<ProjectDetail> {
  if (!input.clientId) throw new Error("PROJECT_CLIENT_REQUIRED");
  if (!input.currentWorkflowId) throw new Error("PROJECT_STAGE_REQUIRED");

  const [row] = await db.insert(projects).values(toValues(input)).returning();
  await recordChanges({
    entity: "project",
    entityId: row.id,
    actorId,
    before: { name: null },
    after: { name: row.name },
    fields: ["name"],
  });
  return (await getProject(row.id))!;
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
    currentWorkflowId: pick("currentWorkflowId") ?? null,
    phase: pick("phase"),
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
  const [after] = await db.update(projects).set(merged).where(eq(projects.id, id)).returning();
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

export async function setProjectStage(
  id: string,
  workflowId: string,
  actorId: string
): Promise<ProjectDetail> {
  return updateProject(id, { currentWorkflowId: workflowId }, actorId);
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

/** Set or replace the link of one kind (administrativo, planos, ...). Empty url removes it. */
export async function setProjectLink(
  projectId: string,
  kind: string,
  link: { url: string; title?: string | null; drive?: DriveFileInput | null }
): Promise<ProjectLink | null> {
  const url = link.url.trim();
  if (!url) {
    await db
      .delete(projectLinks)
      .where(and(eq(projectLinks.projectId, projectId), eq(projectLinks.kind, kind)));
    return null;
  }
  const driveFileId = link.drive ? await upsertDriveFile(link.drive) : null;
  const values = { title: clean(link.title), url, driveFileId };
  const [row] = await db
    .insert(projectLinks)
    .values({ projectId, kind, ...values })
    .onConflictDoUpdate({ target: [projectLinks.projectId, projectLinks.kind], set: values })
    .returning();
  return toLink(row);
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

// ── Apply workflow ──────────────────────────────────────────────────────────

/** Which templates would be created and which are already on the project. */
export async function previewApplyWorkflow(
  projectId: string,
  workflowId: string
): Promise<ApplyWorkflowPreview> {
  const [wf] = await db
    .select({ id: workflows.id, key: workflows.key, name: workflows.name })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
    .limit(1);
  if (!wf) throw new Error("WORKFLOW_NOT_FOUND");

  const templates = await db
    .select()
    .from(workflowTaskTemplates)
    .where(and(eq(workflowTaskTemplates.workflowId, workflowId), eq(workflowTaskTemplates.active, true)))
    .orderBy(asc(workflowTaskTemplates.sortOrder));

  const applied = await db
    .select({ templateId: tasks.templateId })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt), ne(tasks.kind, "usuario")));
  const appliedIds = new Set(applied.map((a) => a.templateId));

  const create = templates.filter((t) => !appliedIds.has(t.id)).map(toTemplate);
  const skip = templates.filter((t) => appliedIds.has(t.id)).map(toTemplate);
  return { workflow: wf, create, skip };
}

function addDays(base: string | null, days: number | null): string | null {
  if (!base || days === null) return null;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create one workflow task per template not yet on the project. Idempotent:
 * the partial unique on (project, template) makes a re-apply a no-op.
 * Dates are offsets from the project's start date when both are set.
 */
export async function applyWorkflow(
  projectId: string,
  workflowId: string,
  actorId: string,
  options: { managerId?: string | null; setAsStage?: boolean } = {}
): Promise<Task[]> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  const preview = await previewApplyWorkflow(projectId, workflowId);
  if (preview.create.length === 0 && !options.setAsStage) return [];

  const rows = await db.transaction(async (tx) => {
    const inserted =
      preview.create.length === 0
        ? []
        : await tx
            .insert(tasks)
            .values(
              preview.create.map((t) => ({
                projectId,
                kind: "workflow" as const,
                templateId: t.id,
                workflowId,
                phase: t.phase,
                title: t.title,
                notes: t.notes,
                createdById: actorId,
                managerId: options.managerId ?? project.managerId ?? null,
                priority: t.defaultPriority,
                commitmentDate: addDays(project.startDate, t.commitmentOffsetDays),
                reviewDate: addDays(project.startDate, t.reviewOffsetDays),
                deliveryDate: addDays(project.startDate, t.deliveryOffsetDays),
              }))
            )
            .onConflictDoNothing()
            .returning();

    if (options.setAsStage && project.currentWorkflowId !== workflowId) {
      await tx.update(projects).set({ currentWorkflowId: workflowId }).where(eq(projects.id, projectId));
      await recordChanges(
        {
          entity: "project",
          entityId: projectId,
          actorId,
          before: { currentWorkflowId: project.currentWorkflowId },
          after: { currentWorkflowId: workflowId },
          fields: ["currentWorkflowId"],
        },
        tx
      );
    }
    if (inserted.length > 0) {
      await recordChanges(
        {
          entity: "project",
          entityId: projectId,
          actorId,
          before: { workflow_applied: null },
          after: { workflow_applied: `${preview.workflow.key}: ${inserted.length}` },
          fields: ["workflow_applied"],
        },
        tx
      );
    }
    return inserted;
  });

  return rows.map(toTask);
}
