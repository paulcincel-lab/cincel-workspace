import { THEME_LABELS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

/** "Azul Cincel · claro"; the mode alone when the context has no (known) theme id. */
export function formatThemeLabel(themeId: string | null | undefined, mode: string | null | undefined): string {
  const modeLabel = mode === "dark" ? "oscuro" : mode === "light" ? "claro" : mode || "";
  const themeLabel = themeId ? THEME_LABELS[themeId as ThemeId] : undefined;
  if (themeLabel && modeLabel) return `${themeLabel} · ${modeLabel}`;
  return themeLabel ?? modeLabel;
}
