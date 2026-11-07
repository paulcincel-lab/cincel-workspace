/**
 * Model of Ajustes › Tema y estilo (redesign FE §3.8, §4.8, §14.6): token
 * sections and labels, type role labels, preset application and the mapping
 * of `checkContrast` failures to the rows to mark. Pure and client-safe; every
 * ratio comes from `lib/ui/contrast.ts`.
 */
import type { OrgAppearance, ThemeId, TokenName, TypeRole } from "@/lib/types/redesign";
import { CONTRAST_PAIRS, checkContrast, type ContrastPair, type ContrastResult } from "@/lib/ui/contrast";
import { mixTint, type ChartSlot } from "@/lib/ui/tints";

export type EditMode = "light" | "dark";

export const EDIT_MODE_LABELS: Record<EditMode, string> = { light: "Claro", dark: "Oscuro" };

export type TokenSection = { title: string; tokens: { name: TokenName; label: string }[] };

/** Every token, grouped as the editor shows them (FE §3.8: Interfaz / Navegación / Tramos y estatus). */
export const TOKEN_SECTIONS: readonly TokenSection[] = [
  {
    title: "Interfaz",
    tokens: [
      { name: "background", label: "Fondo de página" },
      { name: "foreground", label: "Texto principal" },
      { name: "card", label: "Tarjetas" },
      { name: "card-foreground", label: "Texto de tarjetas" },
      { name: "popover", label: "Menús emergentes" },
      { name: "popover-foreground", label: "Texto de menús emergentes" },
      { name: "muted", label: "Fondo atenuado" },
      { name: "muted-foreground", label: "Texto secundario" },
      { name: "accent", label: "Resaltado" },
      { name: "accent-foreground", label: "Texto resaltado" },
      { name: "primary", label: "Botón principal" },
      { name: "primary-foreground", label: "Texto del botón" },
      { name: "secondary", label: "Botón secundario" },
      { name: "secondary-foreground", label: "Texto del botón secundario" },
      { name: "border", label: "Bordes" },
      { name: "border-strong", label: "Bordes de controles" },
      { name: "input", label: "Campos" },
      { name: "ring", label: "Anillo de foco" },
    ],
  },
  {
    title: "Navegación",
    tokens: [
      { name: "sidebar", label: "Fondo del menú" },
      { name: "sidebar-foreground", label: "Texto del menú" },
      { name: "sidebar-primary", label: "Ítem activo" },
      { name: "sidebar-primary-foreground", label: "Texto del ítem activo" },
      { name: "sidebar-accent", label: "Ítem al pasar el cursor" },
      { name: "sidebar-accent-foreground", label: "Texto del ítem al pasar el cursor" },
      { name: "sidebar-border", label: "Bordes del menú" },
      { name: "sidebar-ring", label: "Foco del menú" },
    ],
  },
  {
    title: "Tramos y estatus",
    tokens: [
      { name: "chart-1", label: "Presale" },
      { name: "chart-1-ink", label: "Texto de Presale" },
      { name: "chart-2", label: "Diseño" },
      { name: "chart-2-ink", label: "Texto de Diseño" },
      { name: "chart-3", label: "Construcción" },
      { name: "chart-3-ink", label: "Texto de Construcción" },
      { name: "chart-4", label: "En proceso" },
      { name: "chart-4-ink", label: "Texto de En proceso" },
      { name: "chart-5", label: "Serie adicional" },
      { name: "chart-5-ink", label: "Texto de serie adicional" },
      { name: "destructive", label: "Vencido / bloqueado" },
      { name: "warning", label: "En riesgo" },
      { name: "warning-ink", label: "Texto de En riesgo" },
      { name: "success", label: "Completado" },
    ],
  },
];

/** Type roles in editor order (FE §3.8 "Tipografía"). */
export const TYPE_ROLE_LABELS: readonly { role: TypeRole; label: string }[] = [
  { role: "pageTitle", label: "Título de página" },
  { role: "sectionTitle", label: "Título de sección" },
  { role: "cardTitle", label: "Título de tarjeta" },
  { role: "body", label: "Texto" },
  { role: "label", label: "Etiquetas" },
  { role: "kpi", label: "Números KPI" },
];

export const FONT_FAMILIES: readonly OrgAppearance["fontFamily"][] = ["Geist", "Inter", "DM Sans"];

export const SHADOW_LABELS: Record<OrgAppearance["shape"]["shadow"], string> = {
  none: "Ninguna",
  suave: "Suave",
  marcada: "Marcada",
};

export const STYLE_CARDS: readonly { value: OrgAppearance["styleDefault"]; label: string; description: string }[] = [
  { value: "visual", label: "Visual", description: "Gráficas grandes, donas, anillos y color por tramo." },
  { value: "esencial", label: "Esencial", description: "Solo números, texto y listas. Sin gráficas." },
  { value: "analitico", label: "Analítico", description: "Tablas densas con variaciones y desvíos." },
];

/**
 * "Partir de": the preset's tokens, type scale, font and shape; the org's
 * style and flag settings stay as they are in the draft.
 */
export function applyPreset(draft: OrgAppearance, preset: OrgAppearance): OrgAppearance {
  return {
    ...preset,
    styleDefault: draft.styleDefault,
    allowUserOverride: draft.allowUserOverride,
    redesignDefault: draft.redesignDefault,
    redesignAvailable: draft.redesignAvailable,
  };
}

/** Same base preset, same values: whether the draft equals the preset of `id` (style settings ignored). */
export function matchesPreset(draft: OrgAppearance, presets: Record<ThemeId, OrgAppearance>, id: ThemeId): boolean {
  const preset = presets[id];
  return (
    draft.baseTheme === id &&
    draft.fontFamily === preset.fontFamily &&
    JSON.stringify(draft.tokens) === JSON.stringify(preset.tokens) &&
    JSON.stringify(draft.typeScale) === JSON.stringify(preset.typeScale) &&
    JSON.stringify(draft.shape) === JSON.stringify(preset.shape)
  );
}

const PAIRS_BY_NAME = new Map<string, ContrastPair>(CONTRAST_PAIRS.map((p) => [p.pair, p]));

function tintSlot(bg: ContrastPair["bg"]): ChartSlot | null {
  const match = /^chart-([1-5])-tint$/.exec(bg);
  return match ? (Number(match[1]) as ChartSlot) : null;
}

/** Both modes' contrast results of a draft. */
export function contrastResults(tokens: OrgAppearance["tokens"]): Record<EditMode, ContrastResult[]> {
  return { light: checkContrast(tokens, "light"), dark: checkContrast(tokens, "dark") };
}

/** `4.5` → "4.5"; rounded down so a value shown as passing always passes. */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

function pairLabel(def: ContrastPair): string {
  return `--${def.fg} / --${def.bg}`;
}

/**
 * The failing pairs of one mode, keyed by every editable token that takes part
 * (the text token and its background; for a tint, the chart color), with the
 * row message.
 */
export function failingRows(results: ContrastResult[]): Map<TokenName, string> {
  const byToken = new Map<TokenName, string[]>();
  for (const result of results) {
    if (result.ok) continue;
    const def = PAIRS_BY_NAME.get(result.pair);
    if (!def) continue;
    const slot = tintSlot(def.bg);
    const involved: TokenName[] = [def.fg, slot ? (`chart-${slot}` as TokenName) : (def.bg as TokenName)];
    const message = `${pairLabel(def)}: ${formatRatio(result.ratio)}:1, necesita ${def.min}:1`;
    for (const token of involved) {
      byToken.set(token, [...(byToken.get(token) ?? []), message]);
    }
  }
  return new Map([...byToken].map(([token, messages]) => [token, `Contraste bajo. ${messages.join(" · ")}`]));
}

/** The text pairs (≥ 4.5:1) of one mode as resolved colors, for `ContrastBadge`. */
export function textPairs(tokens: OrgAppearance["tokens"], mode: EditMode): { fg: string; bg: string; label: string }[] {
  return CONTRAST_PAIRS.filter((p) => p.min === 4.5).map((p) => {
    const slot = tintSlot(p.bg);
    const bg = slot
      ? mixTint(tokens[`chart-${slot}` as TokenName][mode], tokens.card[mode], mode)
      : tokens[p.bg as TokenName][mode];
    return { fg: tokens[p.fg][mode], bg, label: pairLabel(p) };
  });
}
