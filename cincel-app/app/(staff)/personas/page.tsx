import { notFound } from "next/navigation";

import { EquipoView } from "@/components/personas/EquipoView";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { fetchPeopleOverviewAction } from "@/lib/actions/people-actions";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadPersonasTabCounts } from "@/lib/personas/tab-counts";
import { buildTeamPeople, parseEstiloParam } from "@/lib/personas/team";
import { listTramos } from "@/lib/tramos/compat";
import type { PeopleOverviewRow } from "@/lib/types/redesign";
import type { Position, WorkflowRef } from "@/lib/types/core";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/personas` (redesign FE §3.6): the Equipo tab in the new shell. Auth:
 * `team.canViewTeam`. Hours, admin tasks and owner-only data are already
 * filtered by `fetchPeopleOverviewAction` on the server.
 */
export default async function PersonasEquipoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  const user = await requireCapabilityUser();
  const teamCaps = resolveTeamCapabilities(user);
  if (!teamCaps.canViewTeam) notFound();

  const [staff, overview, tramos, positionOptions] = await Promise.all([
    fetchStaffAction(),
    fetchPeopleOverviewAction().catch((): PeopleOverviewRow[] => []),
    listTramos().catch((): WorkflowRef[] => []),
    fetchPositionsAction().catch((): Position[] => []),
  ]);
  const counts = await loadPersonasTabCounts({ staff });
  const { people, emails } = buildTeamPeople(staff, overview, tramos);

  const view = (
    <EquipoView
      people={people}
      emails={emails}
      counts={counts}
      positionOptions={positionOptions}
      canCreate={teamCaps.canCreateCollaborator}
    />
  );
  const estilo = parseEstiloParam(sp.estilo);
  return estilo ? (
    <StyleProvider style={estilo} scope="staff" isOverridden>
      {view}
    </StyleProvider>
  ) : (
    view
  );
}
