import { notFound, redirect } from "next/navigation";

import { HorarioClient } from "@/components/ajustes/HorarioClient";
import { fetchTeamHoursAction, fetchTimeTrackingSettingsAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { canManageTimeTracking, canViewTeamHours } from "@/lib/auth/permissions";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { settingsSectionsFor } from "@/lib/shell/settings-sections";
import { localDate, mondayOf } from "@/lib/time-tracking/local-time";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type { TeamHoursRow, TimeTrackingSettings } from "@/lib/types/redesign";

export const dynamic = "force-dynamic";

async function loadSettings(): Promise<TimeTrackingSettings> {
  try {
    return await fetchTimeTrackingSettingsAction();
  } catch (error) {
    console.error("[ajustes/horario] could not load the settings", error);
    return { ...DEFAULT_TIME_TRACKING_SETTINGS, workDays: [...DEFAULT_TIME_TRACKING_SETTINGS.workDays], exemptRoles: [] };
  }
}

async function loadRows(canViewReport: boolean, weekStart: string): Promise<TeamHoursRow[]> {
  if (!canViewReport || !IMPLEMENTED.fetchTeamHoursAction) return [];
  try {
    return await fetchTeamHoursAction({ weekStart });
  } catch (error) {
    console.error("[ajustes/horario] could not load the team hours", error);
    return [];
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Ajustes › Control de horario (redesign FE §3.8). The segment layout admits
 * `canManageTimeTracking` or `canViewTeamHours`; the page renders the visible
 * sections of `lib/shell/settings-sections/horario/*` inside `HorarioClient`.
 * The Ajustes layout renders the header and `AjustesNav`.
 */
export default async function AjustesHorarioPage() {

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");
  const user = await requireCapabilityUser();

  const canManage = canManageTimeTracking(user);
  const canViewReport = canViewTeamHours(user);
  if (!canManage && !canViewReport) notFound();

  const weekStart = mondayOf(localDate(new Date()));
  const sections = settingsSectionsFor("horario", user);
  const [settings, rows] = await Promise.all([loadSettings(), loadRows(canViewReport, weekStart)]);

  return (
    <HorarioClient
      settings={settings}
      canManage={canManage}
      canViewReport={canViewReport}
      weekStart={weekStart}
      rows={rows}
      viewerName={firstName(user.member.name)}
    >
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </HorarioClient>
  );
}
