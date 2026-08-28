"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  activities,
  activityChecklistItems,
  activityHistory,
  activitySupportMembers,
} from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
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

  // legacy_id has no unique constraint (activities predate the legacy-id keying
  // convention) — resolve by (legacy_id, workflow) then insert/update.
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.legacyId, task.id),
        eq(activities.workflow, dbWorkflow),
        isNull(activities.deletedAt)
      )
    )
    .limit(1);

  let activityId: string;
  if (existing) {
    activityId = existing.id;
    await db.update(activities).set(values).where(eq(activities.id, existing.id));
  } else {
    const [row] = await db
      .insert(activities)
      .values(values)
      .returning({ id: activities.id });
    activityId = row.id;
  }

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

  await db
    .delete(activityHistory)
    .where(eq(activityHistory.activityId, activityId));
  if (task.history.length > 0) {
    await db.insert(activityHistory).values(
      task.history.map((h) => ({
        activityId,
        legacyId: typeof h.id === "number" ? h.id : null,
        authorNameSnapshot: h.author || null,
        eventDate: h.date || null,
        comment: h.comment,
      }))
    );
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

export async function saveActivityAction(task: Task): Promise<void> {
  const caps = await requireActivitiesCapabilities();
  if (!caps.canCreateActivity) {
    throw new Error("FORBIDDEN: activities write");
  }
  await upsertActivity(task);
  revalidatePath("/tareas");
}
