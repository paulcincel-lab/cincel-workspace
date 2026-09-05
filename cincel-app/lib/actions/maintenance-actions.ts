"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  activities,
  activityChecklistItems,
  activityHistory,
  activitySupportMembers,
  clientContacts,
  clientHistory,
  clients,
  projectMembers,
  projects,
} from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = keyOf(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

// ── Find duplicates ────────────────────────────────────────────────────────

export type DuplicateGroup = {
  key: string;
  rows: Array<{ id: string; legacyId: number | null; label: string; detail: string }>;
};

export type FindDuplicatesResult = {
  clients: DuplicateGroup[];
  activities: DuplicateGroup[];
  projectMembers: DuplicateGroup[];
};

/**
 * Read-only scan for likely-duplicate rows. Any authenticated user; each
 * section is populated only if the caller can view that module.
 */
export async function findDuplicatesAction(): Promise<FindDuplicatesResult> {
  const user = await requireCapabilityUser();
  const clientsCaps = resolveClientsCapabilities(user);
  const activitiesCaps = resolveActivitiesCapabilities(user);

  const result: FindDuplicatesResult = {
    clients: [],
    activities: [],
    projectMembers: [],
  };

  if (clientsCaps.canViewClients) {
    const rows = await db
      .select({
        id: clients.id,
        legacyId: clients.legacyId,
        name: clients.name,
        kind: clients.kind,
        projectCount: sql<number>`(
          select count(*)::int from ${projects} p
          where p.client_id = ${clients.id} and p.deleted_at is null
        )`,
      })
      .from(clients)
      .where(isNull(clients.deletedAt));

    const byName = groupBy(rows, (r) => r.name.trim().toLowerCase());
    for (const [k, group] of byName) {
      if (group.length < 2) continue;
      result.clients.push({
        key: k,
        rows: group.map((r) => ({
          id: r.id,
          legacyId: r.legacyId,
          label: r.name,
          detail: `${r.kind} · ${r.projectCount} proyecto(s)`,
        })),
      });
    }
  }

  if (activitiesCaps.canViewActivities) {
    const rows = await db
      .select({
        id: activities.id,
        legacyId: activities.legacyId,
        project: activities.projectNameSnapshot,
        workflow: activities.workflow,
        description: activities.description,
        status: activities.status,
        historyCount: sql<number>`(
          select count(*)::int from ${activityHistory} h
          where h.activity_id = ${activities.id}
        )`,
      })
      .from(activities)
      .where(and(isNull(activities.deletedAt), eq(activities.archived, false)));

    const byKey = groupBy(
      rows,
      (r) => `${r.project ?? ""}|${r.workflow}|${r.description.trim().toLowerCase()}`
    );
    for (const [k, group] of byKey) {
      if (group.length < 2) continue;
      result.activities.push({
        key: k,
        rows: group.map((r) => ({
          id: r.id,
          legacyId: r.legacyId,
          label: `${r.description}${r.project ? ` — ${r.project}` : ""}`,
          detail: `${r.workflow} · ${r.status} · ${r.historyCount} evento(s) de bitácora`,
        })),
      });
    }
  }

  if (clientsCaps.canViewClients || activitiesCaps.canViewActivities) {
    const rows = await db
      .select({
        id: projectMembers.id,
        projectId: projectMembers.projectId,
        teamMemberId: projectMembers.teamMemberId,
        name: projectMembers.memberNameSnapshot,
      })
      .from(projectMembers)
      .where(isNull(projectMembers.deletedAt));

    const byKey = groupBy(
      rows,
      (r) => `${r.projectId}|${r.teamMemberId ?? r.name ?? ""}`
    );
    for (const [k, group] of byKey) {
      if (group.length < 2) continue;
      result.projectMembers.push({
        key: k,
        rows: group.map((r) => ({
          id: r.id,
          legacyId: null,
          label: r.name ?? "(sin nombre)",
          detail: `proyecto ${r.projectId}`,
        })),
      });
    }
  }

  return result;
}

// ── Merge duplicate clients ────────────────────────────────────────────────

export type MergeClientsResult =
  | {
      ok: true;
      survivor: string;
      merged: string[];
      repointed: { projects: number; contacts: number; history: number };
    }
  | { ok: false; reason: "not_a_duplicate" | "not_found"; candidates: string[] };

/**
 * Merge all non-deleted clients sharing `name` (case-insensitive) into one.
 * Survivor = the client with the most projects, tie-broken by lowest legacy id.
 * Repoints projects / contacts / history, soft-deletes the losers, logs the
 * merge on the survivor. Requires `canDeleteClient` (Administrador / Dirección).
 */
export async function mergeDuplicateClientsAction(input: {
  name: string;
}): Promise<MergeClientsResult> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canDeleteClient) {
    throw new Error("FORBIDDEN: clients delete");
  }

  const name = input.name.trim();
  const matches = await db
    .select({
      id: clients.id,
      legacyId: clients.legacyId,
      name: clients.name,
      createdAt: clients.createdAt,
      projectCount: sql<number>`(
        select count(*)::int from ${projects} p
        where p.client_id = ${clients.id} and p.deleted_at is null
      )`,
    })
    .from(clients)
    .where(and(sql`lower(${clients.name}) = lower(${name})`, isNull(clients.deletedAt)));

  if (matches.length === 0) return { ok: false, reason: "not_found", candidates: [] };
  if (matches.length === 1) {
    return { ok: false, reason: "not_a_duplicate", candidates: [matches[0].name] };
  }

  const sorted = [...matches].sort(
    (a, b) =>
      b.projectCount - a.projectCount ||
      (a.legacyId ?? Number.MAX_SAFE_INTEGER) - (b.legacyId ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );
  const survivor = sorted[0];
  const losers = sorted.slice(1);
  const loserIds = losers.map((l) => l.id);
  const now = new Date();
  const requester = user.member.name || user.email || "Asistente";

  const repointed = { projects: 0, contacts: 0, history: 0 };
  await db.transaction(async (tx) => {
    const p = await tx
      .update(projects)
      .set({ clientId: survivor.id })
      .where(inArray(projects.clientId, loserIds))
      .returning({ id: projects.id });
    repointed.projects = p.length;

    const c = await tx
      .update(clientContacts)
      .set({ clientId: survivor.id })
      .where(inArray(clientContacts.clientId, loserIds))
      .returning({ id: clientContacts.id });
    repointed.contacts = c.length;

    const h = await tx
      .update(clientHistory)
      .set({ clientId: survivor.id })
      .where(inArray(clientHistory.clientId, loserIds))
      .returning({ id: clientHistory.id });
    repointed.history = h.length;

    await tx
      .update(clients)
      .set({ deletedAt: now })
      .where(inArray(clients.id, loserIds));

    await tx.insert(clientHistory).values({
      clientId: survivor.id,
      field: "merge",
      beforeValue: losers.map((l) => `#${l.legacyId ?? "?"}`).join(", "),
      afterValue: `#${survivor.legacyId ?? "?"}`,
      authorName: requester,
    });
  });

  revalidatePath("/directorio");
  revalidatePath("/proyectos");

  return {
    ok: true,
    survivor: `${survivor.name} (#${survivor.legacyId ?? "?"})`,
    merged: losers.map((l) => `#${l.legacyId ?? "?"}`),
    repointed,
  };
}

// ── Merge duplicate activities ─────────────────────────────────────────────

export type MergeActivitiesResult =
  | { ok: true; survivor: string; merged: number; repointedHistory: number }
  | { ok: false; reason: "not_a_duplicate" | "not_found" | "ambiguous"; candidates: string[] };

/**
 * Merge non-deleted, non-archived activities that share
 * (projectNameSnapshot, workflow, description). Survivor keeps the most
 * bitácora; children are repointed, losers soft-deleted. Requires
 * `canDeleteActivity` (Administrador / Dirección).
 */
export async function mergeDuplicateActivitiesAction(input: {
  projectName: string;
  descriptionContains: string;
  workflow?: "Presale" | "Diseño" | "Construcción";
}): Promise<MergeActivitiesResult> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canDeleteActivity) {
    throw new Error("FORBIDDEN: activities delete");
  }

  const dbWorkflow =
    input.workflow === "Diseño"
      ? "Diseno"
      : input.workflow === "Construcción"
        ? "Construccion"
        : input.workflow === "Presale"
          ? "Presale"
          : undefined;

  const matches = await db
    .select({
      id: activities.id,
      description: activities.description,
      project: activities.projectNameSnapshot,
      workflow: activities.workflow,
      historyCount: sql<number>`(
        select count(*)::int from ${activityHistory} h where h.activity_id = ${activities.id}
      )`,
    })
    .from(activities)
    .where(
      and(
        isNull(activities.deletedAt),
        eq(activities.archived, false),
        sql`${activities.projectNameSnapshot} ilike ${`%${input.projectName.trim()}%`}`,
        sql`${activities.description} ilike ${`%${input.descriptionContains.trim()}%`}`,
        dbWorkflow ? eq(activities.workflow, dbWorkflow) : undefined
      )
    );

  if (matches.length === 0) return { ok: false, reason: "not_found", candidates: [] };
  if (matches.length === 1) {
    return { ok: false, reason: "not_a_duplicate", candidates: [matches[0].description] };
  }

  // All matches must share the exact dedupe key, else the caller was too broad.
  const key = (r: (typeof matches)[number]) =>
    `${r.project ?? ""}|${r.workflow}|${r.description.trim().toLowerCase()}`;
  const keys = new Set(matches.map(key));
  if (keys.size > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: matches.map((m) => `${m.description}${m.project ? ` — ${m.project}` : ""}`),
    };
  }

  const sorted = [...matches].sort((a, b) => b.historyCount - a.historyCount);
  const survivor = sorted[0];
  const loserIds = sorted.slice(1).map((l) => l.id);
  const now = new Date();
  const requester = user.member.name || user.email || "Asistente";

  let repointedHistory = 0;
  await db.transaction(async (tx) => {
    const h = await tx
      .update(activityHistory)
      .set({ activityId: survivor.id })
      .where(inArray(activityHistory.activityId, loserIds))
      .returning({ id: activityHistory.id });
    repointedHistory = h.length;

    await tx
      .update(activitySupportMembers)
      .set({ activityId: survivor.id })
      .where(inArray(activitySupportMembers.activityId, loserIds));
    await tx
      .update(activityChecklistItems)
      .set({ activityId: survivor.id })
      .where(inArray(activityChecklistItems.activityId, loserIds));

    await tx
      .update(activities)
      .set({ deletedAt: now })
      .where(and(inArray(activities.id, loserIds), ne(activities.id, survivor.id)));

    await tx.insert(activityHistory).values({
      activityId: survivor.id,
      authorNameSnapshot: requester,
      eventDate: now.toISOString().slice(0, 10),
      comment: `Se fusionaron ${loserIds.length} tarea(s) duplicada(s) en esta (por ${requester}).`,
    });
  });

  for (const route of [
    "/actividades/presale",
    "/actividades/diseno",
    "/actividades/construccion",
  ]) {
    revalidatePath(route);
  }

  return {
    ok: true,
    survivor: `${survivor.description}${survivor.project ? ` — ${survivor.project}` : ""}`,
    merged: loserIds.length,
    repointedHistory,
  };
}

// ── Discard a project + its tasks (soft-delete) ────────────────────────────

export type DiscardProjectResult =
  | { ok: true; project: string; tasksDiscarded: number }
  | { ok: false; reason: "not_found" | "ambiguous"; candidates: string[] };

/**
 * Soft-delete a project and every non-deleted task attached to it (by
 * project_id, with a name-snapshot fallback). Nothing is hard-deleted — the
 * rows keep their history and can be restored by clearing `deleted_at`.
 * Requires `canDeleteProject` (Administrador / Dirección). Use for cleaning up
 * test / seeding projects.
 */
export async function discardProjectViaAssistantAction(input: {
  projectName: string;
}): Promise<DiscardProjectResult> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canDeleteProject) {
    throw new Error("FORBIDDEN: projects delete");
  }

  const name = input.projectName.trim();
  const matches = await db
    .select({ id: projects.id, legacyId: projects.legacyId, name: projects.name })
    .from(projects)
    .where(and(sql`lower(${projects.name}) = lower(${name})`, isNull(projects.deletedAt)));

  if (matches.length === 0) return { ok: false, reason: "not_found", candidates: [] };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: matches.map((m) => `${m.name} (#${m.legacyId ?? "?"})`),
    };
  }

  const project = matches[0];
  const now = new Date();
  const requester = user.member.name || user.email || "Asistente";

  let tasksDiscarded = 0;
  await db.transaction(async (tx) => {
    const affected = await tx
      .update(activities)
      .set({ deletedAt: now })
      .where(
        and(
          isNull(activities.deletedAt),
          or(
            eq(activities.projectId, project.id),
            sql`lower(${activities.projectNameSnapshot}) = lower(${project.name})`
          )
        )
      )
      .returning({ id: activities.id });
    tasksDiscarded = affected.length;

    if (affected.length > 0) {
      await tx.insert(activityHistory).values(
        affected.map((a) => ({
          activityId: a.id,
          authorNameSnapshot: requester,
          eventDate: now.toISOString().slice(0, 10),
          comment: `Tarea descartada junto con el proyecto ${project.name} (por ${requester}). Recuperable.`,
        }))
      );
    }

    await tx
      .update(projects)
      .set({ deletedAt: now })
      .where(eq(projects.id, project.id));
  });

  revalidatePath("/proyectos");
  revalidatePath("/directorio");
  for (const route of [
    "/actividades/presale",
    "/actividades/diseno",
    "/actividades/construccion",
  ]) {
    revalidatePath(route);
  }

  return { ok: true, project: project.name, tasksDiscarded };
}
