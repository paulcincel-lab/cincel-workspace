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
    // The first INTERFAZ_VISIBLE rows show by default (canvas `Ajustes-Tema`); the rest behind "Ver los 19 colores".
    tokens: [
      { name: "background", label: "Fondo de página" },
      { name: "foreground", label: "Texto principal" },
      { name: "card", label: "Tarjetas" },
      { name: "muted", label: "Fondo atenuado" },
      { name: "muted-foreground", label: "Texto secundario" },
      { name: "primary", label: "Botón principal" },
      { name: "secondary", label: "Botón secundario" },
      { name: "border", label: "Bordes" },
      { name: "ring", label: "Anillo de foco" },
      { name: "card-foreground", label: "Texto de tarjetas" },
      { name: "popover", label: "Menús emergentes" },
      { name: "popover-foreground", label: "Texto de menús emergentes" },
      { name: "foreground-soft", label: "Texto suave" },
      { name: "accent", label: "Resaltado" },
      { name: "accent-foreground", label: "Texto resaltado" },
      { name: "primary-foreground", label: "Texto del botón" },
      { name: "secondary-foreground", label: "Texto del botón secundario" },
      { name: "border-strong", label: "Bordes de controles" },
      { name: "input", label: "Campos" },
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
      { name: "chart-4", label: "Decoración" },
      { name: "chart-4-ink", label: "Texto de Decoración" },
      { name: "chart-5", label: "Serie adicional" },
      { name: "chart-5-ink", label: "Texto de serie adicional" },
      { name: "destructive", label: "Vencido / bloqueado" },
      { name: "warning", label: "En riesgo" },
      { name: "warning-ink", label: "Texto de En riesgo" },
      { name: "success", label: "Completado" },
      { name: "destructive-ink", label: "Texto de Vencido / bloqueado" },
      { name: "tint-primary", label: "Fondo de Presale" },
      { name: "tint-violet", label: "Fondo de Diseño" },
      { name: "tint-warning", label: "Fondo de Construcción" },
      { name: "tint-cyan", label: "Fondo de Decoración" },
      { name: "tint-destructive", label: "Fondo de Vencido / bloqueado" },
      { name: "tint-success", label: "Fondo de Al día" },
    ],
  },
];

/** Rows of "Interfaz" shown before "Ver los 18 colores". */
export const INTERFAZ_VISIBLE = 9;

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
 * style settings stay as they are in the draft.
 */
export function applyPreset(draft: OrgAppearance, preset: OrgAppearance): OrgAppearance {
  return {
    ...preset,
    styleDefault: draft.styleDefault,
    allowUserOverride: draft.allowUserOverride,
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

/** The tokens a pair's result is shown on: its text token and its background (for a tint, the chart color). */
function pairTokens(def: ContrastPair): TokenName[] {
  const slot = tintSlot(def.bg);
  return [def.fg, slot ? (`chart-${slot}` as TokenName) : (def.bg as TokenName)];
}

export type TokenContrast = { ratio: number; min: number; ok: boolean };

/**
 * The contrast badge of one token row: of the `CONTRAST_PAIRS` it takes part
 * in (as text or background), the worst failing one, else the lowest ratio.
 * Null when the token is in no pair.
 */
export function tokenContrast(results: ContrastResult[], token: TokenName): TokenContrast | null {
  let worst: ContrastResult | null = null;
  for (const result of results) {
    const def = PAIRS_BY_NAME.get(result.pair);
    if (!def || !pairTokens(def).includes(token)) continue;
    if (!worst) worst = result;
    else if (worst.ok !== result.ok) worst = result.ok ? worst : result;
    else if (result.ratio < worst.ratio) worst = result;
  }
  return worst ? { ratio: worst.ratio, min: worst.min, ok: worst.ok } : null;
}

/** Distinct text colors of the failing pairs, in either mode (the save bar's "{n} color(es) no cumple(n)"). */
export function failingColorCount(results: Record<EditMode, ContrastResult[]>): number {
  const tokens = new Set<TokenName>();
  for (const result of [...results.light, ...results.dark]) {
    if (result.ok) continue;
    const def = PAIRS_BY_NAME.get(result.pair);
    if (def) tokens.add(def.fg);
  }
  return tokens.size;
}

/** "1 color no cumple el contraste" / "3 colores no cumplen el contraste". */
export function failingColorsText(count: number): string {
  return count === 1 ? "1 color no cumple el contraste" : `${count} colores no cumplen el contraste`;
}

/** "Hay 1 color que no cumple…" / "Hay 3 colores que no cumplen…": the publish confirmation. */
export function publishLowContrastQuestion(count: number): string {
  const colors = count === 1 ? "1 color que no cumple" : `${count} colores que no cumplen`;
  return `Hay ${colors} el contraste mínimo. ¿Publicar de todos modos?`;
}
