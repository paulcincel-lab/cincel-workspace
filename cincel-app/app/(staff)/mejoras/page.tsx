import { notFound } from "next/navigation";

import { MejorasClient } from "@/components/mejoras/MejorasClient";
import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { mejorasCountsAction } from "@/lib/actions/mejoras-actions";
import { canManageSupport } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { Hydrate } from "@/lib/query/hydrate";
import { mejorasCountsOptions } from "@/lib/query/options/soporte";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { MEJORAS_ENABLED } from "@/lib/soporte/flags";
import type { MejorasCounts } from "@/lib/types/soporte";

/**
 * `/mejoras` (Soporte S4, #1114): the admin view of every solicitud. The
 * capability is checked on the server: a viewer without `canManageSupport`
 * gets `PermissionDenied` and no data is read for them. While
 * `MEJORAS_ENABLED` is off the route does not exist. The header stats read
 * `qk.mejoras.counts()`, prefetched here; the rows load on the client in the
 * active Estilo (the filters live in the URL).
 */
export default async function MejorasPage() {
  if (!MEJORAS_ENABLED) notFound();
  const user = await requireCapabilityUser();
  if (!canManageSupport(user)) return <PermissionDenied />;

  const qc = getQueryClient();
  await prefetch<MejorasCounts>(qc, mejorasCountsOptions(), () => mejorasCountsAction());

  return (
    <Hydrate qc={qc}>
      <MejorasClient />
    </Hydrate>
  );
}
