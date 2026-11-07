"use server";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canViewTeamHours, resolveTeamCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
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
import * as peopleRepository from "@/lib/repositories/people-repository";
import { loadStaffPositions, toStaff } from "@/lib/repositories/staff-repository";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import { weekHours } from "@/lib/time-tracking/week-hours";
import { canSeeAdminData } from "@/lib/tramos/compat";
import type { DayHours, PeopleOverviewRow, PersonaDetail } from "@/lib/types/redesign";
import type { KpiDatum, ProgressItem } from "@/lib/types/widgets";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

/**
 * Personas aggregates (redesign BE §7.11). Auth: `team.canViewTeam`; hours only
 * for `canViewTeamHours` or self; admin tasks only with `canSeeAdminData`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireTeamViewer(): Promise<AuthenticatedUser> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canViewTeam) throw new Error("FORBIDDEN");
  return user;
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
  days: string[]
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
  weekStart: string
): Promise<Map<string, { days: DayHours[]; total: number }>> {
  if (staffIds.length === 0) return new Map();
  const settings = await getTimeTrackingSettings();
  return weekHours(db, staffIds, weekStart, settings);
}

/** Errors: `FORBIDDEN`, `NOT_FOUND` (unknown or deleted staff id). */
export async function fetchPersonaDetailAction(staffId: string): Promise<PersonaDetail> {
  const user = await requireTeamViewer();
  if (typeof staffId !== "string" || !UUID_RE.test(staffId)) throw new Error("NOT_FOUND");
  const row = await peopleRepository.getStaffRow(staffId);
  if (!row) throw new Error("NOT_FOUND");

  const { today, days } = currentWeek();
  const includeAdmin = canSeeAdminData(user);
  const showHours = hoursVisibleIds(user, [staffId]).length > 0;

  const [positionsByStaff, tasksByStaff, projectsByStaff, withPhoto, absences, hours] = await Promise.all([
    loadStaffPositions([staffId]),
    peopleRepository.listAssignedOpenTasks([staffId], { includeAdmin }),
    peopleRepository.listActiveProjectsByStaff([staffId]),
    peopleRepository.staffIdsWithPhoto([staffId]),
    absencesByStaff([staffId], days),
    hoursByStaff(showHours ? [staffId] : [], days[0]!),
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
  };
}

/** One row per active staff member. Errors: `FORBIDDEN`. */
export async function fetchPeopleOverviewAction(): Promise<PeopleOverviewRow[]> {
  const user = await requireTeamViewer();
  const rows = await peopleRepository.listActiveStaffRows();
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
