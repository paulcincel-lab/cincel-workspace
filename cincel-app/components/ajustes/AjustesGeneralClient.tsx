"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRef, type ReactNode } from "react";

import { AdminPageHeading, Field, FieldGrid, errorId, hintId } from "@/components/ajustes/AdminFields";
import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import { useGeneralSettingsEditor, useSavedGeneralSettings, type LogoScope } from "@/components/configuracion/use-general-settings-editor";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { ajustesGeneralOptions } from "@/lib/query/options/ajustes";
import { formatGeneralSettingsSavedAt, type GeneralSettings } from "@/lib/settings/general-settings";
import type { HeaderLinkErrors } from "@/lib/settings/header-links";
import { GeneralFormStoreProvider } from "@/lib/stores/ajustes/general-form-store";
import { APP_VERSION } from "@/lib/version";

export type AjustesGeneralClientProps = {
  /** The visible registry sections of the page (`settingsSectionsFor("general", user)`). */
  children?: ReactNode;
};

type Regional = GeneralSettings["regional"];

/** Select options of "Región y formatos" (value → label). */
export const LANGUAGE_ITEMS: Record<Regional["language"], string> = { "es-MX": "Español (México)" };
export const TIME_ZONE_ITEMS: Record<Regional["timeZone"], string> = { "America/Mexico_City": "America/Mexico_City" };
export const DATE_FORMAT_ITEMS: Record<Regional["dateFormat"], string> = {
  "d MMM yyyy": "9 nov 2026",
  "dd/MM/yyyy": "09/11/2026",
};
export const WEEK_START_ITEMS: Record<Regional["weekStartsOn"], string> = { monday: "Lunes", sunday: "Domingo" };

/** The link fields of "Enlaces del despacho" (control id per error key), in the order focus visits them. */
const LINK_FIELDS: readonly { key: keyof HeaderLinkErrors; id: string }[] = [
  { key: "website", id: "general-website" },
  { key: "instagramUrl", id: "general-instagramUrl" },
  { key: "contactEmail", id: "general-contactEmail" },
];

/**
 * Ajustes › General (canvas `Ajustes-General`): admin heading, then
 * Organización (fields and logos), Sistema, Región y formatos, the registry
 * sections of the page (the avatar-menu links) and the sticky save bar with
 * the count of changed fields. One layout for every presentation style.
 *
 * The saved settings are `qk.org.general()` (seeded by the root layout) and
 * the capability flags `qk.ajustes.page('general')` (hydrated by the page):
 * nothing is fetched on mount. The draft lives in a page-scoped store shared
 * with the registry sections.
 */
export function AjustesGeneralClient({ children }: AjustesGeneralClientProps) {
  const general = useSavedGeneralSettings();
  return (
    <GeneralFormStoreProvider initial={general.settings}>
      <AjustesGeneralForm>{children}</AjustesGeneralForm>
    </GeneralFormStoreProvider>
  );
}

/** Preview tile (64 px, radius 10 px, `--muted`) + title + hint + "Cambiar" / "Quitar". */
function LogoField({
  id,
  title,
  hint,
  src,
  previewLabel,
  error,
  disabled,
  onPick,
  onRemove,
}: {
  id: string;
  title: string;
  hint: string;
  src: string;
  previewLabel: string;
  error: string | null;
  disabled: boolean;
  onPick(file: File | null): void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div data-slot="logo-field" className="flex min-w-0 items-start gap-3">
      <div
        role="img"
        aria-label={previewLabel}
        className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted"
      >
        {src ? <Image src={src} alt="" width={64} height={64} unoptimized className="max-h-12 w-auto object-contain" /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id} className="text-[13px] font-medium text-sidebar-foreground">
          {title}
        </Label>
        <p id={hintId(id)} className="text-xs text-muted-foreground">
          {hint}
        </p>
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          aria-describedby={error ? errorId(id) : hintId(id)}
          onChange={(event) => {
            onPick(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
            Cambiar
          </Button>
          {onRemove ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || !src} onClick={onRemove}>
              Quitar
            </Button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId(id)} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RegionSelect<V extends string>({
  id,
  label,
  items,
  value,
  disabled,
  mono = false,
  onChange,
}: {
  id: string;
  label: string;
  items: Record<V, string>;
  value: V;
  disabled: boolean;
  mono?: boolean;
  onChange(value: V): void;
}) {
  const options = Object.entries(items) as [V, string][];
  return (
    <Field htmlFor={id} label={label}>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const match = options.find(([key]) => key === next);
          if (match) onChange(match[0]);
        }}
      >
        <SelectTrigger id={id} className={mono ? "w-full font-mono" : "w-full"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function AjustesGeneralForm({ children }: { children?: ReactNode }) {
  const {
    data: { canManage, canManageAppearance },
  } = useSuspenseQuery(ajustesGeneralOptions());
  const {
    settings,
    savedAt,
    dirtyCount,
    pending,
    error,
    logoError,
    pickedUpLegacy,
    linkErrors,
    updateCompanyField,
    updateRegionalField,
    updateSystemField,
    handleLogoUpload,
    saveChanges,
    discardChanges,
  } = useGeneralSettingsEditor({ canManage, headerLinks: true });
  const disabled = !canManage;

  const companyText = (
    key: "legalName" | "tradeName" | "primaryEmail" | "phone" | "rfc" | "address",
    label: string,
    options: { type?: string; full?: boolean; mono?: boolean } = {},
  ) => {
    const id = `general-${key}`;
    return (
      <Field htmlFor={id} label={label} full={options.full}>
        <Input
          id={id}
          type={options.type ?? "text"}
          value={settings.company[key]}
          disabled={disabled}
          className={options.mono ? "h-9 font-mono uppercase" : "h-9"}
          onChange={(event) =>
            updateCompanyField(key, options.mono ? event.target.value.toUpperCase() : event.target.value)
          }
        />
      </Field>
    );
  };

  const logoErrorOf = (scope: LogoScope) => (logoError?.scope === scope ? logoError.message : null);

  /** A wrong link blocks the save and takes the focus to the first invalid field. */
  function save() {
    const firstInvalid = LINK_FIELDS.find(({ key }) => linkErrors[key]);
    if (firstInvalid) {
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }
    saveChanges();
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeading title="General" description="Datos del despacho que se usan en toda la aplicación.">
        {savedAt ? <p className="text-xs text-muted-foreground">{formatGeneralSettingsSavedAt(savedAt)}</p> : null}
        {pickedUpLegacy ? (
          <p className="text-xs text-muted-foreground">
            Se cargó la configuración guardada en este navegador. Guarda los cambios para compartirla con todo el
            equipo.
          </p>
        ) : null}
      </AdminPageHeading>

      <SettingsSection title="Organización" level={3}>
        <FieldGrid>
          {companyText("legalName", "Nombre de la empresa")}
          {companyText("tradeName", "Nombre comercial")}
          {companyText("rfc", "RFC (opcional)", { mono: true })}
          {companyText("phone", "Teléfono", { type: "tel" })}
          {companyText("primaryEmail", "Correo principal", { type: "email" })}
          {companyText("address", "Dirección", { full: true })}
        </FieldGrid>
        <FieldGrid>
          <LogoField
            id="general-logoUrl"
            title="Logotipo de la empresa"
            hint="PNG o JPG. Se usa en documentos y en el portal de clientes."
            src={settings.company.logoUrl}
            previewLabel="Vista previa del logotipo de la empresa"
            error={logoErrorOf("company")}
            disabled={disabled}
            onPick={(file) => void handleLogoUpload("company", "logoUrl", file)}
            onRemove={() => updateCompanyField("logoUrl", "")}
          />
          <LogoField
            id="general-systemLogoUrl"
            title="Logo del sistema"
            hint="PNG o JPG. Se muestra en el menú lateral."
            src={settings.appearance.systemLogoUrl}
            previewLabel="Vista previa del logo del sistema"
            error={logoErrorOf("appearance")}
            disabled={disabled}
            onPick={(file) => void handleLogoUpload("appearance", "systemLogoUrl", file)}
          />
        </FieldGrid>
      </SettingsSection>

      <SettingsSection title="Sistema" level={3}>
        <FieldGrid>
          <Field htmlFor="general-systemName" label="Nombre del sistema">
            <Input
              id="general-systemName"
              type="text"
              className="h-9"
              value={settings.system.systemName}
              disabled={disabled}
              onChange={(event) => updateSystemField("systemName", event.target.value)}
            />
          </Field>
          <Field htmlFor="general-version" label="Versión">
            {/* The build carries its own version; nobody edits it here. */}
            <Input
              id="general-version"
              type="text"
              readOnly
              className="h-9 font-mono"
              value={APP_VERSION ? `v${APP_VERSION}` : settings.system.version}
            />
          </Field>
        </FieldGrid>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label htmlFor="general-showVersion" className="text-[13px] font-medium text-sidebar-foreground">
            Mostrar versión en la interfaz
          </Label>
          <Switch
            id="general-showVersion"
            checked={Boolean(settings.system.showVersionInInterface)}
            disabled={disabled}
            onCheckedChange={(checked) => updateSystemField("showVersionInInterface", checked)}
          />
        </div>
        {canManageAppearance ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            Colores y tipografía: el tema de la organización se edita en Tema y estilo.
            <Link href="/ajustes/tema" className="font-medium text-secondary-foreground underline-offset-4 hover:underline">
              Abrir Tema y estilo →
            </Link>
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Región y formatos" level={3}>
        <FieldGrid>
          <RegionSelect
            id="general-language"
            label="Idioma"
            items={LANGUAGE_ITEMS}
            value={settings.regional.language}
            disabled={disabled}
            onChange={(value) => updateRegionalField("language", value)}
          />
          <RegionSelect
            id="general-timeZone"
            label="Zona horaria"
            items={TIME_ZONE_ITEMS}
            value={settings.regional.timeZone}
            disabled={disabled}
            mono
            onChange={(value) => updateRegionalField("timeZone", value)}
          />
          <RegionSelect
            id="general-dateFormat"
            label="Formato de fecha"
            items={DATE_FORMAT_ITEMS}
            value={settings.regional.dateFormat}
            disabled={disabled}
            onChange={(value) => updateRegionalField("dateFormat", value)}
          />
          <RegionSelect
            id="general-weekStartsOn"
            label="Primer día de la semana"
            items={WEEK_START_ITEMS}
            value={settings.regional.weekStartsOn}
            disabled={disabled}
            onChange={(value) => updateRegionalField("weekStartsOn", value)}
          />
        </FieldGrid>
      </SettingsSection>

      {children}

      {canManage ? (
        <SettingsSaveBar
          dirtyCount={dirtyCount}
          saving={pending}
          onDiscard={discardChanges}
          onSave={save}
          saveLabel="Guardar cambios"
          error={error}
        />
      ) : null}
    </div>
  );
}
