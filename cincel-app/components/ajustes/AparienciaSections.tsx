"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, type CSSProperties } from "react";
import { LayoutGrid, Table2, TextAlignStart, type LucideIcon } from "lucide-react";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Badge } from "@/components/ui/shadcn/badge";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Slider } from "@/components/ui/shadcn/slider";
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
 * The sections of Ajustes › Apariencia (redesign FE §3.8), registered in
 * `lib/shell/settings-sections/apariencia/*`. The caller's preferences,
 * errors and the override lock come from the `useAppearance` store (one
 * primitive selector per field); the org appearance and the admin flag from
 * the hydrated `qk.ajustes.page('apariencia')`. Every change goes through
 * `setPreference(patch, { section })`: optimistic, rolled back on error, and
 * the text size is debounced once, in the store.
 */

export const TEXT_SIZE_MIN = 13;
export const TEXT_SIZE_MAX = 16;
export const TEXT_SIZE_STEP = 0.5;

/** Snap a slider value to the allowed text sizes (13–16, step 0.5). */
export function toTextSize(value: number): TextSize {
  const clamped = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, value));
  return (Math.round(clamped / TEXT_SIZE_STEP) * TEXT_SIZE_STEP) as TextSize;
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

const STYLE_OPTIONS: { value: PresentationStyle; label: string; description: string; icon: LucideIcon }[] = [
  { value: "visual", label: "Visual", description: "Gráficas grandes, donas, anillos y color por tramo.", icon: LayoutGrid },
  { value: "esencial", label: "Esencial", description: "Solo números, texto y listas. Sin gráficas.", icon: TextAlignStart },
  { value: "analitico", label: "Analítico", description: "Tablas densas con variaciones y desvíos.", icon: Table2 },
];

const STYLE_NAMES: Record<PresentationStyle, string> = { visual: "Visual", esencial: "Esencial", analitico: "Analítico" };

/** One-line description under each theme card (canvas `Ajustes`). */
const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  azul: "Gris azulado, tarjetas blancas con sombra suave y azul de acción.",
  calido: "Piedra, tinta café y colores de obra: arcilla, malva, ocre, azul piedra.",
  grafito: "Blanco y negro como cincel.mx. El color queda solo en los datos.",
};

const MODE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "comoda", label: "Cómoda" },
  { value: "compacta", label: "Compacta" },
];

/** Card-shaped radio item: focus ring and checked border on the whole card. */
const CARD_CLASS =
  "flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-data-[checked]:border-primary has-data-[disabled]:cursor-not-allowed has-data-[disabled]:opacity-60";

/** Segmented radio item (Modo, Densidad). */
const SEGMENT_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-data-[checked]:border-primary";

function SectionError({ section }: { section: AparienciaSectionKey }) {
  const message = useAppearance((s) => s.errors[section]);
  return (
    <p role="status" aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message ?? ""}
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
] as const satisfies readonly TokenName[];

/** The org's own tokens for its base theme (it may have customized them), else the preset. */
function themeTokens(id: ThemeId, org: OrgAppearance): OrgAppearance["tokens"] {
  return id === org.baseTheme ? org.tokens : THEME_PRESETS[id].tokens;
}

/**
 * Mini app preview of one theme. The theme's light and dark values are scoped
 * custom properties of this element only; the `.dark` class on `<html>`
 * picks which set shows.
 */
function ThemeMiniPreview({ tokens }: { tokens: OrgAppearance["tokens"] }) {
  const vars: Record<string, string> = {};
  for (const name of PREVIEW_TOKENS) {
    vars[`--pv-${name}`] = tokens[name].light;
    vars[`--pv-${name}-d`] = tokens[name].dark;
  }
  return (
    <div
      aria-hidden="true"
      style={vars as CSSProperties}
      className="flex h-20 overflow-hidden rounded-lg border border-(--pv-border) bg-(--pv-background) dark:border-(--pv-border-d) dark:bg-(--pv-background-d)"
    >
      <div className="flex w-7 flex-col gap-1 bg-(--pv-sidebar) p-1.5 dark:bg-(--pv-sidebar-d)">
        <span className="h-1.5 rounded-full bg-(--pv-primary) dark:bg-(--pv-primary-d)" />
        <span className="h-1.5 rounded-full bg-(--pv-muted-foreground) opacity-50 dark:bg-(--pv-muted-foreground-d)" />
        <span className="h-1.5 rounded-full bg-(--pv-muted-foreground) opacity-50 dark:bg-(--pv-muted-foreground-d)" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-2 w-2/3 rounded-full bg-(--pv-foreground) dark:bg-(--pv-foreground-d)" />
        <div className="flex flex-1 flex-col justify-between rounded-md border border-(--pv-border) bg-(--pv-card) p-1.5 dark:border-(--pv-border-d) dark:bg-(--pv-card-d)">
          <span className="h-1.5 w-1/2 rounded-full bg-(--pv-muted-foreground) dark:bg-(--pv-muted-foreground-d)" />
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-(--pv-chart-1) dark:bg-(--pv-chart-1-d)" />
            <span className="size-2 rounded-full bg-(--pv-chart-2) dark:bg-(--pv-chart-2-d)" />
            <span className="size-2 rounded-full bg-(--pv-chart-3) dark:bg-(--pv-chart-3-d)" />
            <span className="ml-auto h-2 w-6 rounded-full bg-(--pv-primary) dark:bg-(--pv-primary-d)" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AparienciaTemaSection() {
  const { org, isAdmin } = useAparienciaPageData();
  const overridesAllowed = useOverridesAllowed();
  const ownTheme = useAppearance((s) => s.preferences.theme);
  const setPreference = useAppearance((s) => s.setPreference);
  const noteId = useId();
  const selected: ThemeId = overridesAllowed ? (ownTheme ?? org.baseTheme) : org.baseTheme;
  const orgName = THEME_LABELS[org.baseTheme];

  return (
    <SettingsSection title="Tema">
      <div className="flex flex-col gap-3">
        <RadioGroup
          aria-label="Tema"
          aria-describedby={noteId}
          value={selected}
          disabled={!overridesAllowed}
          onValueChange={(value) => {
            const theme = value as ThemeId;
            // Picking the org's theme follows the org (null), so a later org change reaches this user.
            void setPreference({ theme: theme === org.baseTheme ? null : theme }, { section: "tema" });
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {THEME_IDS.map((id) => (
            <label key={id} className={CARD_CLASS}>
              <ThemeMiniPreview tokens={themeTokens(id, org)} />
              <span className="flex items-center gap-2">
                <RadioGroupItem value={id} aria-labelledby={`${noteId}-${id}-name`} />
                <span id={`${noteId}-${id}-name`} className="text-sm font-medium">
                  {THEME_LABELS[id]}
                </span>
                {id === org.baseTheme ? (
                  <Badge variant="secondary" className="ml-auto">
                    Organización
                  </Badge>
                ) : null}
              </span>
              <span className="text-sm text-muted-foreground">{THEME_DESCRIPTIONS[id]}</span>
            </label>
          ))}
        </RadioGroup>
        <p id={noteId} className="text-sm text-muted-foreground">
          {overridesAllowed
            ? `El tema de la organización es ${orgName}. Puedes usar otro solo para ti.`
            : OVERRIDE_LOCKED_COPY}
        </p>
        {isAdmin ? (
          <Link href="/ajustes/tema" className={cn(buttonVariants({ variant: "link", size: "sm" }), "self-start px-0")}>
            Editar tema de la organización
          </Link>
        ) : null}
        <SectionError section="tema" />
      </div>
    </SettingsSection>
  );
}

// ── Estilo de presentación ──────────────────────────────────────────────────

export function AparienciaEstiloSection() {
  const { org } = useAparienciaPageData();
  const overridesAllowed = useOverridesAllowed();
  const ownStyle = useAppearance((s) => s.preferences.style);
  const setPreference = useAppearance((s) => s.setPreference);
  const noteId = useId();
  const selected: PresentationStyle = overridesAllowed ? (ownStyle ?? org.styleDefault) : org.styleDefault;

  return (
    <SettingsSection
      title="Estilo de presentación"
      description={`Cambia cómo se muestran los datos en todas las vistas: gráficas, listas o tablas. La organización usa ${STYLE_NAMES[org.styleDefault]}.`}
    >
      <div className="flex flex-col gap-3">
        <RadioGroup
          aria-label="Estilo de presentación"
          aria-describedby={overridesAllowed ? undefined : noteId}
          value={selected}
          disabled={!overridesAllowed}
          onValueChange={(value) => {
            const next = value as PresentationStyle;
            void setPreference({ style: next === org.styleDefault ? null : next }, { section: "estilo" });
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {STYLE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const descriptionId = `${noteId}-${option.value}`;
            return (
              <label key={option.value} className={CARD_CLASS}>
                <span className="flex items-center gap-2">
                  <RadioGroupItem
                    value={option.value}
                    aria-labelledby={`${descriptionId}-name`}
                    aria-describedby={descriptionId}
                  />
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.8} />
                  <span id={`${descriptionId}-name`} className="text-sm font-medium">
                    {option.label}
                  </span>
                </span>
                <span id={descriptionId} className="text-sm text-muted-foreground">
                  {option.description}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        {overridesAllowed ? null : (
          <p id={noteId} className="text-sm text-muted-foreground">
            {OVERRIDE_LOCKED_COPY}
          </p>
        )}
        <SectionError section="estilo" />
      </div>
    </SettingsSection>
  );
}

// ── Modo / Densidad ─────────────────────────────────────────────────────────

function SegmentedRadio<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  const nameId = useId();
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => (
        <label key={option.value} className={SEGMENT_CLASS}>
          <RadioGroupItem value={option.value} aria-labelledby={`${nameId}-${option.value}`} />
          <span id={`${nameId}-${option.value}`}>{option.label}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

export function AparienciaModoSection() {
  const mode = useAppearance((s) => s.preferences.mode);
  const setPreference = useAppearance((s) => s.setPreference);
  return (
    <SettingsSection title="Modo" description="Sistema sigue la configuración de tu dispositivo.">
      <div className="flex flex-col gap-2">
        <SegmentedRadio
          label="Modo"
          value={mode}
          options={MODE_OPTIONS}
          onChange={(next) => void setPreference({ mode: next }, { section: "modo" })}
        />
        <SectionError section="modo" />
      </div>
    </SettingsSection>
  );
}

export function AparienciaDensidadSection() {
  const density = useAppearance((s) => s.preferences.density);
  const setPreference = useAppearance((s) => s.setPreference);
  return (
    <SettingsSection title="Densidad" description="Compacta muestra más filas en la misma pantalla.">
      <div className="flex flex-col gap-2">
        <SegmentedRadio
          label="Densidad"
          value={density}
          options={DENSITY_OPTIONS}
          onChange={(next) => void setPreference({ density: next }, { section: "densidad" })}
        />
        <SectionError section="densidad" />
      </div>
    </SettingsSection>
  );
}

// ── Tamaño de texto ─────────────────────────────────────────────────────────

function formatSize(size: number): string {
  return `${size.toLocaleString("es-MX", { maximumFractionDigits: 1 })} px`;
}

export function AparienciaTamanoTextoSection() {
  const textSize = useAppearance((s) => s.preferences.textSize);
  const setPreference = useAppearance((s) => s.setPreference);
  // The store applies each value at once and saves after `TEXT_SIZE_DEBOUNCE_MS` (the only debounce).
  const changeTextSize = (value: number) => {
    const size = toTextSize(value);
    if (size !== textSize) void setPreference({ textSize: size }, { section: "tamano-texto" });
  };
  return (
    <SettingsSection title="Tamaño de texto">
      <div className="flex flex-col gap-2">
        <SettingsRow
          label="Tamaño de texto"
          description="Cambia el texto de las listas y tarjetas; los títulos no cambian."
          control={
            <div className="flex w-full min-w-48 items-center gap-3 sm:w-64">
              <Slider
                thumbLabel="Tamaño de texto"
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                step={TEXT_SIZE_STEP}
                value={textSize}
                onValueChange={(value) => changeTextSize(Array.isArray(value) ? value[0] : (value as number))}
              />
              <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{formatSize(textSize)}</span>
            </div>
          }
        />
        <SectionError section="tamano-texto" />
      </div>
    </SettingsSection>
  );
}
