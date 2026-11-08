import { AparienciaClient } from "@/components/ajustes/AparienciaClient";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesApariencia } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesAparienciaOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { APARIENCIA_SECTIONS } from "@/lib/shell/settings-sections/apariencia";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, presentation style, mode,
 * density, text size and live preview. Personal page (staff session only);
 * the Ajustes layout renders the header and `AjustesNav`. Prefetches
 * `qk.ajustes.page('apariencia')` (org appearance, admin flag); the caller's
 * preferences come from the `useAppearance` store the root layout seeds.
 */
export default async function AjustesAparienciaPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesAparienciaOptions(), () => loadAjustesApariencia(user));
  const sections = visibleSettingsSections(APARIENCIA_SECTIONS, user);

  return (
    <Hydrate qc={qc}>
      <AparienciaClient>
        {sections.map(({ name, Component }) => (
          <Component key={name} />
        ))}
      </AparienciaClient>
    </Hydrate>
  );
}
