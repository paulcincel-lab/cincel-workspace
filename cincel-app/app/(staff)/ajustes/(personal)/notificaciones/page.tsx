import { notFound } from "next/navigation";

import { NotificacionesClient } from "@/components/ajustes/NotificacionesClient";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesNotificaciones } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesNotificacionesOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { NOTIFICACIONES_SECTIONS } from "@/lib/shell/settings-sections/notificaciones";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Notificaciones (redesign FE §3.8): personal page (staff session
 * only, no admin guard). The Ajustes layout renders the header and
 * `AjustesNav`; this page renders only the form (#949). Prefetches
 * `qk.ajustes.page('notificaciones')`. 404 while the preference actions are
 * stubs.
 */
export default async function AjustesNotificacionesPage() {
  const user = await requireCapabilityUser();
  const sections = visibleSettingsSections(NOTIFICACIONES_SECTIONS, user);
  if (sections.length === 0) notFound();

  const qc = getQueryClient();
  await prefetch(qc, ajustesNotificacionesOptions(), () => loadAjustesNotificaciones(user));

  return (
    <Hydrate qc={qc}>
      <NotificacionesClient>
        {sections.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </NotificacionesClient>
    </Hydrate>
  );
}
