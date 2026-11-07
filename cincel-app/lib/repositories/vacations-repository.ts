/** Vacation requests (redesign BE §3.9, §7.8, §8.8). */
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { staffAccessRole } from "@/lib/auth/access-role";
import { canDecideVacations } from "@/lib/auth/permissions";
import { appSettings, staff, staffProfiles, vacationRequests } from "@/lib/db/schema";
import type { FlowTx } from "@/lib/project-flow/db";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { VacationStatus } from "@/lib/types/redesign";
import { DEFAULT_VACATION_DAYS_PER_YEAR, VACATIONS_SETTING_KEY } from "@/lib/vacations/balance";
import { VacationSettingsSchema, versionedSetting } from "@/lib/validation/redesign";

export type VacationRequestRow = typeof vacationRequests.$inferSelect;

const StoredVacationSettingsSchema = versionedSetting(VacationSettingsSchema);

/** "Nombre Apellido" of a staff row. */
export function staffFullName(row: { name: string; lastName: string | null }): string {
  return [row.name, row.lastName].filter((part) => part && part.trim()).join(" ");
}

/** Requests overlapping `[from, to]`, optionally for some staff and statuses; oldest `from` first. */
export async function listVacationRequests(
  db: OwnerDb,
  filter: { from?: string; to?: string; staffIds?: string[]; statuses?: VacationStatus[] },
): Promise<VacationRequestRow[]> {
  if (filter.staffIds && filter.staffIds.length === 0) return [];
  if (filter.statuses && filter.statuses.length === 0) return [];
  const where: SQL[] = [];
  if (filter.to) where.push(lte(vacationRequests.fromDate, filter.to));
  if (filter.from) where.push(gte(vacationRequests.toDate, filter.from));
  if (filter.staffIds) where.push(inArray(vacationRequests.staffId, filter.staffIds));
  if (filter.statuses) where.push(inArray(vacationRequests.status, filter.statuses));
  return db
    .select()
    .from(vacationRequests)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(vacationRequests.fromDate), asc(vacationRequests.createdAt));
}

/** One request, or null. */
export async function getVacationRequest(db: OwnerDb, id: string): Promise<VacationRequestRow | null> {
  const [row] = await db.select().from(vacationRequests).where(eq(vacationRequests.id, id));
  return row ?? null;
}

/** `select … for update` of one request inside a transaction, or null. */
export async function lockVacationRequest(tx: FlowTx, id: string): Promise<VacationRequestRow | null> {
  const [row] = await tx.select().from(vacationRequests).where(eq(vacationRequests.id, id)).for("update");
  return row ?? null;
}

/** Serializes the writes of one person's requests (overlap check + insert) for the rest of `tx`. */
export async function lockStaffVacations(tx: FlowTx, staffId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vacations:${staffId}`}))`);
}

/** The person's `pendiente` / `aprobada` requests overlapping `[from, to]` (BE §9.6). */
export async function findOwnOverlaps(
  db: OwnerDb,
  staffId: string,
  range: { from: string; to: string },
): Promise<VacationRequestRow[]> {
  return listVacationRequests(db, { ...range, staffIds: [staffId], statuses: ["pendiente", "aprobada"] });
}

export async function insertVacationRequest(
  db: OwnerDb,
  values: Pick<typeof vacationRequests.$inferInsert, "staffId" | "fromDate" | "toDate" | "kind" | "comment" | "days">,
): Promise<VacationRequestRow> {
  const [row] = await db.insert(vacationRequests).values(values).returning();
  return row!;
}

export async function updateVacationRequest(
  db: OwnerDb,
  id: string,
  patch: Partial<Pick<VacationRequestRow, "status" | "decidedBy" | "decidedAt" | "decisionNote">>,
): Promise<VacationRequestRow> {
  const [row] = await db
    .update(vacationRequests)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(vacationRequests.id, id))
    .returning();
  return row!;
}

/** Pending requests oldest first, with the requester's name ("Solicitudes del equipo"). */
export async function listPendingRequests(
  db: OwnerDb,
  opts: { excludeStaffId?: string } = {},
): Promise<(VacationRequestRow & { name: string })[]> {
  const where: SQL[] = [eq(vacationRequests.status, "pendiente")];
  if (opts.excludeStaffId) where.push(ne(vacationRequests.staffId, opts.excludeStaffId));
  const rows = await db
    .select({ request: vacationRequests, name: staff.name, lastName: staff.lastName })
    .from(vacationRequests)
    .innerJoin(staff, eq(staff.id, vacationRequests.staffId))
    .where(and(...where))
    .orderBy(asc(vacationRequests.createdAt), asc(vacationRequests.fromDate));
  return rows.map((r) => ({ ...r.request, name: staffFullName(r) }));
}

/** Requests overlapping `[from, to]` with the given statuses, with the requester's name (team strip). */
export async function listTeamRequests(
  db: OwnerDb,
  range: { from: string; to: string },
  statuses: VacationStatus[],
): Promise<(VacationRequestRow & { name: string })[]> {
  if (statuses.length === 0) return [];
  const rows = await db
    .select({ request: vacationRequests, name: staff.name, lastName: staff.lastName })
    .from(vacationRequests)
    .innerJoin(staff, eq(staff.id, vacationRequests.staffId))
    .where(
      and(
        lte(vacationRequests.fromDate, range.to),
        gte(vacationRequests.toDate, range.from),
        inArray(vacationRequests.status, statuses),
        isNull(staff.deletedAt),
      ),
    )
    .orderBy(asc(vacationRequests.fromDate), asc(staff.name));
  return rows.map((r) => ({ ...r.request, name: staffFullName(r) }));
}

/** A staff member's name, email and vacation override, or null. */
export async function getStaffForVacations(
  db: OwnerDb,
  staffId: string,
): Promise<{ id: string; name: string; email: string | null; vacationDays: number | null } | null> {
  const [row] = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      email: staff.email,
      vacationDays: staffProfiles.vacationDays,
    })
    .from(staff)
    .leftJoin(staffProfiles, eq(staffProfiles.staffId, staff.id))
    .where(eq(staff.id, staffId));
  if (!row) return null;
  return { id: row.id, name: staffFullName(row), email: row.email, vacationDays: row.vacationDays ?? null };
}

/** Active staff whose access role passes `canDecideVacations` (Administrador, Dirección). */
export async function listDeciders(db: OwnerDb): Promise<{ id: string; name: string; email: string | null }[]> {
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName, email: staff.email, role: staff.role })
    .from(staff)
    .where(and(eq(staff.active, true), isNull(staff.deletedAt), isNull(staff.accessRevokedAt)));
  return rows
    .filter((row) => {
      const access = staffAccessRole(row.role, row.email);
      if (!access) return false;
      const user: AuthenticatedUser = {
        member: {
          id: row.id,
          name: row.name,
          role: row.role ?? "",
          area: "",
          capacity: 0,
          availability: "",
          active: true,
          institutionalEmail: row.email ?? "",
          phone: "",
        },
        email: row.email ?? "",
        access,
      };
      return canDecideVacations(user);
    })
    .map((row) => ({ id: row.id, name: staffFullName(row), email: row.email }));
}

/** The org `daysPerYear` (`app_settings('vacations')`), or the default when missing or unreadable. */
export async function getOrgDaysPerYear(db: OwnerDb): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, VACATIONS_SETTING_KEY));
  if (!row) return DEFAULT_VACATION_DAYS_PER_YEAR;
  try {
    const parsed = StoredVacationSettingsSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data.data.daysPerYear : DEFAULT_VACATION_DAYS_PER_YEAR;
  } catch {
    return DEFAULT_VACATION_DAYS_PER_YEAR;
  }
}

/** Active staff with their override (`staff_profiles.vacation_days`), by name. */
export async function listVacationOverrides(
  db: OwnerDb,
): Promise<{ staffId: string; name: string; days: number | null }[]> {
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName, days: staffProfiles.vacationDays })
    .from(staff)
    .leftJoin(staffProfiles, eq(staffProfiles.staffId, staff.id))
    .where(and(eq(staff.active, true), isNull(staff.deletedAt)))
    .orderBy(asc(staff.name), asc(staff.lastName));
  return rows.map((r) => ({ staffId: r.id, name: staffFullName(r), days: r.days ?? null }));
}

/** Ids of the given staff that exist (not deleted). */
export async function existingStaffIds(db: OwnerDb, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(inArray(staff.id, ids), isNull(staff.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Stores the org default and the per-person overrides (null clears an override). */
export async function saveVacationSettings(
  tx: FlowTx,
  input: { daysPerYear: number; overrides: { staffId: string; days: number | null }[] },
): Promise<void> {
  const value = JSON.stringify({ version: 1, data: { daysPerYear: input.daysPerYear } });
  await tx
    .insert(appSettings)
    .values({ key: VACATIONS_SETTING_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });

  for (const { staffId, days } of input.overrides) {
    if (days === null) {
      await tx
        .update(staffProfiles)
        .set({ vacationDays: null, updatedAt: new Date() })
        .where(eq(staffProfiles.staffId, staffId));
    } else {
      await tx
        .insert(staffProfiles)
        .values({ staffId, vacationDays: days })
        .onConflictDoUpdate({ target: staffProfiles.staffId, set: { vacationDays: days, updatedAt: new Date() } });
    }
  }
}
