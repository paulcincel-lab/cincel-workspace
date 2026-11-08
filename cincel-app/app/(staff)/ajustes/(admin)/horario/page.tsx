import { notFound, redirect } from "next/navigation";

import { HorarioClient } from "@/components/ajustes/HorarioClient";
import { canManageTimeTracking, canViewTeamHours } from "@/lib/auth/permissions";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesHorario } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesHorarioOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { HORARIO_SECTIONS } from "@/lib/shell/settings-sections/horario";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";
import { localDate, mondayOf } from "@/lib/time-tracking/local-time";

export const dynamic = "force-dynamic";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Ajustes › Control de horario (redesign FE §3.8). The segment layout admits
 * `canManageTimeTracking` or `canViewTeamHours`; the page renders the visible
 * sections of `lib/shell/settings-sections/horario/*` inside `HorarioClient`.
 * The Ajustes layout renders the header and `AjustesNav`.
 *
 * Prefetches this week's `qk.ajustes.page('horario', { weekStart })` with the
 * loader (the settings are read once per request) and hydrates it; changing
 * the week on the client is one page-data call.
 */
export default async function AjustesHorarioPage() {
  const access = await getSessionAccess();
  if (!access.user) redirect("/login");
  const user = await requireCapabilityUser();

  if (!canManageTimeTracking(user) && !canViewTeamHours(user)) notFound();

  const weekStart = mondayOf(localDate(new Date()));
  const sections = visibleSettingsSections(HORARIO_SECTIONS, user);
  const qc = getQueryClient();
  await prefetch(qc, ajustesHorarioOptions(weekStart), () => loadAjustesHorario(user, { weekStart }));

  return (
    <Hydrate qc={qc}>
      <HorarioClient weekStart={weekStart} viewerName={firstName(user.member.name)}>
        {sections.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </HorarioClient>
    </Hydrate>
  );
}
