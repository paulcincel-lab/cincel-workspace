import { notFound } from "next/navigation";

import { PersonasEquipoScreen } from "@/components/personas/EquipoView";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadPersonasCounts, loadPersonasEquipo } from "@/lib/loaders/personas";
import { Hydrate } from "@/lib/query/hydrate";
import { STALE, qk } from "@/lib/query/keys";
import { getQueryClient, prefetch } from "@/lib/query/server";

/**
 * `/personas` (redesign FE §3.6): the Equipo tab in the new shell. Auth:
 * `team.canViewTeam`. Prefetches `personas.equipo()` and `personas.counts()`
 * with their loaders (Query Migration 6), which already strip hours, admin
 * tasks and owner-only data, and hands them to the client cache.
 */
export default async function PersonasEquipoPage() {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canViewTeam) notFound();

  const qc = getQueryClient();
  await prefetch(qc, { queryKey: qk.personas.equipo(), staleTime: STALE.screen }, () => loadPersonasEquipo(user));
  // The Equipo count is the active team the page just listed: no second COUNT.
  const equipo = qc.getQueryData<Awaited<ReturnType<typeof loadPersonasEquipo>>>(qk.personas.equipo());
  await prefetch(qc, { queryKey: qk.personas.counts(), staleTime: STALE.screen }, () =>
    loadPersonasCounts(user, equipo ? { activeStaff: equipo.people.length } : {}),
  );

  return (
    <Hydrate qc={qc}>
      <PersonasEquipoScreen />
    </Hydrate>
  );
}
