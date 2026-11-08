import { IntegracionesClient, IntegracionesCutto } from "@/components/ajustes/IntegracionesClient";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesIntegraciones } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesIntegracionesOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { INTEGRACIONES_SECTIONS } from "@/lib/shell/settings-sections/integraciones";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/** Cards with a lower `order` go above the Cutto link card; the rest (monday) below it. */
const CUTTO_CARD_ORDER = 35;

/**
 * Ajustes › Integraciones (redesign FE §3.8): Gmail, Google Calendar, Google
 * Drive, Cutto (link only) and monday. Personal page (staff session only);
 * the Ajustes layout renders the header and `AjustesNav`. Prefetches
 * `qk.ajustes.page('integraciones')`, read from the DB only: rendering the
 * page makes no OAuth HTTP call.
 */
export default async function AjustesIntegracionesPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesIntegracionesOptions(), () => loadAjustesIntegraciones(user));

  const sections = visibleSettingsSections(INTEGRACIONES_SECTIONS, user);
  const above = sections.filter((s) => s.order < CUTTO_CARD_ORDER);
  const below = sections.filter((s) => s.order >= CUTTO_CARD_ORDER);

  return (
    <Hydrate qc={qc}>
      <IntegracionesClient>
        {above.map(({ name, Component }) => (
          <Component key={name} />
        ))}
        <IntegracionesCutto />
        {below.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </IntegracionesClient>
    </Hydrate>
  );
}
