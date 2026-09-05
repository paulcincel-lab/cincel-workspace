"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, ilike, inArray, isNull, max, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  activities,
  activityHistory,
  clientContacts,
  clients,
  projects,
} from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
} from "@/lib/auth/permissions";
import type { ManualClient } from "@/lib/repositories/clients-repository";
import { diffChildRows } from "@/lib/actions/child-diff";
import { presaleTemplate } from "@/lib/templates/presale";
import { disenoTemplate } from "@/lib/templates/diseno";
import { operativasTemplate } from "@/lib/templates/operativas";

async function requireClientsCapabilities() {
  return resolveClientsCapabilities(await requireCapabilityUser());
}

function toManualClient(row: {
  legacyId: number | null;
  name: string;
  kind: string;
  phone: string | null;
  acquisitionChannel: string | null;
  totalSpentMxn: string;
  totalProjectsWorked: number;
  firstWorkDate: string | null;
  hasActiveProject: boolean;
  activeProjectName: string | null;
  activeProjectType: string | null;
  contacts: Array<{
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
  }>;
}): ManualClient {
  const contacts = row.contacts.map((c) => ({
    name: c.name,
    role: c.role ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
  }));
  return {
    id: row.legacyId ?? 0,
    name: row.name,
    emails: contacts.map((c) => c.email).filter(Boolean),
    phone: row.phone ?? "",
    kind: row.kind === "Empresa" ? "Empresa" : "Particular",
    contacts,
    completedProjects: [],
    acquisitionChannel: row.acquisitionChannel ?? "",
    totalSpent: Number(row.totalSpentMxn ?? 0),
    hasActiveProject: row.hasActiveProject,
    projectName: row.activeProjectName ?? "",
    projectType: row.activeProjectType ?? "",
    totalProjectsWorked: row.totalProjectsWorked,
    firstWorkDate: row.firstWorkDate ?? "",
  };
}

type ClientProjectStats = {
  totalProjectsWorked: number;
  hasActiveProject: boolean;
  firstWorkDate: string | null;
  activeProjectName: string | null;
  activeProjectType: string | null;
};

/**
 * Per-client rollups derived live from `projects` — replaces the drift-prone
 * denormalized columns on `clients` (issue #114). `total_spent_mxn` stays a
 * physical column: `projects` carries no cost, so it's genuinely manual data.
 */
async function fetchClientProjectStats(): Promise<Map<string, ClientProjectStats>> {
  const agg = await db
    .select({
      clientId: projects.clientId,
      count: sql<number>`count(*)::int`,
      hasActive: sql<boolean>`bool_or(${projects.active})`,
      firstStart: sql<string | null>`min(${projects.startDate})`,
    })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .groupBy(projects.clientId);

  const activeRows = await db
    .select({
      clientId: projects.clientId,
      name: projects.name,
      type: projects.projectType,
    })
    .from(projects)
    .where(and(isNull(projects.deletedAt), eq(projects.active, true)))
    .orderBy(desc(projects.startDate), desc(projects.createdAt));

  const active = new Map<string, { name: string; type: string | null }>();
  for (const r of activeRows) {
    if (r.clientId && !active.has(r.clientId)) {
      active.set(r.clientId, { name: r.name, type: r.type });
    }
  }

  const out = new Map<string, ClientProjectStats>();
  for (const r of agg) {
    if (!r.clientId) continue;
    const a = active.get(r.clientId);
    out.set(r.clientId, {
      totalProjectsWorked: Number(r.count ?? 0),
      hasActiveProject: Boolean(r.hasActive),
      firstWorkDate: r.firstStart,
      activeProjectName: a?.name ?? null,
      activeProjectType: a?.type ?? null,
    });
  }
  return out;
}

export async function fetchClientsAction(): Promise<ManualClient[]> {
  const caps = await requireClientsCapabilities();
  if (!caps.canViewClients) return [];

  const [rows, stats] = await Promise.all([
    db.query.clients.findMany({
      where: isNull(clients.deletedAt),
      orderBy: asc(clients.name),
      with: {
        contacts: {
          where: isNull(clientContacts.deletedAt),
          orderBy: asc(clientContacts.sortOrder),
        },
      },
    }),
    fetchClientProjectStats(),
  ]);

  return rows.map((r) => {
    const s = stats.get(r.id);
    return toManualClient({
      legacyId: r.legacyId,
      name: r.name,
      kind: r.kind,
      phone: r.phone,
      acquisitionChannel: r.acquisitionChannel,
      totalSpentMxn: r.totalSpentMxn,
      totalProjectsWorked: s?.totalProjectsWorked ?? 0,
      firstWorkDate: s?.firstWorkDate ?? null,
      hasActiveProject: s?.hasActiveProject ?? false,
      activeProjectName: s?.activeProjectName ?? null,
      activeProjectType: s?.activeProjectType ?? null,
      contacts: r.contacts,
    });
  });
}

export async function saveClientsAction(list: ManualClient[]): Promise<void> {
  const caps = await requireClientsCapabilities();
  if (!caps.canCreateClient && !caps.canEditClient) {
    throw new Error("FORBIDDEN: clients write");
  }

  for (const c of list) {
    const [row] = await db
      .insert(clients)
      .values({
        legacyId: c.id,
        name: c.name,
        kind: c.kind,
        phone: c.phone || null,
        acquisitionChannel: c.acquisitionChannel || null,
        totalSpentMxn: String(c.totalSpent ?? 0),
        totalProjectsWorked: c.totalProjectsWorked ?? 0,
        firstWorkDate: c.firstWorkDate || null,
        hasActiveProject: c.hasActiveProject ?? false,
        activeProjectName: c.projectName || null,
        activeProjectType: c.projectType || null,
      })
      .onConflictDoUpdate({
        target: clients.legacyId,
        set: {
          name: c.name,
          kind: c.kind,
          phone: c.phone || null,
          acquisitionChannel: c.acquisitionChannel || null,
          totalSpentMxn: String(c.totalSpent ?? 0),
          totalProjectsWorked: c.totalProjectsWorked ?? 0,
          firstWorkDate: c.firstWorkDate || null,
          hasActiveProject: c.hasActiveProject ?? false,
          activeProjectName: c.projectName || null,
          activeProjectType: c.projectType || null,
        },
      })
      .returning({ id: clients.id });

    // Diff contacts by their natural key (email, else name) so an unrelated
    // client edit doesn't churn every contact's created_at (issue #114).
    const persistedContacts = await db
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        email: clientContacts.email,
      })
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, row.id), isNull(clientContacts.deletedAt)));

    const incomingContacts = c.contacts
      .filter((ct) => ct.name || ct.email || ct.phone)
      .map((ct, i) => ({
        clientId: row.id,
        name: ct.name,
        role: ct.role || null,
        phone: ct.phone || null,
        email: ct.email || null,
        sortOrder: i,
      }));

    const contactKey = (ct: { email: string | null; name: string }) =>
      ct.email ? `e:${ct.email.trim().toLowerCase()}` : `n:${ct.name.trim().toLowerCase()}`;
    const { toInsert, toDeleteIds } = diffChildRows(
      persistedContacts,
      incomingContacts,
      contactKey,
      contactKey
    );
    if (toDeleteIds.length > 0) {
      await db.delete(clientContacts).where(inArray(clientContacts.id, toDeleteIds));
    }
    if (toInsert.length > 0) {
      await db.insert(clientContacts).values(toInsert);
    }
  }

  revalidatePath("/directorio");
  revalidatePath("/proyectos");
}

export async function deleteClientAction(
  clientLegacyId: number,
  linkedProjectLegacyIds: number[]
): Promise<void> {
  const caps = await requireClientsCapabilities();
  if (!caps.canDeleteClient) {
    throw new Error("FORBIDDEN: clients delete");
  }

  const now = new Date();

  const [clientRow] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.legacyId, clientLegacyId))
    .limit(1);

  if (clientRow) {
    await db
      .update(projects)
      .set({ deletedAt: now })
      .where(and(eq(projects.clientId, clientRow.id), isNull(projects.deletedAt)));
  }

  if (linkedProjectLegacyIds.length > 0) {
    await db
      .update(projects)
      .set({ deletedAt: now })
      .where(inArray(projects.legacyId, linkedProjectLegacyIds));
  }

  await db
    .update(clients)
    .set({ deletedAt: now })
    .where(eq(clients.legacyId, clientLegacyId));

  revalidatePath("/directorio");
  revalidatePath("/proyectos");
}

// ── Assistant-facing tool actions ──────────────────────────────────────────
// Mirror the capability gates the /directorio and /tareas UIs enforce; the AI
// assistant's tool set is built from the same capabilities, this is defense in
// depth. Every write logs an activity_history bitácora entry naming the
// requester — history is never overwritten.

type ClientKind = "Empresa" | "Particular";

type AssistantOnboardWorkflow = "Presale" | "Diseño" | "Construcción";

const WORKFLOW_TO_DB_ENUM = {
  Presale: "Presale",
  "Diseño": "Diseno",
  "Construcción": "Construccion",
} as const satisfies Record<
  AssistantOnboardWorkflow,
  "Presale" | "Diseno" | "Construccion"
>;

const TEMPLATE_BY_WORKFLOW: Record<
  AssistantOnboardWorkflow,
  ReadonlyArray<{ phase: string; description: string }>
> = {
  Presale: presaleTemplate,
  "Diseño": disenoTemplate,
  "Construcción": operativasTemplate,
};

async function nextClientLegacyId(): Promise<number> {
  const [row] = await db.select({ value: max(clients.legacyId) }).from(clients);
  return Math.max(1000, Number(row?.value ?? 0)) + 1;
}

async function nextProjectLegacyId(): Promise<number> {
  const [row] = await db.select({ value: max(projects.legacyId) }).from(projects);
  return Math.max(1000, Number(row?.value ?? 0)) + 1;
}

/**
 * Resolve-or-create the real `projects` row a project name refers to. Without
 * this, a project only "exists" as a string on `activities.project_name_snapshot`
 * — invisible to list_projects, the Proyectos page, and the risk rollups.
 */
async function resolveOrCreateProject(
  name: string,
  clientId: string,
  stage: "Presale" | "Diseño" | "Construcción"
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(ilike(projects.name, name), isNull(projects.deletedAt)))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const legacyId = await nextProjectLegacyId();
  const [row] = await db
    .insert(projects)
    .values({
      legacyId,
      name,
      clientId,
      stage,
      active: true,
      progress: 0,
    })
    .returning({ id: projects.id });
  return { id: row.id, created: true };
}

async function insertClient(input: {
  name: string;
  kind: ClientKind;
  phone?: string;
  acquisitionChannel?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}): Promise<{ id: string; legacyId: number; reused: boolean }> {
  const name = input.name.trim();

  // Idempotency: a retried tool call must not create a second client. Reuse an
  // existing non-deleted client with the same name (case-insensitive).
  const [existing] = await db
    .select({ id: clients.id, legacyId: clients.legacyId })
    .from(clients)
    .where(and(ilike(clients.name, name), isNull(clients.deletedAt)))
    .limit(1);
  if (existing) {
    return { id: existing.id, legacyId: existing.legacyId ?? 0, reused: true };
  }

  const legacyId = await nextClientLegacyId();
  let row: { id: string };
  try {
    [row] = await db
      .insert(clients)
      .values({
        legacyId,
        name,
        kind: input.kind,
        phone: input.phone?.trim() || null,
        acquisitionChannel: input.acquisitionChannel?.trim() || null,
      })
      .returning({ id: clients.id });
  } catch (error) {
    // Lost a race to the `clients_name_lower_uq` partial unique index — another
    // request created the same-named client between our pre-check and insert.
    if ((error as { code?: string }).code === "23505") {
      const [raced] = await db
        .select({ id: clients.id, legacyId: clients.legacyId })
        .from(clients)
        .where(and(ilike(clients.name, name), isNull(clients.deletedAt)))
        .limit(1);
      if (raced) {
        return { id: raced.id, legacyId: raced.legacyId ?? 0, reused: true };
      }
    }
    throw error;
  }

  if (input.contactName || input.contactEmail || input.contactPhone) {
    await db.insert(clientContacts).values({
      clientId: row.id,
      name: input.contactName?.trim() || name,
      phone: input.contactPhone?.trim() || null,
      email: input.contactEmail?.trim() || null,
      sortOrder: 0,
    });
  }

  return { id: row.id, legacyId, reused: false };
}

type AssistantCreateClientInput = {
  name: string;
  kind?: ClientKind;
  phone?: string;
  acquisitionChannel?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export async function createClientViaAssistantAction(
  input: AssistantCreateClientInput
): Promise<{ ok: true; name: string; kind: ClientKind; alreadyExisted: boolean }> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canCreateClient) {
    throw new Error("FORBIDDEN: clients create");
  }

  const kind = input.kind ?? "Particular";
  const { reused } = await insertClient({ ...input, kind });

  revalidatePath("/directorio");
  revalidatePath("/proyectos");
  return { ok: true, name: input.name.trim(), kind, alreadyExisted: reused };
}

type AssistantOnboardClientInput = {
  name: string;
  kind?: ClientKind;
  phone?: string;
  acquisitionChannel?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  projectName: string;
  workflow?: AssistantOnboardWorkflow;
  manager?: string;
  extraTasks?: string[];
};

/**
 * Create a client and, in the same step, seed the standard task checklist for
 * the chosen workflow (Presale by default) against a new project name.
 * Requires BOTH canCreateClient and canCreateActivity.
 */
export async function onboardClientViaAssistantAction(
  input: AssistantOnboardClientInput
): Promise<{
  ok: true;
  client: string;
  clientAlreadyExisted: boolean;
  project: string;
  projectAlreadyExisted: boolean;
  workflow: AssistantOnboardWorkflow;
  tasksCreated: number;
  tasksSkippedAsDuplicate: number;
}> {
  const user = await requireCapabilityUser();
  const clientsCaps = resolveClientsCapabilities(user);
  const activitiesCaps = resolveActivitiesCapabilities(user);
  if (!clientsCaps.canCreateClient) throw new Error("FORBIDDEN: clients create");
  if (!activitiesCaps.canCreateActivity) {
    throw new Error("FORBIDDEN: activities create");
  }

  const workflow = input.workflow ?? "Presale";
  const dbWorkflow = WORKFLOW_TO_DB_ENUM[workflow];
  const kind = input.kind ?? "Particular";
  const project = input.projectName.trim();
  const manager = input.manager?.trim() || null;
  const today = new Date().toISOString().slice(0, 10);
  const requester = user.member.name || user.email || "Asistente";

  const { id: clientId, reused } = await insertClient({ ...input, kind });
  const { id: projectId, created: projectCreated } = await resolveOrCreateProject(
    project,
    clientId,
    workflow
  );

  const items = [
    ...TEMPLATE_BY_WORKFLOW[workflow].map((t) => ({
      phase: t.phase,
      description: t.description,
    })),
    ...(input.extraTasks ?? [])
      .map((d) => d.trim())
      .filter(Boolean)
      .map((description) => ({ phase: null as string | null, description })),
  ];

  // Idempotency: skip any task this project already has for this workflow
  // (a retried tool call must not duplicate the checklist). Also backfill
  // project_id on any pre-existing task that predates resolveOrCreateProject
  // (e.g. a project created by an older assistant run before this fix).
  const existingTasks = await db
    .select({ description: activities.description })
    .from(activities)
    .where(
      and(
        eq(activities.workflow, dbWorkflow),
        ilike(activities.projectNameSnapshot, project),
        isNull(activities.deletedAt)
      )
    );
  await db
    .update(activities)
    .set({ projectId })
    .where(
      and(
        eq(activities.workflow, dbWorkflow),
        ilike(activities.projectNameSnapshot, project),
        isNull(activities.deletedAt),
        sql`${activities.projectId} is null`
      )
    );
  const existingDescriptions = new Set(
    existingTasks.map((t) => t.description.trim().toLowerCase())
  );

  let tasksCreated = 0;
  let tasksSkippedAsDuplicate = 0;
  for (const item of items) {
    if (existingDescriptions.has(item.description.trim().toLowerCase())) {
      tasksSkippedAsDuplicate += 1;
      continue;
    }
    existingDescriptions.add(item.description.trim().toLowerCase());
    const [row] = await db
      .insert(activities)
      .values({
        projectId,
        projectNameSnapshot: project,
        workflow: dbWorkflow,
        phase: item.phase,
        description: item.description,
        managerNameSnapshot: manager,
        status: "Pendiente",
        priority: "Media",
        createdOn: today,
        updatedOn: today,
      })
      .returning({ id: activities.id });

    await db.insert(activityHistory).values({
      activityId: row.id,
      authorNameSnapshot: requester,
      eventDate: today,
      comment: `Tarea creada por el asistente al dar de alta al cliente ${input.name.trim()} (solicitado por ${requester}).`,
    });
    tasksCreated += 1;
  }

  revalidatePath("/directorio");
  revalidatePath("/proyectos");
  revalidatePath("/tareas");
  revalidatePath("/tareas/presale");
  revalidatePath("/tareas/diseno");
  revalidatePath("/tareas/construccion");

  return {
    ok: true,
    client: input.name.trim(),
    clientAlreadyExisted: reused,
    project,
    projectAlreadyExisted: !projectCreated,
    workflow,
    tasksCreated,
    tasksSkippedAsDuplicate,
  };
}
