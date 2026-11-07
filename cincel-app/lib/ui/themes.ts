/**
 * Theme presets (BE §5, FE §14.1): the single source of truth for token
 * values, the type scale and the shape defaults. Used by the seed migration,
 * `resolveAppearance`, the theme editor, the contrast test and
 * `npm run themes:css`. Pure and client-importable.
 */
import type { OrgAppearance, ThemeId, TokenName, TypeRole } from "@/lib/types/redesign";

type ThemeTokenValue = { light: string; dark: string };

export const THEME_IDS: readonly ThemeId[] = ["azul", "calido", "grafito"];

/** Display names (FE §3.8). */
export const THEME_LABELS: Record<ThemeId, string> = {
  azul: "Azul Cincel",
  calido: "Cálido",
  grafito: "Grafito",
};

/** Every token, in the order of BE §5.1–§5.2. */
export const TOKEN_NAMES: readonly TokenName[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "warning",
  "warning-ink",
  "success",
  "border",
  "border-strong",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-1-ink",
  "chart-2-ink",
  "chart-3-ink",
  "chart-4-ink",
  "chart-5-ink",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

/** BE §5.4 (= FE §14.3). */
export const TYPE_SCALE_DEFAULT: OrgAppearance["typeScale"] = {
  pageTitle: { size: 22, weight: 600 },
  sectionTitle: { size: 16, weight: 600 },
  cardTitle: { size: 14, weight: 500 },
  body: { size: 14, weight: 400 },
  label: { size: 12, weight: 500 },
  kpi: { size: 28, weight: 500 },
};

/** Bounds enforced by `OrgAppearanceSchema` (BE §5.4). */
export const TYPE_SCALE_BOUNDS: Record<TypeRole, { min: number; max: number }> = {
  pageTitle: { min: 18, max: 32 },
  sectionTitle: { min: 14, max: 20 },
  cardTitle: { min: 12, max: 20 },
  body: { min: 12, max: 17 },
  label: { min: 10, max: 14 },
  kpi: { min: 20, max: 40 },
};

/** BE §5.4 (= FE §14.4); `shadow` differs per preset (Azul `suave`, Cálido / Grafito `none`). */
export const SHAPE_DEFAULT: OrgAppearance["shape"] = { radius: 14, cardPadding: 20, gap: 16, shadow: "suave" };

export const SHAPE_BOUNDS = {
  radius: { min: 0, max: 24 },
  cardPadding: { min: 8, max: 28 },
  gap: { min: 6, max: 28 },
} as const;

const AZUL_TOKENS: Record<TokenName, ThemeTokenValue> = {
  "background": { light: "#f1f4f9", dark: "#0f1115" },
  "foreground": { light: "#0f172a", dark: "#e8ebf0" },
  "card": { light: "#ffffff", dark: "#1a1e24" },
  "card-foreground": { light: "#0f172a", dark: "#e8ebf0" },
  "popover": { light: "#ffffff", dark: "#1a1e24" },
  "popover-foreground": { light: "#0f172a", dark: "#e8ebf0" },
  "primary": { light: "#2563eb", dark: "#60a5fa" },
  "primary-foreground": { light: "#ffffff", dark: "#0b1220" },
  "secondary": { light: "#dbeafe", dark: "#1e2a44" },
  "secondary-foreground": { light: "#1d4ed8", dark: "#93b4fb" },
  "muted": { light: "#f1f5f9", dark: "#232830" },
  "muted-foreground": { light: "#606f86", dark: "#9aa3ae" },
  "accent": { light: "#eef2f7", dark: "#232830" },
  "accent-foreground": { light: "#0f172a", dark: "#e8ebf0" },
  "destructive": { light: "#d81844", dark: "#fb7185" },
  "warning": { light: "#b45309", dark: "#fbbf24" },
  "warning-ink": { light: "#b45309", dark: "#fbbf24" },
  "success": { light: "#047857", dark: "#34d399" },
  "border": { light: "#e5eaf1", dark: "#2a2f37" },
  "border-strong": { light: "#8b939f", dark: "#636a77" },
  "input": { light: "#e2e8f0", dark: "#2a2f37" },
  "ring": { light: "#2563eb", dark: "#60a5fa" },
  "chart-1": { light: "#3b82f6", dark: "#60a5fa" },
  "chart-2": { light: "#8b5cf6", dark: "#a78bfa" },
  "chart-3": { light: "#ce8300", dark: "#fbbf24" },
  "chart-4": { light: "#00a0bc", dark: "#22d3ee" },
  "chart-5": { light: "#04a874", dark: "#34d399" },
  "chart-1-ink": { light: "#1d4ed8", dark: "#93b4fb" },
  "chart-2-ink": { light: "#6d28d9", dark: "#c4b0fb" },
  "chart-3-ink": { light: "#af5006", dark: "#f5c56b" },
  "chart-4-ink": { light: "#0e7490", dark: "#67d6e6" },
  "chart-5-ink": { light: "#047857", dark: "#6ee7b7" },
  "sidebar": { light: "#f8fafc", dark: "#14171c" },
  "sidebar-foreground": { light: "#334155", dark: "#c3c9d2" },
  "sidebar-primary": { light: "#2563eb", dark: "#60a5fa" },
  "sidebar-primary-foreground": { light: "#ffffff", dark: "#0b1220" },
  "sidebar-accent": { light: "#eef2f7", dark: "#1d2128" },
  "sidebar-accent-foreground": { light: "#0f172a", dark: "#e8ebf0" },
  "sidebar-border": { light: "#e2e8f0", dark: "#2a2f37" },
  "sidebar-ring": { light: "#2563eb", dark: "#60a5fa" },
};

const CALIDO_TOKENS: Record<TokenName, ThemeTokenValue> = {
  "background": { light: "#f7f5f2", dark: "#171412" },
  "foreground": { light: "#26211c", dark: "#ece6de" },
  "card": { light: "#ffffff", dark: "#201c19" },
  "card-foreground": { light: "#26211c", dark: "#ece6de" },
  "popover": { light: "#ffffff", dark: "#201c19" },
  "popover-foreground": { light: "#26211c", dark: "#ece6de" },
  "primary": { light: "#26211c", dark: "#e08a62" },
  "primary-foreground": { light: "#fbf9f6", dark: "#171412" },
  "secondary": { light: "#f6e3d9", dark: "#3a2a22" },
  "secondary-foreground": { light: "#8f4421", dark: "#f0b597" },
  "muted": { light: "#f3efe9", dark: "#2a2521" },
  "muted-foreground": { light: "#6e665c", dark: "#a89f94" },
  "accent": { light: "#f1ede7", dark: "#2a2521" },
  "accent-foreground": { light: "#26211c", dark: "#ece6de" },
  "destructive": { light: "#b8432f", dark: "#ef8a78" },
  "warning": { light: "#8a6414", dark: "#e2b65a" },
  "warning-ink": { light: "#8a6414", dark: "#e2b65a" },
  "success": { light: "#3f6b4c", dark: "#8fbf9c" },
  "border": { light: "#ebe6df", dark: "#332d28" },
  "border-strong": { light: "#9a9289", dark: "#6f6761" },
  "input": { light: "#e3ddd4", dark: "#3a332d" },
  "ring": { light: "#cf6f45", dark: "#e08a62" },
  "chart-1": { light: "#cf6f45", dark: "#e08a62" },
  "chart-2": { light: "#9670a6", dark: "#b896c6" },
  "chart-3": { light: "#b98b31", dark: "#e2b65a" },
  "chart-4": { light: "#4c78a8", dark: "#7fa3cc" },
  "chart-5": { light: "#5e8c6a", dark: "#8fbf9c" },
  "chart-1-ink": { light: "#8f4421", dark: "#f0b597" },
  "chart-2-ink": { light: "#654775", dark: "#d9c2e3" },
  "chart-3-ink": { light: "#7a5810", dark: "#f0d08f" },
  "chart-4-ink": { light: "#365d86", dark: "#b3cbe6" },
  "chart-5-ink": { light: "#3f6b4c", dark: "#bfe0c8" },
  "sidebar": { light: "#f1ede7", dark: "#1c1815" },
  "sidebar-foreground": { light: "#4a433b", dark: "#d6cec4" },
  "sidebar-primary": { light: "#ffffff", dark: "#e08a62" },
  "sidebar-primary-foreground": { light: "#26211c", dark: "#171412" },
  "sidebar-accent": { light: "#e9e3db", dark: "#2a2521" },
  "sidebar-accent-foreground": { light: "#26211c", dark: "#ece6de" },
  "sidebar-border": { light: "#e3ddd4", dark: "#332d28" },
  "sidebar-ring": { light: "#cf6f45", dark: "#e08a62" },
};

const GRAFITO_TOKENS: Record<TokenName, ThemeTokenValue> = {
  "background": { light: "#f5f5f4", dark: "#141414" },
  "foreground": { light: "#0a0a0a", dark: "#e4e4e4" },
  "card": { light: "#ffffff", dark: "#1e1e1e" },
  "card-foreground": { light: "#0a0a0a", dark: "#e4e4e4" },
  "popover": { light: "#ffffff", dark: "#1e1e1e" },
  "popover-foreground": { light: "#0a0a0a", dark: "#e4e4e4" },
  "primary": { light: "#0a0a0a", dark: "#e4e4e4" },
  "primary-foreground": { light: "#ffffff", dark: "#141414" },
  "secondary": { light: "#f2f2f2", dark: "#292929" },
  "secondary-foreground": { light: "#0a0a0a", dark: "#e4e4e4" },
  "muted": { light: "#ededed", dark: "#242424" },
  "muted-foreground": { light: "#6b6b6b", dark: "#b0b0b0" },
  "accent": { light: "#e6e6e6", dark: "#303030" },
  "accent-foreground": { light: "#0a0a0a", dark: "#e4e4e4" },
  "destructive": { light: "#c6362b", dark: "#e25a4d" },
  "warning": { light: "#8a5e00", dark: "#e0b44a" },
  "warning-ink": { light: "#8a5e00", dark: "#e0b44a" },
  "success": { light: "#1e7a46", dark: "#4fbe84" },
  "border": { light: "#e5e5e5", dark: "rgba(255,255,255,0.14)" },
  "border-strong": { light: "#939393", dark: "#6a6a6a" },
  "input": { light: "#e5e5e5", dark: "rgba(255,255,255,0.18)" },
  "ring": { light: "#0a0a0a", dark: "#e4e4e4" },
  "chart-1": { light: "#2a78d6", dark: "#3987e5" },
  "chart-2": { light: "#eb6834", dark: "#d95926" },
  "chart-3": { light: "#16a774", dark: "#199e70" },
  "chart-4": { light: "#c78600", dark: "#c98500" },
  "chart-5": { light: "#6250d6", dark: "#9085e9" },
  "chart-1-ink": { light: "#1f5fae", dark: "#8ab8f0" },
  "chart-2-ink": { light: "#b4461b", dark: "#f0a07d" },
  "chart-3-ink": { light: "#137a55", dark: "#6fd3a8" },
  "chart-4-ink": { light: "#8a5e00", dark: "#f0c76a" },
  "chart-5-ink": { light: "#4b3bb0", dark: "#b9b0f2" },
  "sidebar": { light: "#0a0a0a", dark: "#1b1b1b" },
  "sidebar-foreground": { light: "#d4d4d4", dark: "#e4e4e4" },
  "sidebar-primary": { light: "#ffffff", dark: "#e4e4e4" },
  "sidebar-primary-foreground": { light: "#0a0a0a", dark: "#141414" },
  "sidebar-accent": { light: "#1f1f1f", dark: "#292929" },
  "sidebar-accent-foreground": { light: "#ffffff", dark: "#e4e4e4" },
  "sidebar-border": { light: "#262626", dark: "rgba(255,255,255,0.14)" },
  "sidebar-ring": { light: "#ffffff", dark: "#e4e4e4" },
};

function preset(
  baseTheme: ThemeId,
  tokens: Record<TokenName, ThemeTokenValue>,
  shadow: OrgAppearance["shape"]["shadow"],
): OrgAppearance {
  return {
    baseTheme,
    tokens,
    typeScale: TYPE_SCALE_DEFAULT,
    fontFamily: "Geist",
    shape: { ...SHAPE_DEFAULT, shadow },
    styleDefault: "visual",
    allowUserOverride: true,
    redesignDefault: false,
    redesignAvailable: true,
  };
}

/** One `OrgAppearance` per theme (BE §5). The org value starts from one of these. */
export const THEME_PRESETS: Record<ThemeId, OrgAppearance> = {
  azul: preset("azul", AZUL_TOKENS, "suave"),
  calido: preset("calido", CALIDO_TOKENS, "none"),
  grafito: preset("grafito", GRAFITO_TOKENS, "none"),
};

/** The org default when `appearance.theme` is missing or unreadable (BE §4, §8.1). */
export const DEFAULT_ORG_APPEARANCE: OrgAppearance = THEME_PRESETS.azul;
