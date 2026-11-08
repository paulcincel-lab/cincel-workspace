import { redirect } from "next/navigation";

import { PerfilClient, type PerfilData } from "@/components/ajustes/PerfilClient";
import { fetchMyTodayAction, fetchMyWeekHoursAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { getStaffPhotoUrl } from "@/lib/profile-photo/photo-url";
import * as staffRepository from "@/lib/repositories/staff-repository";
import { PERFIL_SECTIONS } from "@/lib/shell/settings-sections/perfil";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";
import type { WeekHours } from "@/lib/types/redesign";

export const dynamic = "force-dynamic";

/** "Mis horas esta semana" only when time tracking is enabled for the caller (`TodayStatus.enabled`). */
async function loadWeekHours(): Promise<WeekHours | null> {
  if (!TIME_TRACKING_IMPLEMENTED.fetchMyTodayAction || !TIME_TRACKING_IMPLEMENTED.fetchMyWeekHoursAction) return null;
  try {
    const today = await fetchMyTodayAction();
    if (!today.enabled) return null;
    return await fetchMyWeekHoursAction();
  } catch (error) {
    console.error("[ajustes/perfil] week hours", error);
    return null;
  }
}

async function loadPhotoUrl(staffId: string): Promise<string | null> {
  try {
    return await getStaffPhotoUrl(staffId);
  } catch (error) {
    console.error("[ajustes/perfil] photo", error);
    return null;
  }
}

/**
 * Ajustes › Perfil (redesign FE §3.8): photo, "Mis horas esta semana",
 * datos personales, firma, idioma y región, "Cambiar contraseña". Personal
 * page (staff session only); the Ajustes layout renders the header and
 * `AjustesNav`.
 */
export default async function AjustesPerfilPage() {

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");
  const user = await requireCapabilityUser();
  const staffId = user.member.id;

  const [detail, photoUrl, week] = await Promise.all([
    staffRepository.getStaff(staffId),
    loadPhotoUrl(staffId),
    loadWeekHours(),
  ]);

  const initial: PerfilData = {
    staffId,
    name: detail?.name ?? user.member.name,
    phone: detail?.phone ?? "",
    email: detail?.email ?? access.user.email ?? "",
    puesto: (detail?.positions ?? []).map((position) => position.name).join(", "),
    emailSignature: detail?.profile?.emailSignature ?? "",
    photoUrl,
    week,
  };

  const sections = visibleSettingsSections(PERFIL_SECTIONS, user);

  return (
    <PerfilClient initial={initial}>
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </PerfilClient>
  );
}
