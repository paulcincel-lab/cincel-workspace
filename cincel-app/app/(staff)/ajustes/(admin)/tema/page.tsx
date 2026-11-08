import { ThemeEditor } from "@/components/ajustes/ThemeEditor";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { THEME_PRESETS } from "@/lib/ui/themes";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Tema y estilo (redesign FE §3.8): the organization theme editor.
 * The segment layout guards it with `canManageAppearance`; the Ajustes layout
 * renders `AjustesNav`.
 */
export default async function AjustesTemaPage() {
  const initial = await fetchOrgAppearanceAction();
  return <ThemeEditor initial={initial} presets={THEME_PRESETS} />;
}
