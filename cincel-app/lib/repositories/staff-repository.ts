import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  areaMembers,
  areaWorkflows,
  areas,
  authCredentials,
  staff,
  staffProfiles,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { recordChanges } from "@/lib/repositories/history-repository";
import type { Staff, StaffDetail, StaffInput, StaffProfile } from "@/lib/types/core";

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
    phone: row.phone,
    email: row.email,
    role: row.role,
    capacity: row.capacity,
    availability: row.availability,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const STAFF_TRACKED_FIELDS = [
  "kind",
  "name",
  "phone",
  "email",
  "role",
  "capacity",
  "availability",
  "active",
] as const;

export async function listStaff(options: { includeInactive?: boolean } = {}): Promise<Staff[]> {
  const rows = await db
    .select()
    .from(staff)
    .where(
      and(isNull(staff.deletedAt), options.includeInactive ? undefined : eq(staff.active, true))
    )
    .orderBy(asc(staff.name));
  return rows.map(toStaff);
}

/**
 * Staff who can be assigned to a task. When `workflowId` is given, staff in
 * the areas that own that workflow come first (`suggested = true`).
 */
export async function listAssignableStaff(
  options: { workflowId?: string | null } = {}
): Promise<Array<Staff & { suggested: boolean }>> {
  const all = await listStaff();
  if (!options.workflowId) return all.map((s) => ({ ...s, suggested: false }));

  const suggestedRows = await db
    .select({ staffId: areaMembers.staffId })
    .from(areaWorkflows)
    .innerJoin(areaMembers, eq(areaMembers.areaId, areaWorkflows.areaId))
    .where(eq(areaWorkflows.workflowId, options.workflowId));
  const suggested = new Set(suggestedRows.map((r) => r.staffId));

  return all
    .map((s) => ({ ...s, suggested: suggested.has(s.id) }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name));
}

export async function getStaff(id: string): Promise<StaffDetail | null> {
  const row = await db.query.staff.findFirst({
    where: and(eq(staff.id, id), isNull(staff.deletedAt)),
    with: {
      profile: true,
      areaMemberships: { with: { area: true } },
    },
  });
  if (!row) return null;

  const [cred] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.staffId, id))
    .limit(1);

  return {
    ...toStaff(row),
    profile: row.profile ? toProfile(row.profile) : null,
    areas: row.areaMemberships
      .filter((m) => m.area.deletedAt === null)
      .map((m) => ({ id: m.area.id, name: m.area.name, role: m.role })),
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
  };
}

function toStaffValues(input: StaffInput) {
  return {
    kind: input.kind ?? "empleado",
    name: input.name.trim(),
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() ?? null,
    role: clean(input.role),
    capacity: input.capacity ?? 0,
    availability: clean(input.availability),
    active: input.active ?? true,
  };
}

export async function createStaff(input: StaffInput, actorId: string): Promise<Staff> {
  const [row] = await db.insert(staff).values(toStaffValues(input)).returning();
  await recordChanges({
    entity: "staff",
    entityId: row.id,
    actorId,
    before: { name: null },
    after: { name: row.name },
    fields: ["name"],
  });
  return toStaff(row);
}

export async function updateStaff(
  id: string,
  patch: Partial<StaffInput>,
  actorId: string
): Promise<Staff> {
  const [before] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);
  if (!before) throw new Error("STAFF_NOT_FOUND");

  const merged = toStaffValues({
    kind: patch.kind ?? before.kind,
    name: patch.name ?? before.name,
    phone: patch.phone === undefined ? before.phone : patch.phone,
    email: patch.email === undefined ? before.email : patch.email,
    role: patch.role === undefined ? before.role : patch.role,
    capacity: patch.capacity ?? before.capacity,
    availability: patch.availability === undefined ? before.availability : patch.availability,
    active: patch.active ?? before.active,
  });

  const [after] = await db.update(staff).set(merged).where(eq(staff.id, id)).returning();
  await recordChanges({
    entity: "staff",
    entityId: id,
    actorId,
    before,
    after,
    fields: STAFF_TRACKED_FIELDS,
  });
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
  profile: Partial<StaffProfile>
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
  };
  const [row] = await db
    .insert(staffProfiles)
    .values(values)
    .onConflictDoUpdate({ target: staffProfiles.staffId, set: values })
    .returning();
  return toProfile(row);
}

/** Replace a staff member's area memberships. */
export async function setStaffAreas(staffId: string, areaIds: string[]): Promise<void> {
  const wanted = new Set(areaIds);
  const current = await db
    .select({ areaId: areaMembers.areaId })
    .from(areaMembers)
    .where(eq(areaMembers.staffId, staffId));
  const currentIds = new Set(current.map((c) => c.areaId));

  const toRemove = [...currentIds].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    await db
      .delete(areaMembers)
      .where(and(eq(areaMembers.staffId, staffId), inArray(areaMembers.areaId, toRemove)));
  }
  if (toAdd.length > 0) {
    await db.insert(areaMembers).values(toAdd.map((areaId) => ({ areaId, staffId })));
  }
}

/**
 * Manage login for a staff member. With a temporary password the credential
 * is created or reset and the member must change it on first access; without
 * one only the enabled flag changes.
 */
export async function setStaffCredential(
  staffId: string,
  options: { enableAccess: boolean; temporaryPassword?: string }
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
    await db
      .insert(authCredentials)
      .values({ staffId, ...values })
      .onConflictDoUpdate({ target: authCredentials.staffId, set: values });
    return;
  }
  await db
    .update(authCredentials)
    .set({ enabled: options.enableAccess })
    .where(eq(authCredentials.staffId, staffId));
}

/** Name of the first area a staff member belongs to, for legacy role checks. */
export async function primaryAreaName(staffId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: areas.name })
    .from(areaMembers)
    .innerJoin(areas, eq(areas.id, areaMembers.areaId))
    .where(and(eq(areaMembers.staffId, staffId), isNull(areas.deletedAt)))
    .orderBy(asc(areas.sortOrder), asc(areas.name))
    .limit(1);
  return row?.name ?? null;
}

export const staffSearchCondition = (term: string) =>
  sql`${staff.name} ilike ${"%" + term.trim() + "%"}`;
