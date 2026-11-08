import { notFound } from "next/navigation";

import { PersonaDetailScreen } from "@/components/personas/PersonaDetail";
import { requireCapabilityUser } from "@/lib/auth/session";
import { Hydrate } from "@/lib/query/hydrate";
import { STALE, qk } from "@/lib/query/keys";
import { getQueryClient } from "@/lib/query/server";

import { loadPersonaDetail } from "./load-persona-detail";

/**
 * `/personas/equipo/[id]` (redesign FE §3.6): Persona detalle in the new
 * shell. Fetches `personas.detail(id)` with its loader (Query Migration 6),
 * which strips hours and admin data the viewer may not see, and hands it to
 * the client cache; a missing or hidden person is the not-found state.
 */
export default async function PersonaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  const detail = await qc.fetchQuery({
    queryKey: qk.personas.detail(id),
    queryFn: () => loadPersonaDetail(user, id),
    staleTime: STALE.screen,
  });
  if (!detail) notFound();
  return (
    <Hydrate qc={qc}>
      <PersonaDetailScreen staffId={id} />
    </Hydrate>
  );
}
