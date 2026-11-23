import { AjustesMenuClient } from "@/components/ajustes/AjustesMenuClient";
import { listEtapas } from "@/lib/etapas/compat";
import { getNavVisibility } from "@/lib/shell/nav-visibility-server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Menú: shows or hides each main menu element for the whole
 * organization. The segment layout guards it for administrators. The etapas
 * are read live, so a new etapa shows up here visible by default.
 */
export default async function AjustesMenuPage() {
  const [visibility, etapas] = await Promise.all([getNavVisibility(), listEtapas().catch(() => [])]);
  return (
    <AjustesMenuClient
      initialHidden={visibility.hidden}
      etapas={etapas.map((etapa) => ({ key: etapa.key, name: etapa.name }))}
    />
  );
}
