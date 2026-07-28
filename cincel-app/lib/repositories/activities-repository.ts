import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import type { Task, WorkflowType } from "@/lib/types/task";

export type { Task, WorkflowType };

export function activitiesStorageKey(workflow: WorkflowType): string {
  return `cincel.actividades.${workflow}.tasks.v1`;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

type SupabaseActivity = {
  id: string;
  legacy_id: number | null;
  project_name_snapshot: string | null;
  workflow: string;
  phase: string | null;
  description: string;
  notes: string | null;
  manager_name_snapshot: string | null;
  status: string;
  priority: string;
  commitment_date: string | null;
  review_date: string | null;
  delivery_date: string | null;
  archived: boolean;
  created_at_label: string | null;
  updated_at_label: string | null;
  core_activity_support_members: Array<{ support_name_snapshot: string | null }>;
  core_activity_history: Array<{
    legacy_id: number | null;
    author_name_snapshot: string | null;
    event_date: string | null;
    comment: string;
  }>;
  core_activity_checklist_items: Array<{
    legacy_id: number | null;
    title: string;
    completed: boolean;
    sort_order: number;
  }>;
};

function mapSupabaseActivity(row: SupabaseActivity): Task {
  const support = row.core_activity_support_members
    .map((m) => m.support_name_snapshot)
    .filter((n): n is string => Boolean(n));

  const history = row.core_activity_history.map((h, index) => ({
    id: h.legacy_id ?? index + 1,
    date: h.event_date ?? "",
    author: h.author_name_snapshot ?? "",
    comment: h.comment,
  }));

  const checklist = row.core_activity_checklist_items
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      id: c.legacy_id ?? c.sort_order,
      title: c.title,
      completed: c.completed,
    }));

  return {
    id: row.legacy_id ?? 0,
    project: row.project_name_snapshot ?? "",
    workflow: row.workflow as WorkflowType,
    phase: row.phase ?? "",
    description: row.description,
    notes: row.notes ?? "",
    manager: row.manager_name_snapshot ?? "",
    support,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    commitmentDate: row.commitment_date ?? "",
    reviewDate: row.review_date ?? "",
    deliveryDate: row.delivery_date ?? undefined,
    updatedAt: row.updated_at_label ?? "",
    createdAt: row.created_at_label ?? "",
    archived: row.archived,
    history,
    checklist,
  };
}

// ── Fallbacks de mock por workflow ────────────────────────────────────────────

function getBaseTasksForWorkflow(workflow: WorkflowType): Task[] {
  if (workflow === "Presale") return presaleTasks;
  if (workflow === "Diseño") return disenoTasks;
  return operativasTasks;
}

// ── Snapshot (sync) ──────────────────────────────────────────────────────────

export function getActivitiesSnapshot(workflow: WorkflowType): Task[] {
  if (typeof window === "undefined") {
    return getBaseTasksForWorkflow(workflow);
  }

  const key = activitiesStorageKey(workflow);
  const stored = readStorage(key);

  if (!stored) {
    return getBaseTasksForWorkflow(workflow);
  }

  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : getBaseTasksForWorkflow(workflow);
  } catch {
    return getBaseTasksForWorkflow(workflow);
  }
}

// ── Fetch (async) ─────────────────────────────────────────────────────────────

export async function fetchActivities(workflow: WorkflowType): Promise<Task[]> {
  if (!isSupabaseEnabled()) {
    return getActivitiesSnapshot(workflow);
  }

  const client = getSupabaseClient();

  if (!client) {
    return getActivitiesSnapshot(workflow);
  }

  const { data, error } = await client
    .schema("core")
    .from("activities")
    .select(
      `
      id, legacy_id, project_name_snapshot, workflow, phase, description, notes,
      manager_name_snapshot, status, priority,
      commitment_date, review_date, delivery_date,
      archived, created_at_label, updated_at_label,
      core_activity_support_members (support_name_snapshot),
      core_activity_history (legacy_id, author_name_snapshot, event_date, comment),
      core_activity_checklist_items (legacy_id, title, completed, sort_order)
    `
    )
    .eq("workflow", workflow)
    .eq("archived", false)
    .is("deleted_at", null)
    .order("commitment_date", { ascending: true });

  if (error || !data) {
    throw new SupabaseOperationError(
      `fetchActivities(${workflow})`,
      error?.message ?? "No se recibieron datos de core.activities"
    );
  }

  const tasks = (data as unknown as SupabaseActivity[]).map(mapSupabaseActivity);

  return tasks;
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveActivities(workflow: WorkflowType, tasks: Task[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(activitiesStorageKey(workflow), JSON.stringify(tasks));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (typeof window !== "undefined") {
      writeStorage(activitiesStorageKey(workflow), JSON.stringify(tasks));
    }
    return;
  }

  const rows = tasks.map((t) => ({
    legacy_id: t.id,
    project_name_snapshot: t.project,
    workflow: t.workflow,
    phase: t.phase || null,
    description: t.description,
    notes: t.notes || null,
    manager_name_snapshot: t.manager || null,
    status: t.status,
    priority: t.priority,
    commitment_date: t.commitmentDate || null,
    review_date: t.reviewDate || null,
    delivery_date: t.deliveryDate ?? null,
    archived: false,
    created_at_label: t.createdAt || null,
    updated_at_label: t.updatedAt || null,
  }));

  const { error } = await client
    .schema("core")
    .from("activities")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError(`saveActivities(${workflow})`, error.message);
  }

}

// ── Upsert individual ─────────────────────────────────────────────────────────

export async function saveActivity(task: Task): Promise<void> {
  if (!isSupabaseEnabled()) {
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    return;
  }

  const { error } = await client
    .schema("core")
    .from("activities")
    .upsert(
      {
        legacy_id: task.id,
        project_name_snapshot: task.project,
        workflow: task.workflow,
        phase: task.phase || null,
        description: task.description,
        notes: task.notes || null,
        manager_name_snapshot: task.manager || null,
        status: task.status,
        priority: task.priority,
        commitment_date: task.commitmentDate || null,
        review_date: task.reviewDate || null,
        delivery_date: task.deliveryDate ?? null,
        archived: false,
        created_at_label: task.createdAt || null,
        updated_at_label: task.updatedAt || null,
      },
      { onConflict: "legacy_id" }
    );

  if (error) {
    throw new SupabaseOperationError(`saveActivity(id=${task.id})`, error.message);
  }
}
