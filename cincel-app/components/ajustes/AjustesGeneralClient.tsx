"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { GeneralSettingsEditorContext } from "@/components/ajustes/general-settings-editor-context";
import { useGeneralSettingsEditor } from "@/components/configuracion/use-general-settings-editor";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  formatGeneralSettingsSavedAt,
  type GeneralSettings,
  type LoadedGeneralSettings,
} from "@/lib/settings/general-settings";
import { APP_VERSION } from "@/lib/version";

export type AjustesGeneralClientProps = {
  general: LoadedGeneralSettings;
  /** `canManageGeneralSettings` of the viewer (the segment guard already requires it). */
  canManage: boolean;
  /** `canManageAppearance`: shows the link to Ajustes › Tema y estilo. */
  canManageAppearance: boolean;
  /** The visible registry sections of the page (`settingsSectionsFor("general", user)`). */
  children?: ReactNode;
};

function LogoPreview({ src, alt }: { src: string; alt: string }) {
  if (!src) return null;
  return <Image src={src} alt={alt} width={48} height={48} unoptimized className="size-12 rounded-md object-contain" />;
}

/**
 * Ajustes › General (redesign FE §3.8, frame `AjustesGeneral`): the existing
 * General settings on `SettingsSection` / `SettingsRow`, plus the registry
 * sections of the page (the avatar-menu links). One "Guardar cambios" saves
 * every field through `saveGeneralSettingsAction`.
 */
export function AjustesGeneralClient({ general, canManage, canManageAppearance, children }: AjustesGeneralClientProps) {
  const editor = useGeneralSettingsEditor({ general, canManage, headerLinks: true });
  const {
    settings,
    savedAt,
    hasCustomConfig,
    isDirty,
    pending,
    error,
    logoError,
    pickedUpLegacy,
    hasLinkErrors,
    updateCompanyField,
    updateRegionalField,
    updateSystemField,
    handleLogoUpload,
    saveChanges,
    restoreDefaults,
  } = editor;

  const companyText = (key: "legalName" | "tradeName" | "primaryEmail" | "phone" | "rfc" | "address", type = "text") => (
    <Input
      id={`general-${key}`}
      type={type}
      value={settings.company[key]}
      disabled={!canManage}
      onChange={(event) => updateCompanyField(key, event.target.value)}
    />
  );

  return (
    <GeneralSettingsEditorContext.Provider value={editor}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            General
            <Badge variant="secondary">Admin</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">Datos del despacho que se usan en toda la aplicación.</p>
          {savedAt ? <p className="text-xs text-muted-foreground">{formatGeneralSettingsSavedAt(savedAt)}</p> : null}
          {pickedUpLegacy ? (
            <p className="text-xs text-muted-foreground">
              Se cargó la configuración guardada en este navegador. Guarda los cambios para compartirla con todo el
              equipo.
            </p>
          ) : null}
        </div>

        <SettingsSection title="Logo">
          <SettingsRow
            label="Logotipo de la empresa"
            description="PNG o JPG. Se usa en documentos y en el portal de clientes."
            htmlFor="general-logoUrl"
            control={
              <div className="flex items-center gap-3">
                <LogoPreview src={settings.company.logoUrl} alt="Vista previa del logotipo de la empresa" />
                <Input
                  id="general-logoUrl"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={!canManage}
                  aria-describedby={logoError?.scope === "company" ? "general-logoUrl-error" : undefined}
                  onChange={(event) => handleLogoUpload("company", "logoUrl", event.target.files?.[0] ?? null)}
                />
                {logoError?.scope === "company" ? (
                  <p id="general-logoUrl-error" role="alert" className="text-xs text-destructive">
                    {logoError.message}
                  </p>
                ) : null}
              </div>
            }
          />
          <SettingsRow
            label="Logo del sistema"
            description="PNG o JPG. Se muestra en el menú lateral."
            htmlFor="general-systemLogoUrl"
            control={
              <div className="flex items-center gap-3">
                <LogoPreview src={settings.appearance.systemLogoUrl} alt="Vista previa del logo del sistema" />
                <Input
                  id="general-systemLogoUrl"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={!canManage}
                  aria-describedby={logoError?.scope === "appearance" ? "general-systemLogoUrl-error" : undefined}
                  onChange={(event) => handleLogoUpload("appearance", "systemLogoUrl", event.target.files?.[0] ?? null)}
                />
                {logoError?.scope === "appearance" ? (
                  <p id="general-systemLogoUrl-error" role="alert" className="text-xs text-destructive">
                    {logoError.message}
                  </p>
                ) : null}
              </div>
            }
          />
        </SettingsSection>

        <SettingsSection title="Organización">
          <SettingsRow label="Nombre de la empresa" htmlFor="general-legalName" control={companyText("legalName")} />
          <SettingsRow label="Nombre comercial" htmlFor="general-tradeName" control={companyText("tradeName")} />
          <SettingsRow
            label="Correo principal"
            htmlFor="general-primaryEmail"
            control={companyText("primaryEmail", "email")}
          />
          <SettingsRow label="Teléfono" htmlFor="general-phone" control={companyText("phone")} />
          <SettingsRow label="RFC (opcional)" htmlFor="general-rfc" control={companyText("rfc")} />
          <SettingsRow label="Dirección" htmlFor="general-address" control={companyText("address")} />
        </SettingsSection>

        <SettingsSection title="Región y formatos">
          <SettingsRow
            label="Idioma"
            htmlFor="general-language"
            control={
              <Select
                items={{ "es-MX": "Español (México)" }}
                value={settings.regional.language}
                disabled={!canManage}
                onValueChange={(value) =>
                  updateRegionalField("language", value as GeneralSettings["regional"]["language"])
                }
              >
                <SelectTrigger id="general-language" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es-MX">Español (México)</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label="Zona horaria"
            htmlFor="general-timeZone"
            control={
              <Select
                value={settings.regional.timeZone}
                disabled={!canManage}
                onValueChange={(value) =>
                  updateRegionalField("timeZone", value as GeneralSettings["regional"]["timeZone"])
                }
              >
                <SelectTrigger id="general-timeZone" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Mexico_City">America/Mexico_City</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label="Formato de fecha"
            htmlFor="general-dateFormat"
            control={
              <Select
                value={settings.regional.dateFormat}
                disabled={!canManage}
                onValueChange={(value) =>
                  updateRegionalField("dateFormat", value as GeneralSettings["regional"]["dateFormat"])
                }
              >
                <SelectTrigger id="general-dateFormat" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label="Primer día de la semana"
            htmlFor="general-weekStartsOn"
            control={
              <Select
                items={{ monday: "Lunes" }}
                value={settings.regional.weekStartsOn}
                disabled={!canManage}
                onValueChange={(value) =>
                  updateRegionalField("weekStartsOn", value as GeneralSettings["regional"]["weekStartsOn"])
                }
              >
                <SelectTrigger id="general-weekStartsOn" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Lunes</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </SettingsSection>

        <SettingsSection title="Sistema">
          <SettingsRow
            label="Nombre del sistema"
            htmlFor="general-systemName"
            control={
              <Input
                id="general-systemName"
                type="text"
                value={settings.system.systemName}
                disabled={!canManage}
                onChange={(event) => updateSystemField("systemName", event.target.value)}
              />
            }
          />
          <SettingsRow
            label="Versión"
            htmlFor="general-version"
            control={
              // A release build carries its own version, so it isn't editable there.
              <Input
                id="general-version"
                type="text"
                value={APP_VERSION ? `v${APP_VERSION}` : settings.system.version}
                disabled={!canManage || Boolean(APP_VERSION)}
                onChange={(event) => updateSystemField("version", event.target.value)}
              />
            }
          />
          <SettingsRow
            label="Mostrar versión en la interfaz"
            htmlFor="general-showVersion"
            control={
              <Switch
                id="general-showVersion"
                checked={Boolean(settings.system.showVersionInInterface)}
                disabled={!canManage}
                onCheckedChange={(checked) => updateSystemField("showVersionInInterface", checked)}
              />
            }
          />
          {canManageAppearance ? (
            <SettingsRow
              label="Colores y tipografía"
              description="El tema de la organización se edita en Tema y estilo."
              control={
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/ajustes/tema" />}>
                  Abrir Tema y estilo
                </Button>
              }
            />
          ) : null}
        </SettingsSection>

        {children}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={restoreDefaults} disabled={!canManage || pending || !hasCustomConfig}>
            Restaurar configuración por defecto
          </Button>
          <Button onClick={saveChanges} disabled={!canManage || pending || !isDirty || hasLinkErrors}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </GeneralSettingsEditorContext.Provider>
  );
}
