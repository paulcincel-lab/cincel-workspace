import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  authCredentials,
  positionPhases,
  positions,
  projects,
  staff,
  staffPositions,
  staffProfiles,
  taskStatuses,
  tasks,
  workflowPhases,
  workflows,
  workspaceGroupMappings,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { recordChanges } from "@/lib/repositories/history-repository";
import type {
  EmergencyContact,
  PositionRef,
  Staff,
  StaffDetail,
  StaffInput,
  StaffProfile,
  WorkflowPhaseRef,
} from "@/lib/types/core";

type StaffRow = typeof staff.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function toStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    role: row.role,
    capacity: row.capacity,
    availability: row.availability,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    googleManaged: row.googleSub !== null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    accessRevokedAt: row.accessRevokedAt?.toISOString() ?? null,
    accessRevokedReason: row.accessRevokedReason,
    positions: [],
    candidatePhases: [],
  };
}

/** Which of `ids` are Google-managed (`google_sub` set, not deleted). */
export async function googleManagedStaffIds(ids: string[], executor: FlowExecutor = db): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await executor
    .select({ id: staff.id })
    .from(staff)
    .where(and(inArray(staff.id, ids), isNotNull(staff.googleSub), isNull(staff.deletedAt)));
  return new Set(rows.map((row) => row.id));
}

/** Current role and Google lock of one staff member, or null when not found. */
export async function getStaffRoleLock(
  id: string,
  executor: FlowExecutor = db
): Promise<{ role: string | null; googleManaged: boolean } | null> {
  const [row] = await executor
    .select({ role: staff.role, googleSub: staff.googleSub })
    .from(staff)
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);
  return row ? { role: row.role, googleManaged: row.googleSub !== null } : null;
}

type StaffPositionsDto = Required<Pick<Staff, "positions" | "candidatePhases">>;

/**
 * Puestos and candidate fases per staff id (BE §7.2): `positions` are the
 * person's live puestos in catalog order; `candidatePhases` the distinct
 * active fases of their live, active puestos, in etapa then catalog order.
 */
export async function loadStaffPositions(staffIds: string[]): Promise<Map<string, StaffPositionsDto>> {
  const out = new Map<string, StaffPositionsDto>(staffIds.map((id) => [id, { positions: [], candidatePhases: [] }]));
  if (staffIds.length === 0) return out;

  const [positionRows, phaseRows] = await Promise.all([
    db
      .select({ staffId: staffPositions.staffId, id: positions.id, name: positions.name })
      .from(staffPositions)
      .innerJoin(positions, eq(positions.id, staffPositions.positionId))
      .where(and(inArray(staffPositions.staffId, staffIds), isNull(positions.deletedAt)))
      .orderBy(asc(positions.sortOrder), asc(positions.name)),
    db
      .select({
        staffId: staffPositions.staffId,
        id: workflowPhases.id,
        name: workflowPhases.name,
        sortOrder: workflowPhases.sortOrder,
        workflowName: workflows.name,
      })
      .from(staffPositions)
      .innerJoin(positions, eq(positions.id, staffPositions.positionId))
      .innerJoin(positionPhases, eq(positionPhases.positionId, positions.id))
      .innerJoin(workflowPhases, eq(workflowPhases.id, positionPhases.phaseId))
      .innerJoin(workflows, eq(workflows.id, workflowPhases.workflowId))
      .where(
        and(
          inArray(staffPositions.staffId, staffIds),
          isNull(positions.deletedAt),
          eq(positions.active, true),
          eq(workflowPhases.active, true),
          isNull(workflows.deletedAt)
        )
      )
      .orderBy(asc(workflows.sortOrder), asc(workflowPhases.sortOrder), asc(workflowPhases.name)),
  ]);

  for (const { staffId, ...position } of positionRows) {
    const list: PositionRef[] | undefined = out.get(staffId)?.positions;
    if (list && !list.some((p) => p.id === position.id)) list.push(position);
  }
  for (const { staffId, ...phase } of phaseRows) {
    const list: Array<WorkflowPhaseRef & { workflowName: string }> | undefined = out.get(staffId)?.candidatePhases;
    if (list && !list.some((p) => p.id === phase.id)) list.push(phase);
  }
  return out;
}

async function withPositions<T extends Staff>(rows: T[]): Promise<T[]> {
  const byStaff = await loadStaffPositions(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, ...(byStaff.get(row.id) ?? { positions: [], candidatePhases: [] }) }));
}

const STAFF_TRACKED_FIELDS = [
  "kind",
  "name",
  "lastName",
  "phone",
  "email",
  "role",
  "capacity",
  "availability",
  "active",
] as const;

/** Manual order first (#452); members never placed go last, alphabetically. */
export const STAFF_ORDER = [sql`${staff.sortOrder} is null`, asc(staff.sortOrder), asc(staff.name)];

export async function listStaff(options: { includeInactive?: boolean } = {}): Promise<Staff[]> {
  const rows = await db
    .select()
    .from(staff)
    .where(
      and(isNull(staff.deletedAt), options.includeInactive ? undefined : eq(staff.active, true))
    )
    .orderBy(...STAFF_ORDER);
  return withPositions(rows.map(toStaff));
}

/** Emergency contact per staff id; only members who have one registered. */
export async function listEmergencyContacts(): Promise<Record<string, EmergencyContact>> {
  const rows = await db
    .select({
      staffId: staffProfiles.staffId,
      name: staffProfiles.emergencyContactName,
      relation: staffProfiles.emergencyContactRelation,
      phone: staffProfiles.emergencyContactPhone,
      address: staffProfiles.emergencyContactAddress,
    })
    .from(staffProfiles);
  const contacts: Record<string, EmergencyContact> = {};
  for (const { staffId, ...contact } of rows) {
    if (contact.name || contact.phone) contacts[staffId] = contact;
  }
  return contacts;
}

/** Save the manual order of the team: `orderedIds[i]` gets position i. */
export async function reorderStaff(orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(staff).set({ sortOrder: i }).where(and(eq(staff.id, id), isNull(staff.deletedAt)));
    }
  });
}

/**
 * Staff who can be assigned to a task. When `workflowId` is given, staff
 * holding a live, active puesto that lists an active fase of that etapa come
 * first (`suggested = true`), then everyone by name.
 */
export async function listAssignableStaff(
  options: { workflowId?: string | null } = {}
): Promise<Array<Staff & { suggested: boolean }>> {
  const all = await listStaff();
  if (!options.workflowId) return all.map((s) => ({ ...s, suggested: false }));

  const suggestedRows = await db
    .selectDistinct({ staffId: staffPositions.staffId })
    .from(staffPositions)
    .innerJoin(positions, eq(positions.id, staffPositions.positionId))
    .innerJoin(positionPhases, eq(positionPhases.positionId, positions.id))
    .innerJoin(workflowPhases, eq(workflowPhases.id, positionPhases.phaseId))
    .where(
      and(
        eq(workflowPhases.workflowId, options.workflowId),
        eq(workflowPhases.active, true),
        isNull(positions.deletedAt),
        eq(positions.active, true)
      )
    );
  const suggested = new Set(suggestedRows.map((r) => r.staffId));

  return all
    .map((s) => ({ ...s, suggested: suggested.has(s.id) }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name));
}

/**
 * Open tasks per responsable in one etapa, and how many of them are overdue
 * (commitment date, else delivery date, before `todayIso`). Open = live,
 * unarchived, not completado and no closing custom status, on a live
 * project. One grouped count; people without open tasks are absent.
 */
export async function countOpenTasksInEtapa(
  workflowId: string,
  todayIso: string
): Promise<Map<string, { open: number; overdue: number }>> {
  const rows = await db
    .select({
      staffId: tasks.managerId,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate}) < ${todayIso}::date)::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(
      and(
        eq(tasks.workflowId, workflowId),
        isNotNull(tasks.managerId),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado"),
        or(isNull(tasks.customStatusId), eq(taskStatuses.closes, false)),
        isNull(projects.deletedAt)
      )
    )
    .groupBy(tasks.managerId);
  const out = new Map<string, { open: number; overdue: number }>();
  for (const r of rows) {
    if (r.staffId) out.set(r.staffId, { open: Number(r.open), overdue: Number(r.overdue) });
  }
  return out;
}

/** The subset of `ids` that are live, active staff (start-etapa manager check). */
export async function liveActiveStaffIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(inArray(staff.id, ids), eq(staff.active, true), isNull(staff.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/** True when the staff member exists and isn't deleted. */
export async function staffExists(id: string, executor: FlowExecutor = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/** Ids of the person's live puestos, optionally only one source ('manual' | 'workspace'). */
export async function listStaffPositionIds(
  staffId: string,
  source?: "manual" | "workspace",
  executor: FlowExecutor = db
): Promise<string[]> {
  const rows = await executor
    .select({ positionId: staffPositions.positionId })
    .from(staffPositions)
    .innerJoin(positions, eq(positions.id, staffPositions.positionId))
    .where(
      and(
        eq(staffPositions.staffId, staffId),
        isNull(positions.deletedAt),
        source ? eq(staffPositions.source, source) : undefined
      )
    );
  return rows.map((r) => r.positionId);
}

/** True when some Google group maps to a live puesto (Workspace then manages puestos). */
export async function hasPositionGroupMappings(executor: FlowExecutor = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: workspaceGroupMappings.id })
    .from(workspaceGroupMappings)
    .innerJoin(positions, eq(positions.id, workspaceGroupMappings.positionId))
    .where(and(eq(workspaceGroupMappings.kind, "position"), isNull(positions.deletedAt)))
    .limit(1);
  return Boolean(row);
}

export async function getStaff(id: string): Promise<StaffDetail | null> {
  const row = await db.query.staff.findFirst({
    where: and(eq(staff.id, id), isNull(staff.deletedAt)),
    with: {
      profile: true,
    },
  });
  if (!row) return null;

  const [cred] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.staffId, id))
    .limit(1);

  const [withPositionsRow] = await withPositions([toStaff(row)]);
  return {
    ...withPositionsRow,
    profile: row.profile ? toProfile(row.profile) : null,
    access: cred
      ? {
          hasPassword: Boolean(cred.passwordHash),
          enabled: cred.enabled,
          mustChangePassword: cred.mustChangePassword,
          passwordUpdatedAt: cred.passwordUpdatedAt?.toISOString() ?? null,
          lastLoginAt: cred.lastLoginAt?.toISOString() ?? null,
        }
      : null,
  };
}

function toProfile(row: typeof staffProfiles.$inferSelect): StaffProfile {
  return {
    personalEmail: row.personalEmail,
    homePhone: row.homePhone,
    nationality: row.nationality,
    address: row.address,
    maritalStatus: row.maritalStatus,
    birthDate: row.birthDate,
    curp: row.curp,
    rfc: row.rfc,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelation: row.emergencyContactRelation,
    emergencyContactPhone: row.emergencyContactPhone,
    emergencyContactAddress: row.emergencyContactAddress,
    emailSignature: row.emailSignature,
  };
}

function toStaffValues(input: StaffInput) {
  return {
    kind: input.kind ?? "empleado",
    name: input.name.trim(),
    lastName: clean(input.lastName),
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() ?? null,
    role: clean(input.role),
    capacity: input.capacity ?? 0,
    availability: clean(input.availability),
    active: input.active ?? true,
  };
}

export async function createStaff(input: StaffInput, actorId: string, executor: FlowExecutor = db): Promise<Staff> {
  const [row] = await executor.insert(staff).values(toStaffValues(input)).returning();
  await recordChanges(
    {
      entity: "staff",
      entityId: row.id,
      actorId,
      before: { name: null },
      after: { name: row.name },
      fields: ["name"],
    },
    executor
  );
  return toStaff(row);
}

export async function updateStaff(
  id: string,
  patch: Partial<StaffInput>,
  actorId: string,
  executor: FlowExecutor = db
): Promise<Staff> {
  const [before] = await executor
    .select()
    .from(staff)
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);
  if (!before) throw new Error("STAFF_NOT_FOUND");

  const merged = toStaffValues({
    kind: patch.kind ?? before.kind,
    name: patch.name ?? before.name,
    lastName: patch.lastName === undefined ? before.lastName : patch.lastName,
    phone: patch.phone === undefined ? before.phone : patch.phone,
    email: patch.email === undefined ? before.email : patch.email,
    role: patch.role === undefined ? before.role : patch.role,
    capacity: patch.capacity ?? before.capacity,
    availability: patch.availability === undefined ? before.availability : patch.availability,
    active: patch.active ?? before.active,
  });

  const [after] = await executor.update(staff).set(merged).where(eq(staff.id, id)).returning();
  await recordChanges(
    {
      entity: "staff",
      entityId: id,
      actorId,
      before,
      after,
      fields: STAFF_TRACKED_FIELDS,
    },
    executor
  );
  return toStaff(after);
}

export async function setStaffActive(id: string, active: boolean, actorId: string): Promise<Staff> {
  return updateStaff(id, { active }, actorId);
}

/** Soft delete. Assignments and history are kept. */
export async function softDeleteStaff(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(staff)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .returning();
  if (!row) throw new Error("STAFF_NOT_FOUND");
  await recordChanges({
    entity: "staff",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
  });
}

export async function upsertStaffProfile(
  staffId: string,
  profile: Partial<StaffProfile>,
  executor: FlowExecutor = db
): Promise<StaffProfile> {
  const values = {
    staffId,
    personalEmail: clean(profile.personalEmail),
    homePhone: clean(profile.homePhone),
    nationality: clean(profile.nationality),
    address: clean(profile.address),
    maritalStatus: clean(profile.maritalStatus),
    birthDate: clean(profile.birthDate),
    curp: clean(profile.curp)?.toUpperCase() ?? null,
    rfc: clean(profile.rfc)?.toUpperCase() ?? null,
    emergencyContactName: clean(profile.emergencyContactName),
    emergencyContactRelation: clean(profile.emergencyContactRelation),
    emergencyContactPhone: clean(profile.emergencyContactPhone),
    emergencyContactAddress: clean(profile.emergencyContactAddress),
    // Only written when sent, so an Equipo save never clears the person's own signature.
    ...(profile.emailSignature !== undefined ? { emailSignature: clean(profile.emailSignature) } : {}),
  };
  const [row] = await executor
    .insert(staffProfiles)
    .values(values)
    .onConflictDoUpdate({ target: staffProfiles.staffId, set: values })
    .returning();
  return toProfile(row);
}

/**
 * Set only the email signature of a staff member (Ajustes › Perfil, redesign
 * FE §3.8); the rest of the profile row is left as it is.
 */
export async function setStaffEmailSignature(staffId: string, signature: string | null): Promise<StaffProfile> {
  const emailSignature = clean(signature);
  const [row] = await db
    .insert(staffProfiles)
    .values({ staffId, emailSignature })
    .onConflictDoUpdate({ target: staffProfiles.staffId, set: { emailSignature } })
    .returning();
  return toProfile(row);
}

/**
 * Manage login for a staff member. With a temporary password the credential
 * is created or reset and the member must change it on first access; without
 * one only the enabled flag changes.
 */
export async function setStaffCredential(
  staffId: string,
  options: { enableAccess: boolean; temporaryPassword?: string },
  executor: FlowExecutor = db
): Promise<void> {
  if (options.temporaryPassword) {
    const { hash, salt } = await hashPassword(options.temporaryPassword);
    const values = {
      passwordHash: hash,
      salt,
      enabled: options.enableAccess,
      mustChangePassword: true,
      passwordUpdatedAt: new Date(),
    };
    await executor
      .insert(authCredentials)
      .values({ staffId, ...values })
      .onConflictDoUpdate({ target: authCredentials.staffId, set: values });
    return;
  }
  await executor
    .update(authCredentials)
    .set({ enabled: options.enableAccess })
    .where(eq(authCredentials.staffId, staffId));
}

/** Name of the first live, active puesto a staff member holds (catalog order), for the session's `area` label. */
export async function primaryPositionName(staffId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: positions.name })
    .from(staffPositions)
    .innerJoin(positions, eq(positions.id, staffPositions.positionId))
    .where(and(eq(staffPositions.staffId, staffId), isNull(positions.deletedAt), eq(positions.active, true)))
    .orderBy(asc(positions.sortOrder), asc(positions.name))
    .limit(1);
  return row?.name ?? null;
}

export const staffSearchCondition = (term: string) =>
  sql`${staff.name} ilike ${"%" + term.trim() + "%"}`;
