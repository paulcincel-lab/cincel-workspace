import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { EquipoViewProps } from "@/components/personas/EquipoView";
import type { PersonasContactsProps } from "@/components/personas/PersonasContacts";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canViewTeamHours, resolveClientsCapabilities, resolveTeamCapabilities } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { staff as staffTable } from "@/lib/db/schema";
import { toRecentActivity } from "@/lib/people/activity";
import {
  displayName,
  dominantTramo,
  initialsOf,
  localIsoDate,
  occupancyPct,
  openCounts,
  toAttentionItems,
  weekAvailability,
  workWeek,
} from "@/lib/people/aggregates";
import {
  parseProveedoresSubfilter,
  toPersonasContact,
  type PersonasContactsTab,
  type ProveedoresSubfilter,
} from "@/lib/personas/contacts";
import { buildTeamPeople, type PersonasTab } from "@/lib/personas/team";
import * as contactsRepository from "@/lib/repositories/contacts-repository";
import * as peopleRepository from "@/lib/repositories/people-repository";
import { listStaff, loadStaffPositions, toStaff } from "@/lib/repositories/staff-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import { weekHours } from "@/lib/time-tracking/week-hours";
import { canSeeAdminData } from "@/lib/tramos/compat";
import type { ContactType, ProviderSubtype, Staff, WorkflowRef } from "@/lib/types/core";
import type { DayHours, PeopleOverviewRow, PersonaDetail } from "@/lib/types/redesign";
import type { KpiDatum, ProgressItem } from "@/lib/types/widgets";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

/**
 * Personas loaders (Query Migration 6, #940): `(user, input) => data`. The
 * page-data actions in `lib/actions/page-data/personas-actions.ts` call them
 * after the session check, and the `/personas/*` pages prefetch with them
 * directly, so each loader applies the capability itself.
 *
 * Security (plan §4.8 rule 2): what these return is dehydrated into public
 * page HTML. They strip what the viewer may not see here, never in a
 * component: week hours only for `canViewTeamHours` or the viewer's own row,
 * admin tasks and admin activity only with `canSeeAdminData`, contact origin
 * only with `canSeeAdminData`, and emails only of the active team members the
 * list shows.
 */

/** Equipo page data: everything the view needs except the shared tab counts. */
export type PersonasEquipoData = Omit<EquipoViewProps, "counts">;

/** One contacts tab's page data, without the shared tab counts. */
export type PersonasContactsData = Omit<PersonasContactsProps, "counts">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireTeamViewer(user: AuthenticatedUser): void {
  if (!resolveTeamCapabilities(user).canViewTeam) throw new Error("FORBIDDEN");
}

/** The ids whose hours this viewer may see: everyone with `canViewTeamHours`, else only themself. */
function hoursVisibleIds(user: AuthenticatedUser, staffIds: string[]): string[] {
  if (canViewTeamHours(user)) return staffIds;
  return staffIds.filter((id) => id === user.member.id);
}

/** Today and the Mon–Fri of this week in the org time zone (BE §8.7). */
function currentWeek(): { today: string; days: string[] } {
  const today = localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  return { today, days: workWeek(today) };
}

async function absencesByStaff(
  staffIds: string[],
  days: string[],
): Promise<Map<string, { from: string; to: string }[]>> {
  const out = new Map<string, { from: string; to: string }[]>();
  if (staffIds.length === 0) return out;
  const rows = await approvedAbsences(db, { from: days[0]!, to: days[days.length - 1]!, staffIds });
  for (const row of rows) {
    const list = out.get(row.staffId) ?? [];
    list.push({ from: row.from, to: row.to });
    out.set(row.staffId, list);
  }
  return out;
}

/** Week hours (BE §8.12 helper) for the given ids only; zeros until entries exist. */
async function hoursByStaff(
  staffIds: string[],
  weekStart: string,
): Promise<Map<string, { days: DayHours[]; total: number }>> {
  if (staffIds.length === 0) return new Map();
  const settings = await getTimeTrackingSettings();
  return weekHours(db, staffIds, weekStart, settings);
}

/** Active tramos in order, the way `listTramos` (`lib/tramos/compat.ts`) shapes them. */
async function activeTramos(): Promise<WorkflowRef[]> {
  const rows = await workflowsRepository.listTramosNav();
  return rows
    .filter((row) => row.key.trim() !== "")
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

/**
 * One overview row per **active** member of `staff` (the caller's single
 * `listStaff` read): open / overdue tasks, active projects, occupancy, the
 * week's availability and, only where the viewer may see them, week hours.
 * Admin tasks count only with `canSeeAdminData`. The caller checks
 * `team.canViewTeam`.
 */
export async function loadPeopleOverview(user: AuthenticatedUser, staff: Staff[]): Promise<PeopleOverviewRow[]> {
  const rows = staff.filter((member) => member.active);
  const staffIds = rows.map((row) => row.id);
  if (staffIds.length === 0) return [];

  const { today, days } = currentWeek();
  const includeAdmin = canSeeAdminData(user);
  const hoursIds = hoursVisibleIds(user, staffIds);
  const hoursVisible = new Set(hoursIds);

  const [tasksByStaff, projectsByStaff, absences, hours] = await Promise.all([
    peopleRepository.listAssignedOpenTasks(staffIds, { includeAdmin }),
    peopleRepository.listActiveProjectsByStaff(staffIds),
    absencesByStaff(staffIds, days),
    hoursByStaff(hoursIds, days[0]!),
  ]);

  return rows.map((row) => {
    const dueDates = (tasksByStaff.get(row.id) ?? []).map((t) => t.due);
    const { open, overdue } = openCounts(dueDates, today);
    return {
      staffId: row.id,
      open,
      overdue,
      activeProjects: projectsByStaff.get(row.id)?.length ?? 0,
      occupancyPct: occupancyPct(open, row.capacity),
      weekHours: hoursVisible.has(row.id) ? (hours.get(row.id)?.total ?? 0) : null,
      availability: weekAvailability({
        days,
        capacity: row.capacity,
        dueDates,
        absences: absences.get(row.id) ?? [],
      }),
    };
  });
}

/**
 * `personas.equipo()`: the team cards and availability of `/personas`.
 * `team.canViewTeam`, else FORBIDDEN. Reads the staff list **once** and
 * passes it to the overview. The puestos catalog for the editor is not here:
 * the drawer reads it when it opens (`personas.positions()`).
 */
export async function loadPersonasEquipo(user: AuthenticatedUser): Promise<PersonasEquipoData> {
  requireTeamViewer(user);
  const teamCaps = resolveTeamCapabilities(user);
  const [staff, tramos] = await Promise.all([
    listStaff(),
    activeTramos().catch((): WorkflowRef[] => []),
  ]);
  const overview = await loadPeopleOverview(user, staff).catch((): PeopleOverviewRow[] => []);
  const { people, emails } = buildTeamPeople(staff, overview, tramos);
  return { people, emails, canCreate: teamCaps.canCreateCollaborator };
}

/** Live, active staff: the Equipo tab count. */
async function countActiveStaff(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffTable)
    .where(and(isNull(staffTable.deletedAt), eq(staffTable.active, true)));
  return Number(row?.n ?? 0);
}

/**
 * `personas.counts()`: the four tab badges. A tab the viewer may not open
 * counts 0 (`team.canViewTeam` for Equipo, `clients.canViewClients` for the
 * contact tabs); a viewer who can open none of them gets FORBIDDEN.
 *
 * `activeStaff` is the Equipo count when the caller already knows it (the
 * `/personas` render, which just listed the active staff), saving the COUNT.
 */
export async function loadPersonasCounts(
  user: AuthenticatedUser,
  options: { activeStaff?: number } = {},
): Promise<Record<PersonasTab, number>> {
  const canViewTeam = resolveTeamCapabilities(user).canViewTeam;
  const canViewClients = resolveClientsCapabilities(user).canViewClients;
  if (!canViewTeam && !canViewClients) throw new Error("FORBIDDEN");
  const [equipo, contacts] = await Promise.all([
    canViewTeam ? (options.activeStaff ?? countActiveStaff()) : 0,
    canViewClients ? contactsRepository.countByType() : null,
  ]);
  return {
    equipo,
    clientes: contacts?.cliente ?? 0,
    contratistas: contacts?.contratista ?? 0,
    proveedores: contacts?.proveedor ?? 0,
  };
}

/** The SQL filter of each contacts tab (the same membership as `contactsForTab`). */
const TAB_FILTER: Record<PersonasContactsTab, { types: ContactType[]; providerSubtype?: ProviderSubtype }> = {
  clientes: { types: ["cliente"] },
  contratistas: { types: ["proveedor"], providerSubtype: "contratista" },
  // Every provider: the sub-filter chips count all of them.
  proveedores: { types: ["proveedor"] },
};

/**
 * `personas.contacts(tab, tipo)`: one tab's contacts, filtered by type in
 * SQL, with admin-only origin data dropped for viewers without
 * `canSeeAdminData`. `clients.canViewClients`, else FORBIDDEN. `tipo` is the
 * Proveedores sub-filter (ignored on the other tabs).
 */
export async function loadPersonasContacts(
  user: AuthenticatedUser,
  input: { tab: PersonasContactsTab; tipo?: string | null },
): Promise<PersonasContactsData> {
  const caps = resolveClientsCapabilities(user);
  if (!caps.canViewClients) throw new Error("FORBIDDEN");
  const isAdmin = canSeeAdminData(user);
  const rows = await contactsRepository.listContacts(TAB_FILTER[input.tab]);
  const subfilter: ProveedoresSubfilter | null =
    input.tab === "proveedores" ? parseProveedoresSubfilter(input.tipo ?? null) : null;
  return {
    tab: input.tab,
    contacts: rows.map((row) => toPersonasContact(row, { canSeeAdminData: isAdmin })),
    subfilter,
    capabilities: {
      canCreate: caps.canCreateClient,
      canEdit: caps.canEditClient,
      canDelete: caps.canDeleteClient,
      isAdmin,
    },
  };
}

/**
 * `personas.detail(staffId)`: Persona detalle. `team.canViewTeam`, else
 * FORBIDDEN; null for an id that is not a UUID or an unknown or deleted
 * person. Hours only for `canViewTeamHours` or self; admin tasks and admin
 * activity only with `canSeeAdminData` (BE §7.11).
 */
export async function loadPersonasDetail(
  user: AuthenticatedUser,
  input: { staffId: string },
): Promise<PersonaDetail | null> {
  requireTeamViewer(user);
  const { staffId } = input;
  if (typeof staffId !== "string" || !UUID_RE.test(staffId)) return null;
  const row = await peopleRepository.getStaffRow(staffId);
  if (!row) return null;

  const { today, days } = currentWeek();
  const includeAdmin = canSeeAdminData(user);
  const showHours = hoursVisibleIds(user, [staffId]).length > 0;

  const [positionsByStaff, tasksByStaff, projectsByStaff, withPhoto, absences, hours, activity] = await Promise.all([
    loadStaffPositions([staffId]),
    peopleRepository.listAssignedOpenTasks([staffId], { includeAdmin }),
    peopleRepository.listActiveProjectsByStaff([staffId]),
    peopleRepository.staffIdsWithPhoto([staffId]),
    absencesByStaff([staffId], days),
    hoursByStaff(showHours ? [staffId] : [], days[0]!),
    peopleRepository.listRecentActivity(staffId, { includeAdmin }),
  ]);

  const positions = positionsByStaff.get(staffId) ?? { positions: [], candidatePhases: [] };
  const staff = { ...toStaff(row), ...positions };
  const openTasks = tasksByStaff.get(staffId) ?? [];
  const projects = projectsByStaff.get(staffId) ?? [];
  const dueDates = openTasks.map((t) => t.due);
  const { open, overdue } = openCounts(dueDates, today);
  const availability = weekAvailability({
    days,
    capacity: row.capacity,
    dueDates,
    absences: absences.get(staffId) ?? [],
  });
  const personHours = showHours
    ? (hours.get(staffId) ?? { days: days.map((date) => ({ date, hours: 0 })), total: 0 })
    : null;
  const name = displayName(row.name, row.lastName);
  const initials = initialsOf(row.name, row.lastName);

  const stats: KpiDatum[] = [
    { key: "abiertas", label: "Abiertas", value: open },
    { key: "vencidas", label: "Vencidas", value: overdue },
  ];
  if (personHours) stats.push({ key: "horas_semana", label: "Horas esta semana", value: personHours.total });
  stats.push({ key: "proyectos_activos", label: "Proyectos activos", value: projects.length });

  const projectItems: ProgressItem[] = projects.map((project) => ({
    id: project.projectId,
    label: project.name,
    sublabel: project.role,
    real: Math.max(0, Math.min(100, project.progress)),
    href: `/proyectos/${project.projectId}`,
  }));

  return {
    staff,
    person: {
      id: row.id,
      name,
      initials,
      photoUrl: withPhoto.has(staffId) ? `/api/staff/${staffId}/photo` : null,
      puesto: positions.positions[0]?.name ?? null,
      tramo: dominantTramo(openTasks.map((t) => t.tramo)),
      open,
      overdue,
      activeProjects: projects.length,
      occupancyPct: occupancyPct(open, row.capacity),
      weekHours: personHours ? personHours.total : null,
      availability,
      href: `/personas/equipo/${staffId}`,
    },
    stats,
    projects: projectItems,
    tasks: toAttentionItems(openTasks, today, { id: row.id, name, initials }),
    weekHours: personHours ? personHours.days : null,
    availability,
    recentActivity: toRecentActivity(activity.rows, {
      includeAdmin,
      now: new Date(),
      timeZone: TIME_TRACKING_TIME_ZONE,
      customStatusNames: activity.customStatusNames,
    }),
  };
}
