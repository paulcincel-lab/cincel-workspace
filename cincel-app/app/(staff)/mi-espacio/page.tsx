import { redirect } from "next/navigation";

import { MiEspacioClient } from "@/components/mi-espacio/MiEspacioClient";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { loadMiEspacio } from "@/lib/loaders/mi-espacio";
import { Hydrate } from "@/lib/query/hydrate";
import { seedMiEspacio } from "@/lib/query/options/mi-espacio";
import { getQueryClient } from "@/lib/query/server";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : null;
}

/**
 * /mi-espacio (redesign FE §3.3; Query Migration Phase 7, #941): the private
 * home of each staff member. One loader call reads the viewer's own rows
 * (owner-scoped on the server) and seeds the granular `me.*` keys, which the
 * client reads under `<Hydrate>`; mutations then patch that cache instead of
 * re-rendering the route.
 */
export default async function MiEspacioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");

  const qc = getQueryClient();
  seedMiEspacio(qc, await loadMiEspacio(await requireCapabilityUser()));

  return (
    <Hydrate qc={qc}>
      <MiEspacioClient noteParam={first(params.nota)} />
    </Hydrate>
  );
}
