"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, type CSSProperties, type ReactNode } from "react";

import { ChoiceCards, SegmentedChoice, type ChoiceCardOption } from "@/components/ajustes/ChoiceCards";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { ajustesAparienciaOptions, type AjustesAparienciaPageData } from "@/lib/query/options/ajustes";
import { OVERRIDE_LOCKED_COPY, useAppearance, type AparienciaSectionKey } from "@/lib/stores/appearance-store";
import type {
  ColorMode,
  Density,
  OrgAppearance,
  PresentationStyle,
  TextSize,
  ThemeId,
  TokenName,
} from "@/lib/types/redesign";
import { THEME_IDS, THEME_LABELS, THEME_PRESETS } from "@/lib/ui/themes";
import { cn } from "@/lib/utils";

/**
 * The sections of Ajustes › Apariencia (redesign FE §3.8, canvas
 * `Ajustes-Apariencia`), registered in `lib/shell/settings-sections/apariencia/*`:
 * Tema, Modo, Estilo, Tamaño de texto and Densidad. The caller's preferences,
 * errors and the override lock come from the `useAppearance` store (one
 * primitive selector per field); the org appearance and the admin flag from
 * the hydrated `qk.ajustes.page('apariencia')`. Every change goes through
 * `setPreference(patch, { section })`: applied at once, rolled back on
 * error, and the text size is debounced once, in the store.
 */

/** The three text sizes (Chico, Normal, Grande); stored values snap to the nearest. */
export const TEXT_SIZES = [13, 14, 15] as const satisfies readonly TextSize[];

/** Snap any stored text size to the nearest of Chico (13), Normal (14) and Grande (15). */
export function toTextSize(value: number): TextSize {
  if (!Number.isFinite(value)) return 14;
  let best: TextSize = TEXT_SIZES[0];
  for (const size of TEXT_SIZES) {
    if (Math.abs(size - value) < Math.abs(best - value)) best = size;
  }
  return best;
}

/** The hydrated Apariencia page data (org appearance, admin flag, org override policy). */
export function useAparienciaPageData(): AjustesAparienciaPageData {
  return useSuspenseQuery(ajustesAparienciaOptions()).data;
}

/** Personal theme and style allowed: the org allows them and the server did not answer `OVERRIDE_DISABLED`. */
export function useOverridesAllowed(): boolean {
  const { overridesAllowed } = useAparienciaPageData();
  const allowedByStore = useAppearance((s) => s.overridesAllowed);
  return overridesAllowed && allowedByStore;
}

export const STYLE_NAMES: Record<PresentationStyle, string> = {
  visual: "Visual",
  esencial: "Esencial",
  analitico: "Analítico",
};

export const STYLE_DESCRIPTIONS: Record<PresentationStyle, string> = {
  visual: "Tableros, gráficas y movimiento.",
  esencial: "Lo necesario, ligero.",
  analitico: "Todos los datos en tablas agrupadas.",
};

export const ESTILO_NOTE =
  "Si tu despacho fija un estilo para todos, esta opción se muestra bloqueada con el estilo elegido por un administrador.";

/** Note under the locked style cards. */
export function estiloFixedNote(style: PresentationStyle): string {
  return `Tu despacho usa ${STYLE_NAMES[style]} para todos.`;
}

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

const MODE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "comoda", label: "Cómoda" },
  { value: "compacta", label: "Compacta" },
];

type TextSizeValue = "13" | "14" | "15";

const TEXT_SIZE_OPTIONS: { value: TextSizeValue; label: string; labelClassName: string }[] = [
  { value: "13", label: "Chico", labelClassName: "text-[12px]" },
  { value: "14", label: "Normal", labelClassName: "text-[13.5px]" },
  { value: "15", label: "Grande", labelClassName: "text-[15px]" },
];

function SectionError({ section }: { section: AparienciaSectionKey }) {
  const message = useAppearance((s) => s.errors[section]);
  return (
    <p role="status" aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message ?? ""}
    </p>
  );
}

/** Note box under a card grid: `--muted` background, 12.5 px `--muted-foreground`. */
function NoteBox({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="rounded-[10px] bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground">
      {children}
    </p>
  );
}

// ── Tema ────────────────────────────────────────────────────────────────────

const PREVIEW_TOKENS = [
  "background",
  "sidebar",
  "card",
  "border",
  "foreground",
  "muted-foreground",
  "primary",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
] as const satisfies readonly TokenName[];

/** The org's own tokens for its base theme (it may have customized them), else the preset. */
function themeTokens(id: ThemeId, org: OrgAppearance): OrgAppearance["tokens"] {
  return id === org.baseTheme ? org.tokens : THEME_PRESETS[id].tokens;
}

/** The theme's light and dark values as scoped custom properties; the `.dark` class on `<html>` picks the set. */
function previewVars(tokens: OrgAppearance["tokens"]): CSSProperties {
  const vars: Record<string, string> = {};
  for (const name of PREVIEW_TOKENS) {
    vars[`--pv-${name}`] = tokens[name].light;
    vars[`--pv-${name}-d`] = tokens[name].dark;
  }
  return vars as CSSProperties;
}

/** 64 px mini app preview of one theme: sidebar strip (28 %) with 3 bars, then the content area. */
function ThemeMiniPreview({ tokens }: { tokens: OrgAppearance["tokens"] }) {
  return (
    <span
      style={previewVars(tokens)}
      className="flex h-16 overflow-hidden rounded-lg border border-(--pv-border) bg-(--pv-background) dark:border-(--pv-border-d) dark:bg-(--pv-background-d)"
    >
      <span className="flex w-[28%] flex-col gap-1 bg-(--pv-sidebar) p-1.5 dark:bg-(--pv-sidebar-d)">
        <span className="h-1.5 rounded-full bg-(--pv-primary) dark:bg-(--pv-primary-d)" />
        <span className="h-1.5 rounded-full bg-(--pv-muted-foreground) opacity-50 dark:bg-(--pv-muted-foreground-d)" />
        <span className="h-1.5 rounded-full bg-(--pv-muted-foreground) opacity-50 dark:bg-(--pv-muted-foreground-d)" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-2 w-2/3 rounded-full bg-(--pv-foreground) dark:bg-(--pv-foreground-d)" />
        <span className="flex flex-1 items-end rounded-md border border-(--pv-border) bg-(--pv-card) p-1.5 dark:border-(--pv-border-d) dark:bg-(--pv-card-d)">
          <span className="ml-auto h-2 w-6 rounded-full bg-(--pv-primary) dark:bg-(--pv-primary-d)" />
        </span>
      </span>
    </span>
  );
}

/** 14 px swatch dots: the primary and the four etapa slots of the theme. */
function ThemeSwatches({ tokens }: { tokens: OrgAppearance["tokens"] }) {
  return (
    <span style={previewVars(tokens)} className="flex items-center gap-1.5">
      <span className="size-3.5 rounded-full bg-(--pv-primary) dark:bg-(--pv-primary-d)" />
      <span className="size-3.5 rounded-full bg-(--pv-chart-1) dark:bg-(--pv-chart-1-d)" />
      <span className="size-3.5 rounded-full bg-(--pv-chart-2) dark:bg-(--pv-chart-2-d)" />
      <span className="size-3.5 rounded-full bg-(--pv-chart-3) dark:bg-(--pv-chart-3-d)" />
      <span className="size-3.5 rounded-full bg-(--pv-chart-4) dark:bg-(--pv-chart-4-d)" />
    </span>
  );
}

export function AparienciaTemaSection() {
  const { org, isAdmin } = useAparienciaPageData();
  const overridesAllowed = useOverridesAllowed();
  const ownTheme = useAppearance((s) => s.preferences.theme);
  const setPreference = useAppearance((s) => s.setPreference);
  const noteId = useId();
  const selected: ThemeId = overridesAllowed ? (ownTheme ?? org.baseTheme) : org.baseTheme;

  const options: ChoiceCardOption<ThemeId>[] = THEME_IDS.map((id) => {
    const tokens = themeTokens(id, org);
    return {
      value: id,
      title: THEME_LABELS[id],
      preview: <ThemeMiniPreview tokens={tokens} />,
      footer: <ThemeSwatches tokens={tokens} />,
    };
  });

  return (
    <SettingsSection
      title="Tema"
      description="Colores de toda la aplicación. Se aplica al instante."
      actions={
        isAdmin ? (
          <Link href="/ajustes/tema" className={cn(buttonVariants({ variant: "link", size: "sm" }), "px-0")}>
            Editar tema de la organización
          </Link>
        ) : undefined
      }
    >
      <ChoiceCards
        label="Tema"
        value={selected}
        options={options}
        disabled={!overridesAllowed}
        describedBy={overridesAllowed ? undefined : noteId}
        // Picking the org's theme follows the org (null), so a later org change reaches this user.
        onChange={(theme) => void setPreference({ theme: theme === org.baseTheme ? null : theme }, { section: "tema" })}
      />
      {overridesAllowed ? null : <NoteBox id={noteId}>{OVERRIDE_LOCKED_COPY}</NoteBox>}
      <SectionError section="tema" />
    </SettingsSection>
  );
}

// ── Modo ────────────────────────────────────────────────────────────────────

export function AparienciaModoSection() {
  const mode = useAppearance((s) => s.preferences.mode);
  const setPreference = useAppearance((s) => s.setPreference);
  return (
    <SettingsSection title="Modo" description="Claro, oscuro o el de tu sistema." inline>
      <SegmentedChoice
        label="Modo"
        value={mode}
        options={MODE_OPTIONS}
        onChange={(next) => void setPreference({ mode: next }, { section: "modo" })}
      />
      <SectionError section="modo" />
    </SettingsSection>
  );
}

// ── Estilo ──────────────────────────────────────────────────────────────────

/** Visual: three kanban columns with an etapa dot and two cards each. */
function VisualSchematic() {
  return (
    <span className="grid flex-1 grid-cols-3 gap-1.5">
      {(["bg-chart-1", "bg-chart-2", "bg-chart-3"] as const).map((dot) => (
        <span key={dot} className="flex flex-col gap-1 rounded-md bg-muted p-1">
          <span className={cn("h-1 w-1/2 rounded-full", dot)} />
          <span className="h-5 rounded-sm bg-card" />
          <span className="h-5 rounded-sm bg-card" />
        </span>
      ))}
    </span>
  );
}

/** Esencial: a list of soft cards. */
function EsencialSchematic() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <span key={row} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
          <span className="size-2 rounded-full bg-muted-foreground opacity-40" />
          <span className="h-1.5 flex-1 rounded-full bg-muted" />
        </span>
      ))}
    </>
  );
}

/** Analítico: a KPI row over table lines. */
function AnaliticoSchematic() {
  return (
    <>
      <span className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((kpi) => (
          <span key={kpi} className="flex flex-col gap-1 rounded-sm border border-border bg-card p-1">
            <span className="h-1 w-2/3 rounded-full bg-muted" />
            <span className="h-2 w-1/2 rounded-full bg-primary opacity-70" />
          </span>
        ))}
      </span>
      <span className="flex flex-1 flex-col gap-1 rounded-sm border border-border bg-card p-1">
        <span className="h-1.5 rounded-sm bg-muted" />
        {[0, 1, 2, 3].map((line) => (
          <span key={line} className="h-1 rounded-full bg-accent" />
        ))}
      </span>
    </>
  );
}

/** The schematic drawing of each style (a lookup, so settings markup never branches on the style). */
const STYLE_SCHEMATICS: Record<PresentationStyle, () => ReactNode> = {
  visual: VisualSchematic,
  esencial: EsencialSchematic,
  analitico: AnaliticoSchematic,
};

/** 120 px schematic of a style: Visual = 3 kanban columns, Esencial = soft card list, Analítico = KPI row + table lines. */
export function StyleSchematic({ style }: { style: PresentationStyle }) {
  const Drawing = STYLE_SCHEMATICS[style];
  return (
    <span className="flex h-[120px] flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-background p-2.5">
      <Drawing />
    </span>
  );
}

export function AparienciaEstiloSection() {
  const { org } = useAparienciaPageData();
  const overridesAllowed = useOverridesAllowed();
  const ownStyle = useAppearance((s) => s.preferences.style);
  const setPreference = useAppearance((s) => s.setPreference);
  const noteId = useId();
  const selected: PresentationStyle = overridesAllowed ? (ownStyle ?? org.styleDefault) : org.styleDefault;

  const options: ChoiceCardOption<PresentationStyle>[] = STYLES.map((style) => ({
    value: style,
    title: STYLE_NAMES[style],
    description: STYLE_DESCRIPTIONS[style],
    preview: <StyleSchematic style={style} />,
  }));

  return (
    <SettingsSection
      title="Estilo"
      description="Decide cómo se ve cada pantalla. Elige uno para ver Tareas en ese estilo."
    >
      <ChoiceCards
        label="Estilo"
        value={selected}
        options={options}
        disabled={!overridesAllowed}
        describedBy={noteId}
        onChange={(next) => void setPreference({ style: next === org.styleDefault ? null : next }, { section: "estilo" })}
        afterSelected={
          <Link
            href={`/tareas?estilo=${selected}`}
            className={cn(buttonVariants({ variant: "link", size: "sm" }), "px-0")}
          >
            Ver Tareas en este estilo →
          </Link>
        }
      />
      <NoteBox id={noteId}>{overridesAllowed ? ESTILO_NOTE : estiloFixedNote(org.styleDefault)}</NoteBox>
      <SectionError section="estilo" />
    </SettingsSection>
  );
}

// ── Tamaño de texto ─────────────────────────────────────────────────────────

export function AparienciaTamanoTextoSection() {
  const textSize = useAppearance((s) => s.preferences.textSize);
  const setPreference = useAppearance((s) => s.setPreference);
  const current = String(toTextSize(textSize)) as TextSizeValue;
  return (
    <SettingsSection title="Tamaño de texto" description="Ajusta la lectura sin cambiar el diseño." inline>
      <SegmentedChoice
        label="Tamaño de texto"
        value={current}
        options={TEXT_SIZE_OPTIONS}
        onChange={(next) => {
          // The store applies the size at once and saves after `TEXT_SIZE_DEBOUNCE_MS` (the only debounce).
          const size = toTextSize(Number(next));
          if (size !== textSize) void setPreference({ textSize: size }, { section: "tamano-texto" });
        }}
      />
      <SectionError section="tamano-texto" />
    </SettingsSection>
  );
}

// ── Densidad ────────────────────────────────────────────────────────────────

export function AparienciaDensidadSection() {
  const density = useAppearance((s) => s.preferences.density);
  const setPreference = useAppearance((s) => s.setPreference);
  return (
    <SettingsSection title="Densidad" description="Compacta muestra más filas en la misma pantalla." inline>
      <SegmentedChoice
        label="Densidad"
        value={density}
        options={DENSITY_OPTIONS}
        onChange={(next) => void setPreference({ density: next }, { section: "densidad" })}
      />
      <SectionError section="densidad" />
    </SettingsSection>
  );
}
