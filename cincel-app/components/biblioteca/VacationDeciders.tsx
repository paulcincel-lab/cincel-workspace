import "server-only";

import { TeamRequests } from "@/components/biblioteca/TeamRequests";
import { VacationSettings } from "@/components/biblioteca/VacationSettings";
import { loadVacationDeciderData } from "@/lib/vacations/decider-sections";

/**
 * The deciders' part of Mis vacaciones (redesign FE §3.7), mounted by the
 * `/biblioteca/vacaciones` page below the personal sections: "Solicitudes del
 * equipo" and, below it, the "Días de vacaciones" settings. Renders nothing
 * for viewers without `canDecideVacations` or while the reads are not
 * implemented.
 */
export async function VacationDeciders() {
  const data = await loadVacationDeciderData();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <TeamRequests requests={data.requests} viewerStaffId={data.viewerStaffId} canDecide />
      {data.settings ? <VacationSettings initial={data.settings} canDecide /> : null}
    </div>
  );
}
