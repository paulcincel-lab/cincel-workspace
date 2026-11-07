/**
 * "Exportar CSS" of Ajustes › Tema y estilo (redesign FE §3.8): the resolved
 * `:root` (light) and `.dark` blocks of an org appearance, built from the same
 * `toCssVars` the root layout renders. Pure and client-safe.
 */
import type { OrgAppearance } from "@/lib/types/redesign";
import { toCssVars } from "@/lib/ui/appearance-css";

/** File name of the downloaded stylesheet. */
export const THEME_CSS_FILENAME = "cincel-tema.css";

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/** `:root { … }` with the light values and `.dark { … }` with the dark ones. */
export function themeCss(appearance: OrgAppearance): string {
  return `${block(":root", toCssVars(appearance, "light"))}\n\n${block(".dark", toCssVars(appearance, "dark"))}\n`;
}
