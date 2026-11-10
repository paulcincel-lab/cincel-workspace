"use client";

import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { StoreApi } from "zustand";

import { AdminPageHeading } from "@/components/ajustes/AdminFields";
import { STYLE_DESCRIPTIONS, STYLE_NAMES, StyleSchematic } from "@/components/ajustes/AparienciaSections";
import { ChoiceCards, SegmentedChoice, type ChoiceCardOption } from "@/components/ajustes/ChoiceCards";
import { ContrastBadge } from "@/components/ajustes/ContrastBadge";
import { TokenRow } from "@/components/ajustes/TokenRow";
import { TYPE_SCALE_GRID, TypeScaleRow } from "@/components/ajustes/TypeScaleRow";
import { FormDialog } from "@/components/patterns/FormDialog";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Slider } from "@/components/ui/shadcn/slider";
import { Switch } from "@/components/ui/shadcn/switch";
import { resetOrgAppearanceAction, saveOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { IMPLEMENTED } from "@/lib/actions/org-appearance-actions.flags";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesTemaOptions, type AjustesTemaPageData } from "@/lib/query/options/ajustes";
import {
  applyAppearanceToDocument,
  useAppearanceStoreApiOrNull,
  type AppearanceState,
} from "@/lib/stores/appearance-store";
import type { OrgAppearance, PresentationStyle, ThemeId, TokenName, TypeRole } from "@/lib/types/redesign";
import { toCssVars } from "@/lib/ui/appearance-css";
import { resolveAppearance } from "@/lib/ui/preferences";
import {
  applyPreset,
  contrastResults,
  EDIT_MODE_LABELS,
  failingColorCount,
  failingColorsText,
  failingRows,
  FONT_FAMILIES,
  INTERFAZ_VISIBLE,
  matchesPreset,
  publishLowContrastQuestion,
  SHADOW_LABELS,
  STYLE_CARDS,
  textPairs,
  tokenContrast,
  TOKEN_SECTIONS,
  TYPE_ROLE_LABELS,
  type EditMode,
} from "@/lib/ui/theme-editor";
import { THEME_CSS_FILENAME, themeCss } from "@/lib/ui/theme-export";
import { chartTintCss, type ChartSlot } from "@/lib/ui/tints";
import { SHAPE_BOUNDS, THEME_IDS, THEME_LABELS, TYPE_SCALE_BOUNDS } from "@/lib/ui/themes";

export type ThemeEditorProps = { presets: Record<ThemeId, OrgAppearance> };

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

/** "¿Partir de {tema}?" confirmation title. */
export function presetConfirmTitle(id: ThemeId): string {
  return `¿Partir de ${THEME_LABELS[id]}?`;
}

/** Left text of the save bar: "Cambios sin publicar", then the failing colors (in `--destructive`) when there are any. */
function SaveBarStatus({ dirty, failing }: { dirty: boolean; failing: number }) {
  if (!dirty && failing === 0) return null;
  return (
    <>
      {dirty ? "Cambios sin publicar" : null}
      {dirty && failing > 0 ? " · " : null}
      {failing > 0 ? <span className="text-destructive">{failingColorsText(failing)}</span> : null}
    </>
  );
}

/**
 * Ajustes › Tema y estilo (canvas `Ajustes-Tema`): the org theme editor.
 * Editor column ("Partir de" presets, color sections with contrast badges,
 * Tipografía, Forma y espacio, Estilo de la organización) and a sticky live
 * preview of the draft (`<aside aria-label="Vista previa">`, below the editor
 * under 1024 px), then the save bar. Publishing with colors under their
 * `CONTRAST_PAIRS` minimum asks first. One layout for every style.
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
  const [pendingPreset, setPendingPreset] = useState<ThemeId | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showAllInterfaz, setShowAllInterfaz] = useState(false);
  const interfazId = useId();

  const writePublished = (qc: QueryClient, org: OrgAppearance) => {
    qc.setQueryData<AjustesTemaPageData>(qk.ajustes.page("tema"), { org });
    applyPublishedOrgAppearance(appearanceStore, org);
  };
  const publishMutation = useActionMutation(
    (vars: { org: OrgAppearance; acceptLowContrast: boolean }) =>
      saveOrgAppearanceAction(vars.org, { acceptLowContrast: vars.acceptLowContrast }),
    {
      setData: (qc, saved) => writePublished(qc, saved),
      onFormError: setError,
      successToast: "Tema publicado para todos",
    },
  );
  const resetMutation = useActionMutation(resetOrgAppearanceAction, {
    setData: (qc, next) => writePublished(qc, next),
    onFormError: setResetError,
    successToast: "Tema restablecido",
  });
  const publishing = publishMutation.isPending;
  const resetPending = resetMutation.isPending;

  const results = useMemo(() => contrastResults(draft.tokens), [draft.tokens]);
  const failing = failingColorCount(results);
  const rowMessages = useMemo(() => failingRows(results[mode]), [results, mode]);
  const badgePairs = useMemo(() => textPairs(draft.tokens, mode), [draft.tokens, mode]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(published);
  const matched = THEME_IDS.find((id) => matchesPreset(draft, presets, id)) ?? null;

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

  /** "Partir de": straight away on a clean draft; with unsaved changes, after "¿Partir de {tema}?". */
  function choosePreset(id: ThemeId) {
    if (dirty) setPendingPreset(id);
    else setDraft((d) => applyPreset(d, presets[id]));
  }

  function publish(acceptLowContrast: boolean) {
    setError(null);
    setConfirmPublish(false);
    publishMutation.mutate({ org: draft, acceptLowContrast }, { onSuccess: (saved) => setDraft(saved) });
  }

  function requestPublish() {
    if (!dirty || publishing) return;
    if (failing > 0) setConfirmPublish(true);
    else publish(false);
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

  const styleOptions: ChoiceCardOption<PresentationStyle>[] = STYLE_CARDS.map((card) => ({
    value: card.value,
    title: STYLE_NAMES[card.value],
    description: STYLE_DESCRIPTIONS[card.value],
    preview: <StyleSchematic style={card.value} />,
  }));

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeading
        title="Tema de la organización"
        description="Colores, tipografía y forma para todos. Cada usuario puede elegir otro tema solo para sí."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Partir de:</span>
            <RadioGroupPrimitive
              aria-label="Partir de un tema"
              value={matched ?? ""}
              onValueChange={(next) => {
                const id = THEME_IDS.find((t) => t === next);
                if (id) choosePreset(id);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              {THEME_IDS.map((id) => (
                <RadioPrimitive.Root
                  key={id}
                  value={id}
                  data-slot="preset-pill"
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-sidebar-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-secondary data-[checked]:text-secondary-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full border border-border"
                    style={{ backgroundColor: presets[id].tokens.primary.light }}
                  />
                  {THEME_LABELS[id]}
                </RadioPrimitive.Root>
              ))}
            </RadioGroupPrimitive>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium text-sidebar-foreground">Modo que editas</span>
            <SegmentedChoice<EditMode>
              label="Modo que editas"
              value={mode}
              options={EDIT_MODES.map((m) => ({ value: m, label: EDIT_MODE_LABELS[m] }))}
              onChange={setMode}
            />
          </div>

          {TOKEN_SECTIONS.map((section, index) => {
            const isInterfaz = index === 0;
            const tokens = isInterfaz && !showAllInterfaz ? section.tokens.slice(0, INTERFAZ_VISIBLE) : section.tokens;
            return (
              <SettingsSection
                key={section.title}
                title={section.title}
                level={3}
                actions={
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tracking-wider text-sidebar-foreground">
                    {section.tokens.length} COLORES
                  </span>
                }
              >
                <div id={isInterfaz ? interfazId : undefined} className="flex flex-col">
                  {tokens.map((token) => (
                    <TokenRow
                      key={`${mode}-${token.name}`}
                      name={token.name}
                      label={token.label}
                      value={draft.tokens[token.name][mode]}
                      onChange={(value) => setToken(token.name, value)}
                      invalid={rowMessages.get(token.name)}
                      contrast={tokenContrast(results[mode], token.name)}
                    />
                  ))}
                </div>
                {isInterfaz && section.tokens.length > INTERFAZ_VISIBLE ? (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-expanded={showAllInterfaz}
                      aria-controls={interfazId}
                      onClick={() => setShowAllInterfaz((v) => !v)}
                    >
                      {showAllInterfaz ? "Ver menos colores" : `Ver los ${section.tokens.length} colores`}
                    </Button>
                  </div>
                ) : null}
              </SettingsSection>
            );
          })}

          <SettingsSection title="Tipografía" level={3}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="font-family" className="text-[13px] font-medium text-sidebar-foreground">
                Familia
              </Label>
              <Select
                items={FONT_ITEMS}
                value={draft.fontFamily}
                onValueChange={(v) => {
                  const font = FONT_FAMILIES.find((f) => f === v);
                  if (font) update({ fontFamily: font });
                }}
              >
                <SelectTrigger id="font-family" className="w-full sm:w-56">
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
            </div>
            <div className="flex flex-col gap-1.5">
              <div aria-hidden="true" className={`${TYPE_SCALE_GRID} font-mono text-[11px] tracking-wider text-muted-foreground`}>
                <span>ROL</span>
                <span>TAMAÑO</span>
                <span>PESO</span>
              </div>
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
            </div>
          </SettingsSection>

          <SettingsSection title="Forma y espacio" level={3}>
            <ShapeSlider
              label="Radio de tarjetas"
              value={draft.shape.radius}
              bounds={SHAPE_BOUNDS.radius}
              onChange={(radius) => setShape({ radius })}
            />
            <ShapeSlider
              label="Relleno de tarjetas"
              value={draft.shape.cardPadding}
              bounds={SHAPE_BOUNDS.cardPadding}
              onChange={(cardPadding) => setShape({ cardPadding })}
            />
            <ShapeSlider
              label="Separación"
              value={draft.shape.gap}
              bounds={SHAPE_BOUNDS.gap}
              onChange={(gap) => setShape({ gap })}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-sidebar-foreground">Sombra de tarjetas</span>
              <SegmentedChoice
                label="Sombra de tarjetas"
                value={draft.shape.shadow}
                options={SHADOWS.map((s) => ({ value: s, label: SHADOW_LABELS[s] }))}
                onChange={(shadow) => setShape({ shadow })}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Estilo de la organización"
            description="El estilo con que todos ven los datos, salvo que elijan otro."
            level={3}
          >
            <ChoiceCards
              label="Estilo de la organización"
              value={draft.styleDefault}
              options={styleOptions}
              onChange={(styleDefault) => update({ styleDefault })}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="allow-user-override" className="text-[13px] font-medium text-sidebar-foreground">
                Permitir que cada persona elija su estilo y tema
              </Label>
              <Switch
                id="allow-user-override"
                checked={draft.allowUserOverride}
                onCheckedChange={(checked) => update({ allowUserOverride: checked })}
              />
            </div>
          </SettingsSection>
        </div>

        <aside
          aria-label="Vista previa"
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:min-w-[280px] lg:flex-[0_1_340px]"
        >
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">VISTA PREVIA</span>
          <ThemePreview draft={draft} mode={mode} />
          <ContrastBadge pairs={badgePairs} />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => downloadText(THEME_CSS_FILENAME, themeCss(draft), "text/css")}
            >
              Exportar CSS
            </Button>
          </div>
        </aside>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        data-slot="settings-save-bar"
        className="sticky bottom-4 z-10 flex w-full flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3 shadow-md"
      >
        <p role="status" aria-live="polite" className="text-[13px] text-sidebar-foreground">
          <SaveBarStatus dirty={dirty} failing={failing} />
        </p>
        <div className="flex items-center gap-2">
          {IMPLEMENTED.resetOrgAppearanceAction ? (
            <Button type="button" variant="outline" onClick={() => setResetOpen(true)} disabled={publishing}>
              Restablecer
            </Button>
          ) : null}
          {IMPLEMENTED.saveOrgAppearanceAction ? (
            <Button
              type="button"
              aria-disabled={!dirty || publishing || undefined}
              aria-busy={publishing || undefined}
              className="aria-disabled:opacity-50"
              onClick={requestPublish}
            >
              {publishing ? (
                <>
                  <Loader2Icon aria-hidden="true" data-icon="inline-start" className="spin" />
                  Publicando…
                </>
              ) : (
                "Publicar para todos"
              )}
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pendingPreset !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPreset(null);
        }}
        title={pendingPreset ? presetConfirmTitle(pendingPreset) : ""}
        description="Se pierden los cambios sin publicar."
        confirmLabel={pendingPreset ? `Partir de ${THEME_LABELS[pendingPreset]}` : ""}
        onConfirm={() => {
          const id = pendingPreset;
          setPendingPreset(null);
          if (id) setDraft((d) => applyPreset(d, presets[id]));
        }}
      />

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="¿Publicar de todos modos?"
        description={publishLowContrastQuestion(failing)}
        confirmLabel="Publicar"
        cancelLabel="Revisar"
        onConfirm={() => publish(true)}
      />

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

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** One "Forma y espacio" slider: label, `Slider` within the bounds and the value in Geist Mono ("14 px"). */
function ShapeSlider({
  label,
  value,
  bounds,
  onChange,
}: {
  label: string;
  value: number;
  bounds: { min: number; max: number };
  onChange(v: number): void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
      <span className="col-span-2 text-[13px] font-medium text-sidebar-foreground sm:col-span-1">{label}</span>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={1}
        value={value}
        thumbLabel={label}
        onValueChange={(next) => onChange(typeof next === "number" ? next : (next[0] ?? value))}
      />
      <span className="w-14 text-right font-mono text-[13px] tabular-nums text-foreground">{value} px</span>
    </div>
  );
}

const PREVIEW_NAV = ["Inicio", "Mi espacio", "Tareas", "Proyectos", "Personas"] as const;

const PREVIEW_TASKS: readonly { title: string; tag: string; slot: ChartSlot | null }[] = [
  { title: "Contrato firmado", tag: "Presale", slot: 1 },
  { title: "Producción de renders", tag: "Diseño", slot: 2 },
  { title: "Permiso de obra", tag: "Requiere atención", slot: null },
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
    borderRadius: `${draft.shape.radius}px`,
    boxShadow: "var(--shadow-card)",
  };

  return (
    <div
      data-testid="theme-preview"
      data-mode={mode}
      className={`${mode === "dark" ? "dark " : ""}overflow-hidden rounded-[14px] border border-border bg-background text-foreground`}
      style={{ ...(vars as CSSProperties), fontFamily: "var(--font-sans)" }}
    >
      <div className="flex min-h-80">
        <div className="flex w-24 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-2.5 text-sidebar-foreground">
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
              { label: "Proyectos activos", value: "12" },
              { label: "Tareas vencidas", value: "7" },
            ].map((kpi) => (
              <div key={kpi.label} className="flex min-w-0 flex-col border border-border bg-card text-card-foreground" style={card}>
                <span className="text-muted-foreground" style={type("label")}>
                  {kpi.label}
                </span>
                <span style={type("kpi")}>{kpi.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border border-border bg-card text-card-foreground" style={card}>
            {PREVIEW_TASKS.map((row) => (
              <div key={row.title} className="flex items-center justify-between gap-2" style={type("body")}>
                <span className="truncate">{row.title}</span>
                <span
                  className={row.slot ? "shrink-0 rounded-full px-2 py-0.5" : "shrink-0 rounded-full px-2 py-0.5 text-destructive"}
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
          </div>
        </div>
      </div>
    </div>
  );
}
