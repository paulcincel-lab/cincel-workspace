import { ThemeEditor } from "@/components/ajustes/ThemeEditor";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { THEME_PRESETS } from "@/lib/ui/themes";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Tema y estilo (redesign FE §3.8): the organization theme editor.
 * The segment layout guards it with `canManageAppearance`; the Ajustes layout
 * renders `AjustesNav`. New-only route: with the redesign off it redirects to
 * the legacy equivalent.
 */
export default async function AjustesTemaPage() {
  await redirectIfRedesignOff("/ajustes/tema");
  const initial = await fetchOrgAppearanceAction();
  return <ThemeEditor initial={initial} presets={THEME_PRESETS} />;
}
