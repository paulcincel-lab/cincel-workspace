import { ThemeEditor } from "@/components/ajustes/ThemeEditor";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesTema } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesTemaOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { THEME_PRESETS } from "@/lib/ui/themes";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Tema y estilo (redesign FE §3.8): the organization theme editor.
 * The segment layout guards it with `canManageAppearance`; the Ajustes layout
 * renders `AjustesNav`. The published theme is prefetched into
 * `qk.ajustes.page('tema')` (the org appearance read is cached per request,
 * so it costs nothing after the root layout) and hydrated.
 */
export default async function AjustesTemaPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesTemaOptions(), () => loadAjustesTema(user));
  return (
    <Hydrate qc={qc}>
      <ThemeEditor presets={THEME_PRESETS} />
    </Hydrate>
  );
}
