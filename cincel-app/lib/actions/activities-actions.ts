"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  activities,
  activityChecklistItems,
  activityHistory,
  activitySupportMembers,
} from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { selectNewHistoryEntries } from "@/lib/actions/activities-history";
import type { Task, WorkflowType } from "@/lib/types/task";

async function requireActivitiesCapabilities() {
  return resolveActivitiesCapabilities(await requireCapabilityUser());
}

/**
 * The app's WorkflowType carries accents/ñ ("Diseño", "Construcción"); the
 * Postgres `core.workflow_type` enum is ASCII ("Diseno", "Construccion").
 */
const WORKFLOW_TO_DB = {
  Presale: "Presale",
  "Diseño": "Diseno",
  "Construcción": "Construccion",
} as const satisfies Record<WorkflowType, string>;

const WORKFLOW_FROM_DB: Record<string, WorkflowType> = {
  Presale: "Presale",
  Diseno: "Diseño",
  Construccion: "Construcción",
};

type DbWorkflow = (typeof WORKFLOW_TO_DB)[WorkflowType];

type ActivityRow = {
  legacyId: number | null;
  projectNameSnapshot: string | null;
  workflow: string;
  phase: string | null;
  description: string;
  notes: string | null;
  managerNameSnapshot: string | null;
  status: string;
  priority: string;
  commitmentDate: string | null;
  reviewDate: string | null;
  deliveryDate: string | null;
  archived: boolean;
  createdAtLabel: string | null;
  updatedAtLabel: string | null;
  supportMembers: Array<{ supportNameSnapshot: string | null }>;
  history: Array<{
    legacyId: number | null;
    authorNameSnapshot: string | null;
    eventDate: string | null;
    comment: string;
  }>;
  checklistItems: Array<{
    legacyId: number | null;
    title: string;
    completed: boolean;
    sortOrder: number;
  }>;
};

function toTask(row: ActivityRow): Task {
  return {
    id: row.legacyId ?? 0,
    project: row.projectNameSnapshot ?? "",
    workflow: WORKFLOW_FROM_DB[row.workflow] ?? (row.workflow as WorkflowType),
    phase: row.phase ?? "",
    description: row.description,
    notes: row.notes ?? "",
    manager: row.managerNameSnapshot ?? "",
    support: row.supportMembers
      .map((m) => m.supportNameSnapshot)
      .filter((n): n is string => Boolean(n)),
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    commitmentDate: row.commitmentDate ?? "",
    reviewDate: row.reviewDate ?? "",
    deliveryDate: row.deliveryDate ?? undefined,
    updatedAt: row.updatedAtLabel ?? "",
    createdAt: row.createdAtLabel ?? "",
    archived: row.archived,
    history: row.history.map((h, i) => ({
      id: h.legacyId ?? i + 1,
      date: h.eventDate ?? "",
      author: h.authorNameSnapshot ?? "",
      comment: h.comment,
    })),
    checklist: row.checklistItems
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.legacyId ?? c.sortOrder,
        title: c.title,
        completed: c.completed,
      })),
  };
}

export async function fetchActivitiesAction(
  workflow: WorkflowType
): Promise<Task[]> {
  const caps = await requireActivitiesCapabilities();
  if (!caps.canViewActivities) return [];

  const dbWorkflow = WORKFLOW_TO_DB[workflow];
  const rows = await db.query.activities.findMany({
    where: and(
      eq(activities.workflow, dbWorkflow),
      eq(activities.archived, false),
      isNull(activities.deletedAt)
    ),
    orderBy: asc(activities.commitmentDate),
    with: {
      supportMembers: true,
      history: true,
      checklistItems: true,
    },
  });

  return rows.map((r) => toTask(r as unknown as ActivityRow));
}

async function upsertActivity(task: Task): Promise<void> {
  const dbWorkflow: DbWorkflow = WORKFLOW_TO_DB[task.workflow];

  const values = {
    legacyId: task.id,
    projectNameSnapshot: task.project || null,
    workflow: dbWorkflow,
    phase: task.phase || null,
    description: task.description,
    notes: task.notes || null,
    managerNameSnapshot: task.manager || null,
    status: task.status,
    priority: task.priority,
    commitmentDate: task.commitmentDate || null,
    reviewDate: task.reviewDate || null,
    deliveryDate: task.deliveryDate || null,
    archived: task.archived ?? false,
    createdAtLabel: task.createdAt || null,
    updatedAtLabel: task.updatedAt || null,
  };

  // legacy_id is unique only per (workflow) among live rows — see the partial
  // unique index `activities_legacy_id_workflow_uq`.
  const [row] = await db
    .insert(activities)
    .values(values)
    .onConflictDoUpdate({
      target: [activities.legacyId, activities.workflow],
      targetWhere: and(
        isNull(activities.deletedAt),
        sql`${activities.legacyId} is not null`
      ),
      set: values,
    })
    .returning({ id: activities.id });
  const activityId = row.id;

  // Children carry no stable id from the UI — replace wholesale.
  await db
    .delete(activitySupportMembers)
    .where(eq(activitySupportMembers.activityId, activityId));
  const support = (task.support ?? []).filter(Boolean);
  if (support.length > 0) {
    await db.insert(activitySupportMembers).values(
      support.map((name) => ({
        activityId,
        supportNameSnapshot: name,
      }))
    );
  }

  // History is a chronological bitácora — append-only, NEVER deleted
  // (AGENTS.md "Nunca eliminar historial"). Insert only entries not already
  // persisted, so a stale or partial client payload can't drop rows.
  const existingHistory = await db
    .select({
      legacyId: activityHistory.legacyId,
      eventDate: activityHistory.eventDate,
      authorNameSnapshot: activityHistory.authorNameSnapshot,
      comment: activityHistory.comment,
    })
    .from(activityHistory)
    .where(eq(activityHistory.activityId, activityId));

  const newHistory = selectNewHistoryEntries(existingHistory, task.history).map(
    (h) => ({
      activityId,
      legacyId: typeof h.id === "number" ? h.id : null,
      authorNameSnapshot: h.author || null,
      eventDate: h.date || null,
      comment: h.comment,
    })
  );

  if (newHistory.length > 0) {
    await db.insert(activityHistory).values(newHistory);
  }

  await db
    .delete(activityChecklistItems)
    .where(eq(activityChecklistItems.activityId, activityId));
  if (task.checklist.length > 0) {
    await db.insert(activityChecklistItems).values(
      task.checklist.map((c, i) => ({
        activityId,
        legacyId: typeof c.id === "number" ? c.id : null,
        title: c.title,
        completed: c.completed,
        sortOrder: i,
      }))
    );
  }
}

export async function saveActivitiesAction(
  workflow: WorkflowType,
  tasks: Task[]
): Promise<void> {
  const caps = await requireActivitiesCapabilities();
  if (!caps.canCreateActivity) {
    throw new Error("FORBIDDEN: activities write");
  }
  void workflow;
  // Persist each task independently: a single bad row (e.g. a stale constraint
  // violation) must not block the rest of the batch.
  const failures: Array<{ id: number; error: unknown }> = [];
  for (const task of tasks) {
    try {
      await upsertActivity(task);
    } catch (error) {
      failures.push({ id: task.id, error });
    }
  }
  if (failures.length > 0) {
    console.error(
      `saveActivitiesAction: ${failures.length}/${tasks.length} task(s) failed to persist`,
      failures.map((f) => `#${f.id}: ${(f.error as Error).message}`)
    );
    if (failures.length === tasks.length) {
      throw new Error("activities write: all rows failed to persist");
    }
  }
  revalidatePath("/tareas");
  revalidatePath("/tareas/presale");
  revalidatePath("/tareas/diseno");
  revalidatePath("/tareas/construccion");
}

const REVALIDATE_TAREAS_ROUTES = [
  "/tareas",
  "/tareas/presale",
  "/tareas/diseno",
  "/tareas/construccion",
] as const;

function revalidateTareas() {
  for (const route of REVALIDATE_TAREAS_ROUTES) revalidatePath(route);
}

type AssistantCreateActivityInput = {
  description: string;
  workflow: WorkflowType;
  project?: string;
  manager?: string;
  priority?: "Alta" | "Media" | "Baja";
  phase?: string;
  commitmentDate?: string;
  reviewDate?: string;
};

/**
 * Assistant-facing tool action: create a single task. Own capability check
 * (`canCreateActivity`) — the AI assistant's tool set is built from the same
 * capabilities, this is defense in depth. Always logs an activity_history entry
 * naming the requesting user (bitácora — never overwrite history).
 */
export async function createActivityViaAssistantAction(
  input: AssistantCreateActivityInput
): Promise<{
  ok: true;
  description: string;
  workflow: WorkflowType;
  manager: string | null;
}> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: activities create");
  }

  const today = new Date().toISOString().slice(0, 10);
  const description = input.description.trim();
  const manager = input.manager?.trim() || null;
  const requester = user.member.name || user.email || "Asistente";

  const [row] = await db
    .insert(activities)
    .values({
      projectNameSnapshot: input.project?.trim() || null,
      workflow: WORKFLOW_TO_DB[input.workflow],
      phase: input.phase?.trim() || null,
      description,
      managerNameSnapshot: manager,
      status: "Pendiente",
      priority: input.priority ?? "Media",
      commitmentDate: input.commitmentDate || null,
      reviewDate: input.reviewDate || null,
      createdOn: today,
      updatedOn: today,
    })
    .returning({ id: activities.id });

  await db.insert(activityHistory).values({
    activityId: row.id,
    authorNameSnapshot: requester,
    eventDate: today,
    comment: `Tarea creada por el asistente a solicitud de ${requester}.`,
  });

  revalidateTareas();
  return { ok: true, description, workflow: input.workflow, manager };
}

type AssistantAssignActivityInput = {
  descriptionContains: string;
  manager: string;
  workflow?: WorkflowType;
  project?: string;
};

/**
 * Assistant-facing tool action: reassign a task's responsible. Requires
 * `canChangeResponsible`. Locates the task by a description fragment (+ optional
 * project / workflow); refuses to act on 0 or >1 matches so the assistant asks
 * the user to disambiguate.
 */
export async function assignActivityViaAssistantAction(
  input: AssistantAssignActivityInput
): Promise<
  | { ok: true; description: string; previousManager: string | null; manager: string }
  | { ok: false; reason: "no_match" | "ambiguous"; candidates: string[] }
> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canChangeResponsible) {
    throw new Error("FORBIDDEN: activities reassign");
  }

  const matches = await db
    .select({
      id: activities.id,
      description: activities.description,
      project: activities.projectNameSnapshot,
      manager: activities.managerNameSnapshot,
    })
    .from(activities)
    .where(
      and(
        isNull(activities.deletedAt),
        eq(activities.archived, false),
        ilike(activities.description, `%${input.descriptionContains.trim()}%`),
        input.workflow ? eq(activities.workflow, WORKFLOW_TO_DB[input.workflow]) : undefined,
        input.project
          ? ilike(activities.projectNameSnapshot, `%${input.project.trim()}%`)
          : undefined
      )
    )
    .limit(10);

  if (matches.length === 0) return { ok: false, reason: "no_match", candidates: [] };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: matches.map(
        (m) => `${m.description}${m.project ? ` — ${m.project}` : ""}`
      ),
    };
  }

  const target = matches[0];
  const manager = input.manager.trim();
  const today = new Date().toISOString().slice(0, 10);
  const requester = user.member.name || user.email || "Asistente";

  await db
    .update(activities)
    .set({ managerNameSnapshot: manager, managerMemberId: null, updatedOn: today })
    .where(eq(activities.id, target.id));

  await db.insert(activityHistory).values({
    activityId: target.id,
    authorNameSnapshot: requester,
    eventDate: today,
    comment: `Responsable reasignado de ${
      target.manager ?? "sin asignar"
    } a ${manager} por el asistente (solicitado por ${requester}).`,
  });

  revalidateTareas();
  return {
    ok: true,
    description: target.description,
    previousManager: target.manager,
    manager,
  };
}

export async function saveActivityAction(task: Task): Promise<void> {
  const caps = await requireActivitiesCapabilities();
  if (!caps.canCreateActivity) {
    throw new Error("FORBIDDEN: activities write");
  }
  await upsertActivity(task);
  revalidatePath("/tareas");
}
