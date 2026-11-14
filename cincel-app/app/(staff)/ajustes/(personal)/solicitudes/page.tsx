import { notFound } from "next/navigation";

import { MisSolicitudes } from "@/components/soporte/MisSolicitudes";
import { requireCapabilityUser } from "@/lib/auth/session";
import { SOPORTE_ENABLED } from "@/lib/soporte/flags";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Mis solicitudes: personal page (staff session only). The Ajustes
 * layout renders the header and `AjustesNav`. The list loads on the client
 * from `qk.soporte.mine`; each action only returns the caller's own rows.
 * 404 while `SOPORTE_ENABLED` is off.
 */
export default async function AjustesSolicitudesPage() {
  await requireCapabilityUser();
  if (!SOPORTE_ENABLED) notFound();
  return <MisSolicitudes />;
}
