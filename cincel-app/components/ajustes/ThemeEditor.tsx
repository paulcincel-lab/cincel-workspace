"use client";

import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import type { StoreApi } from "zustand";

import { ContrastBadge } from "@/components/ajustes/ContrastBadge";
import { TokenRow } from "@/components/ajustes/TokenRow";
import { TypeScaleRow } from "@/components/ajustes/TypeScaleRow";
import { FormDialog } from "@/components/patterns/FormDialog";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { resetOrgAppearanceAction, saveOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { IMPLEMENTED } from "@/lib/actions/org-appearance-actions.flags";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesTemaOptions, type AjustesTemaPageData } from "@/lib/query/options/ajustes";
import {
  applyAppearanceToDocument,
  useAppearanceStoreApiOrNull,
  type AppearanceState,
} from "@/lib/stores/appearance-store";
import type { OrgAppearance, ThemeId, TokenName, TypeRole } from "@/lib/types/redesign";
import { toCssVars } from "@/lib/ui/appearance-css";
import { resolveAppearance } from "@/lib/ui/preferences";
import {
  applyPreset,
  contrastResults,
  EDIT_MODE_LABELS,
  failingRows,
  FONT_FAMILIES,
  matchesPreset,
  SHADOW_LABELS,
  STYLE_CARDS,
  textPairs,
  TOKEN_SECTIONS,
  TYPE_ROLE_LABELS,
  type EditMode,
} from "@/lib/ui/theme-editor";
import { THEME_CSS_FILENAME, themeCss } from "@/lib/ui/theme-export";
import { chartTintCss, type ChartSlot } from "@/lib/ui/tints";
import { SHAPE_BOUNDS, THEME_IDS, THEME_LABELS, TYPE_SCALE_BOUNDS } from "@/lib/ui/themes";

export type ThemeEditorProps = { presets: Record<ThemeId, OrgAppearance> };

const LOW_CONTRAST_HINT_ID = "theme-low-contrast";
const FONT_ITEMS = Object.fromEntries(FONT_FAMILIES.map((f) => [f, f]));
const SHADOWS = Object.keys(SHADOW_LABELS) as OrgAppearance["shape"]["shadow"][];
const EDIT_MODES: readonly EditMode[] = ["light", "dark"];

/** Download a text file in the browser. */
function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The viewer's appearance after the organization published `org`: the
 * `useAppearance` store (org part: `fixedByOrg`, the resolved tokens) and the
 * `<html>` attributes and `<style id="appearance">`, at once. The root layout
 * re-render that follows the action's `revalidatePath('/','layout')` confirms
 * it with the server's version.
 */
export function applyPublishedOrgAppearance(store: StoreApi<AppearanceState> | null, org: OrgAppearance): void {
  if (!store) return;
  const { appearance, preferences } = store.getState();
  const next = { ...resolveAppearance(org, preferences), version: appearance.version + 1 };
  store.setState({ fixedByOrg: !org.allowUserOverride, overridesAllowed: org.allowUserOverride });
  store.getState().applyServer(next);
  applyAppearanceToDocument(next, true);
}

/**
 * Ajustes › Tema y estilo (redesign FE §3.8): org theme editor with "Partir
 * de" presets, token / type / shape rows, a sticky live preview of the draft
 * and `ContrastBadge`. "Publicar para todos" stays disabled while any pair of
 * `CONTRAST_PAIRS` fails in either mode; failing rows are marked.
 *
 * The published theme is `qk.ajustes.page('tema')` (hydrated by the page);
 * the draft is local. Publish and reset write the result into that key and
 * into the appearance store, with no `router.refresh()`.
 */
export function ThemeEditor({ presets }: ThemeEditorProps) {
  const published = useSuspenseQuery(ajustesTemaOptions()).data.org;
  const appearanceStore = useAppearanceStoreApiOrNull();
  const [draft, setDraft] = useState<OrgAppearance>(() => published);
  const [mode, setMode] = useState<EditMode>("light");
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const writePublished = (qc: QueryClient, org: OrgAppearance) => {
    qc.setQueryData<AjustesTemaPageData>(qk.ajustes.page("tema"), { org });
    applyPublishedOrgAppearance(appearanceStore, org);
  };
  const publishMutation = useActionMutation(saveOrgAppearanceAction, {
    setData: (qc, saved) => writePublished(qc, saved),
    onFormError: setError,
    successToast: "Tema publicado para todos",
  });
  const resetMutation = useActionMutation(resetOrgAppearanceAction, {
    setData: (qc, next) => writePublished(qc, next),
    onFormError: setResetError,
    successToast: "Tema restablecido",
  });
  const publishing = publishMutation.isPending;
  const resetPending = resetMutation.isPending;

  const results = useMemo(() => contrastResults(draft.tokens), [draft.tokens]);
  const failingCount = { light: results.light.filter((r) => !r.ok).length, dark: results.dark.filter((r) => !r.ok).length };
  const anyFailing = failingCount.light + failingCount.dark > 0;
  const rowMessages = useMemo(() => failingRows(results[mode]), [results, mode]);
  const badgePairs = useMemo(() => textPairs(draft.tokens, mode), [draft.tokens, mode]);
  const otherMode: EditMode = mode === "light" ? "dark" : "light";
  const dirty = JSON.stringify(draft) !== JSON.stringify(published);

  function update(patch: Partial<OrgAppearance>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function setToken(name: TokenName, value: string) {
    setDraft((d) => ({ ...d, tokens: { ...d.tokens, [name]: { ...d.tokens[name], [mode]: value } } }));
  }

  function setType(role: TypeRole, value: OrgAppearance["typeScale"][TypeRole]) {
    setDraft((d) => ({ ...d, typeScale: { ...d.typeScale, [role]: value } }));
  }

  function setShape(patch: Partial<OrgAppearance["shape"]>) {
    setDraft((d) => ({ ...d, shape: { ...d.shape, ...patch } }));
  }

  function publish() {
    setError(null);
    publishMutation.mutate(draft, { onSuccess: (saved) => setDraft(saved) });
  }

  async function reset() {
    setResetError(null);
    try {
      const next = await resetMutation.mutateAsync(draft.baseTheme);
      setDraft(next);
      setResetOpen(false);
      setError(null);
    } catch {
      // The copy is already in the dialog (`onFormError`).
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tema de la organización"
        description="Colores, tipografía y forma para todos. Cada usuario puede elegir otro tema solo para sí."
        breadcrumb={[{ label: "Ajustes", href: "/ajustes" }, { label: "Tema de la organización" }]}
        badge={<Badge variant="secondary">Admin</Badge>}
        actions={
          <>
            {IMPLEMENTED.resetOrgAppearanceAction ? (
              <Button variant="outline" onClick={() => setResetOpen(true)} disabled={publishing}>
                Restablecer
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => downloadText(THEME_CSS_FILENAME, themeCss(draft), "text/css")}>
              Exportar CSS
            </Button>
            {IMPLEMENTED.saveOrgAppearanceAction ? (
              <Button
                onClick={publish}
                disabled={anyFailing || publishing}
                aria-describedby={anyFailing ? LOW_CONTRAST_HINT_ID : undefined}
              >
                {publishing ? "Publicando…" : "Publicar para todos"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Partir de un tema">
        <span className="text-sm text-muted-foreground">Partir de:</span>
        {THEME_IDS.map((id) => (
          <Button
            key={id}
            variant="outline"
            size="sm"
            aria-pressed={matchesPreset(draft, presets, id)}
            onClick={() => setDraft((d) => applyPreset(d, presets[id]))}
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-full border border-border"
              style={{ backgroundColor: presets[id].tokens.primary.light }}
            />
            {THEME_LABELS[id]}
          </Button>
        ))}
        {dirty ? <span className="text-xs text-muted-foreground">Cambios sin publicar</span> : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {anyFailing ? (
        <Alert variant="destructive" id={LOW_CONTRAST_HINT_ID}>
          <AlertDescription>
            {actionErrorText("LOW_CONTRAST")}
            {failingCount[otherMode] > 0 ? ` También hay colores marcados en el modo ${EDIT_MODE_LABELS[otherMode]}.` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <SettingsSection title="Estilo de la organización" description="El estilo con que todos ven los datos, salvo que elijan otro.">
            <RadioGroup
              aria-label="Estilo de presentación"
              value={draft.styleDefault}
              onValueChange={(v) => {
                const card = STYLE_CARDS.find((c) => c.value === v);
                if (card) update({ styleDefault: card.value });
              }}
              className="grid gap-3 sm:grid-cols-3"
            >
              {STYLE_CARDS.map((card) => (
                <Label
                  key={card.value}
                  htmlFor={`style-${card.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <RadioGroupItem id={`style-${card.value}`} value={card.value} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{card.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{card.description}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allow-user-override"
                  checked={draft.allowUserOverride}
                  onCheckedChange={(checked) => update({ allowUserOverride: checked === true })}
                />
                <Label htmlFor="allow-user-override">Permitir que cada persona elija su estilo y tema</Label>
              </div>
            </div>
          </SettingsSection>

          <div className="flex flex-wrap items-center gap-3">
            <span id="edit-mode-label" className="text-sm font-medium">
              Modo que editas
            </span>
            <RadioGroup
              aria-labelledby="edit-mode-label"
              value={mode}
              onValueChange={(v) => {
                if (v === "light" || v === "dark") setMode(v);
              }}
              className="flex gap-4"
            >
              {EDIT_MODES.map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <RadioGroupItem id={`edit-mode-${m}`} value={m} />
                  <Label htmlFor={`edit-mode-${m}`}>
                    {EDIT_MODE_LABELS[m]}
                    {failingCount[m] > 0 ? <span className="sr-only"> (con colores marcados)</span> : null}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {TOKEN_SECTIONS.map((section) => (
            <SettingsSection key={section.title} title={section.title}>
              {section.tokens.map((token) => (
                <TokenRow
                  key={`${mode}-${token.name}`}
                  name={token.name}
                  label={token.label}
                  value={draft.tokens[token.name][mode]}
                  onChange={(value) => setToken(token.name, value)}
                  invalid={rowMessages.get(token.name)}
                />
              ))}
            </SettingsSection>
          ))}

          <SettingsSection title="Tipografía">
            <SettingsRow
              label="Familia"
              htmlFor="font-family"
              control={
                <Select
                  items={FONT_ITEMS}
                  value={draft.fontFamily}
                  onValueChange={(v) => {
                    const font = FONT_FAMILIES.find((f) => f === v);
                    if (font) update({ fontFamily: font });
                  }}
                >
                  <SelectTrigger id="font-family" aria-label="Familia" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            {TYPE_ROLE_LABELS.map(({ role, label }) => (
              <TypeScaleRow
                key={role}
                role={role}
                label={label}
                value={draft.typeScale[role]}
                min={TYPE_SCALE_BOUNDS[role].min}
                max={TYPE_SCALE_BOUNDS[role].max}
                onChange={(v) => setType(role, v)}
              />
            ))}
          </SettingsSection>

          <SettingsSection title="Forma y espacio">
            <ShapeRow
              id="shape-radius"
              label="Radio de tarjetas"
              value={draft.shape.radius}
              bounds={SHAPE_BOUNDS.radius}
              onChange={(radius) => setShape({ radius })}
            />
            <ShapeRow
              id="shape-card-padding"
              label="Relleno de tarjetas"
              value={draft.shape.cardPadding}
              bounds={SHAPE_BOUNDS.cardPadding}
              onChange={(cardPadding) => setShape({ cardPadding })}
            />
            <ShapeRow
              id="shape-gap"
              label="Separación"
              value={draft.shape.gap}
              bounds={SHAPE_BOUNDS.gap}
              onChange={(gap) => setShape({ gap })}
            />
            <SettingsRow
              label="Sombra de tarjetas"
              control={
                <RadioGroup
                  aria-label="Sombra de tarjetas"
                  value={draft.shape.shadow}
                  onValueChange={(v) => {
                    const shadow = SHADOWS.find((s) => s === v);
                    if (shadow) setShape({ shadow });
                  }}
                  className="flex gap-4"
                >
                  {SHADOWS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <RadioGroupItem id={`shadow-${s}`} value={s} />
                      <Label htmlFor={`shadow-${s}`}>{SHADOW_LABELS[s]}</Label>
                    </div>
                  ))}
                </RadioGroup>
              }
            />
          </SettingsSection>
        </div>

        <aside aria-label="Vista previa en vivo" className="space-y-3 self-start lg:sticky lg:top-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Vista previa en vivo</h2>
            <span className="text-xs text-muted-foreground">
              así lo verá todo el equipo · {EDIT_MODE_LABELS[mode]}
            </span>
          </div>
          <ThemePreview draft={draft} mode={mode} />
          <ContrastBadge pairs={badgePairs} />
        </aside>
      </div>

      <FormDialog
        title="¿Restablecer el tema?"
        description={`Los colores, la tipografía y la forma vuelven a los valores de ${THEME_LABELS[draft.baseTheme]} para todos. El estilo y las opciones de la organización se conservan.`}
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetError(null);
        }}
        onSubmit={reset}
        submitLabel="Restablecer"
        pending={resetPending}
        error={resetError}
      >
        <p className="text-sm text-muted-foreground">Los cambios sin publicar se pierden.</p>
      </FormDialog>
    </div>
  );
}

function ShapeRow({
  id,
  label,
  value,
  bounds,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  bounds: { min: number; max: number };
  onChange(v: number): void;
}) {
  return (
    <SettingsRow
      label={label}
      htmlFor={id}
      control={
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={value}
            aria-valuetext={`${value} px`}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-36 accent-primary"
          />
          <span className="w-12 text-right font-mono text-sm tabular-nums">{value}px</span>
        </div>
      }
    />
  );
}

const PREVIEW_NAV = ["Inicio", "Mi espacio", "Tareas", "Proyectos", "Personas"] as const;

const PREVIEW_ATTENTION: readonly { title: string; tag: string; slot: ChartSlot | null }[] = [
  { title: "Revisar acabados", tag: "Construcción", slot: 3 },
  { title: "Producción de renders", tag: "Diseño", slot: 2 },
  { title: "Contrato firmado", tag: "Vencida", slot: null },
];

/**
 * A mini app painted only with the draft: the draft's CSS variables are set on
 * the preview root, so every token utility inside resolves to the draft value
 * of the mode being edited. Non-interactive (no focusable elements).
 */
function ThemePreview({ draft, mode }: { draft: OrgAppearance; mode: EditMode }) {
  const vars = useMemo(() => toCssVars(draft, mode), [draft, mode]);
  const type = (role: TypeRole): CSSProperties => ({
    fontSize: `${draft.typeScale[role].size}px`,
    fontWeight: draft.typeScale[role].weight,
  });
  const card: CSSProperties = {
    padding: `${draft.shape.cardPadding}px`,
    boxShadow: "var(--shadow-card)",
  };

  return (
    <div
      data-testid="theme-preview"
      data-mode={mode}
      className={`${mode === "dark" ? "dark " : ""}overflow-hidden rounded-lg border border-border bg-background text-foreground`}
      style={{ ...(vars as CSSProperties), fontFamily: "var(--font-sans)" }}
    >
      <div className="flex min-h-80">
        <div className="flex w-28 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
          <span className="mb-2 text-xs font-semibold tracking-wide">CINCEL</span>
          {PREVIEW_NAV.map((item, i) => (
            <span
              key={item}
              className={
                i === 0
                  ? "rounded-md bg-sidebar-primary px-2 py-1 text-xs text-sidebar-primary-foreground"
                  : "px-2 py-1 text-xs"
              }
            >
              {item}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: `${draft.shape.gap}px`, padding: `${draft.shape.gap}px` }}>
          <span style={type("pageTitle")}>Buenos días</span>
          <div className="grid grid-cols-2" style={{ gap: `${draft.shape.gap}px` }}>
            {[
              { label: "Proyectos activos", value: "2" },
              { label: "Tareas vencidas", value: "0" },
            ].map((kpi) => (
              <div key={kpi.label} className="flex flex-col rounded-lg border border-border bg-card text-card-foreground" style={card}>
                <span className="text-muted-foreground" style={type("label")}>
                  {kpi.label}
                </span>
                <span style={type("kpi")}>{kpi.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card text-card-foreground" style={card}>
            <span style={type("cardTitle")}>Requiere atención</span>
            {PREVIEW_ATTENTION.map((row) => (
              <div key={row.title} className="flex items-center justify-between gap-2" style={type("body")}>
                <span className="truncate">{row.title}</span>
                <span
                  className={row.slot ? "rounded-full px-2 py-0.5" : "rounded-full px-2 py-0.5 text-destructive"}
                  style={{
                    ...type("label"),
                    ...(row.slot
                      ? { backgroundColor: chartTintCss(row.slot, mode), color: `var(--chart-${row.slot}-ink)` }
                      : { backgroundColor: "var(--muted)" }),
                  }}
                >
                  {row.tag}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2" style={type("body")}>
            <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Nueva tarea</span>
            <span className="rounded-md bg-secondary px-3 py-1.5 text-secondary-foreground">Secundario</span>
            <span className="rounded-md border border-border bg-background px-3 py-1.5">Outline</span>
            <span className="rounded-md border border-border px-3 py-1.5 ring-2 ring-ring">Foco</span>
          </div>
        </div>
      </div>
    </div>
  );
}
