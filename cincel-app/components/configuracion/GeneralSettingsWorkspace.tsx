"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import { PrimaryColorPicker } from "@/components/configuracion/PrimaryColorPicker";
import type { AppearanceState } from "@/lib/actions/app-settings-actions";
import {
  buildDefaultGeneralSettings,
  type GeneralSettings,
  GENERAL_SETTINGS_STORAGE_KEY,
  loadGeneralSettings,
  restoreDefaultGeneralSettings,
  saveGeneralSettings,
} from "@/lib/settings/general-settings";
import { APP_VERSION } from "@/lib/version";

function loadImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";

      if (!result) {
        reject(new Error("No se pudo leer la imagen seleccionada."));
        return;
      }

      resolve(result);
    };

    reader.onerror = () =>
      reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

interface GeneralSettingsWorkspaceProps {
  appearance: AppearanceState;
}

export default function GeneralSettingsWorkspace({ appearance }: GeneralSettingsWorkspaceProps) {
  const defaultSettings = useMemo(() => buildDefaultGeneralSettings(), []);
  const initialState = useMemo(() => loadGeneralSettings(), []);

  const [settings, setSettings] = useState<GeneralSettings>(
    initialState.settings,
  );
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(
    initialState.hasCustom,
  );
  // What's stored now — "Guardar cambios" enables on any difference from it.
  const [savedSettings, setSavedSettings] = useState<GeneralSettings>(
    initialState.settings,
  );

  useEffect(() => {
    const refresh = () => {
      const loaded = loadGeneralSettings();
      setSettings(loaded.settings);
      setSavedSettings(loaded.settings);
      setHasCustomConfig(loaded.hasCustom);
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(settings) !== JSON.stringify(savedSettings);
  }, [savedSettings, settings]);

  const updateCompanyField = <TKey extends keyof GeneralSettings["company"]>(
    key: TKey,
    value: GeneralSettings["company"][TKey],
  ) => {
    setSettings((current) => ({
      ...current,
      company: {
        ...current.company,
        [key]: value,
      },
    }));
  };

  const updateRegionalField = <TKey extends keyof GeneralSettings["regional"]>(
    key: TKey,
    value: GeneralSettings["regional"][TKey],
  ) => {
    setSettings((current) => ({
      ...current,
      regional: {
        ...current.regional,
        [key]: value,
      },
    }));
  };

  const updateAppearanceField = <
    TKey extends keyof GeneralSettings["appearance"],
  >(
    key: TKey,
    value: GeneralSettings["appearance"][TKey],
  ) => {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        [key]: value,
      },
    }));
  };

  const handleLogoUpload = async (
    scope: "company" | "appearance",
    field: "logoUrl" | "systemLogoUrl",
    file: File | null,
  ) => {
    if (!file) {
      return;
    }

    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      window.alert("Solo se permiten imágenes PNG o JPG.");
      return;
    }

    try {
      const dataUrl = await loadImageAsDataUrl(file);

      if (scope === "company" && field === "logoUrl") {
        updateCompanyField("logoUrl", dataUrl);
        return;
      }

      if (scope === "appearance" && field === "systemLogoUrl") {
        updateAppearanceField("systemLogoUrl", dataUrl);
      }
    } catch {
      window.alert("No se pudo cargar la imagen. Intenta de nuevo.");
    }
  };

  const updateSystemField = <TKey extends keyof GeneralSettings["system"]>(
    key: TKey,
    value: GeneralSettings["system"][TKey],
  ) => {
    setSettings((current) => ({
      ...current,
      system: {
        ...current.system,
        [key]: value,
      },
    }));
  };

  const saveChanges = () => {
    saveGeneralSettings(settings);
    setSavedSettings(settings);
    setHasCustomConfig(true);
  };

  const restoreDefaults = () => {
    restoreDefaultGeneralSettings();
    setSettings(defaultSettings);
    setSavedSettings(defaultSettings);
    setHasCustomConfig(false);
  };

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h1 className="text-3xl font-bold text-foreground">General</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Administra la configuración base de la empresa y del sistema.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Editor de configuración general
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajusta la información principal de la empresa y del sistema.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fuente actual:{" "}
                  {hasCustomConfig
                    ? "Configuración personalizada"
                    : "Valores por defecto"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clave de persistencia: {GENERAL_SETTINGS_STORAGE_KEY}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto px-3 py-2 text-xs"
                  onClick={restoreDefaults}
                  disabled={!hasCustomConfig}
                >
                  Restaurar configuración por defecto
                </Button>
                <Button
                  size="sm"
                  className="h-auto px-3 py-2 text-xs"
                  onClick={saveChanges}
                  disabled={!isDirty}
                >
                  Guardar cambios
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-border bg-muted p-4 lg:col-span-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Información de la empresa
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Datos principales utilizados en documentos, contacto y
                  cabecera.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Nombre de la empresa
                    </span>
                    <Input
                      type="text"
                      value={settings.company.legalName}
                      onChange={(event) =>
                        updateCompanyField("legalName", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Nombre comercial
                    </span>
                    <Input
                      type="text"
                      value={settings.company.tradeName}
                      onChange={(event) =>
                        updateCompanyField("tradeName", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Correo principal
                    </span>
                    <Input
                      type="email"
                      value={settings.company.primaryEmail}
                      onChange={(event) =>
                        updateCompanyField("primaryEmail", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Teléfono
                    </span>
                    <Input
                      type="text"
                      value={settings.company.phone}
                      onChange={(event) =>
                        updateCompanyField("phone", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Sitio web
                    </span>
                    <Input
                      type="url"
                      value={settings.company.website}
                      onChange={(event) =>
                        updateCompanyField("website", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      RFC (opcional)
                    </span>
                    <Input
                      type="text"
                      value={settings.company.rfc}
                      onChange={(event) =>
                        updateCompanyField("rfc", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Dirección
                    </span>
                    <Input
                      type="text"
                      value={settings.company.address}
                      onChange={(event) =>
                        updateCompanyField("address", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Logotipo de la empresa
                    </span>
                    <Input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) =>
                        handleLogoUpload(
                          "company",
                          "logoUrl",
                          event.target.files?.[0] ?? null,
                        )
                      }
                      className="file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground hover:file:bg-accent"
                    />
                    {settings.company.logoUrl ? (
                      <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                        <Image
                          src={settings.company.logoUrl}
                          alt="Vista previa del logotipo de la empresa"
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 rounded-md object-contain"
                        />
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Imagen cargada
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            PNG o JPG guardado en la configuración.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </label>
                </div>
              </article>

              <article className="rounded-xl border border-border bg-muted p-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Configuración regional
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estructura preparada para soportar más opciones regionales en
                  próximas versiones.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Idioma
                    </span>
                    <Select
                      items={{ "es-MX": "Español (México)" }}
                      value={settings.regional.language}
                      onValueChange={(value) =>
                        updateRegionalField(
                          "language",
                          value as GeneralSettings["regional"]["language"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es-MX">Español (México)</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Zona horaria
                    </span>
                    <Select
                      value={settings.regional.timeZone}
                      onValueChange={(value) =>
                        updateRegionalField(
                          "timeZone",
                          value as GeneralSettings["regional"]["timeZone"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Mexico_City">
                          America/Mexico_City
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Formato de fecha
                    </span>
                    <Select
                      value={settings.regional.dateFormat}
                      onValueChange={(value) =>
                        updateRegionalField(
                          "dateFormat",
                          value as GeneralSettings["regional"]["dateFormat"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Primer día de la semana
                    </span>
                    <Select
                      items={{ monday: "Lunes" }}
                      value={settings.regional.weekStartsOn}
                      onValueChange={(value) =>
                        updateRegionalField(
                          "weekStartsOn",
                          value as GeneralSettings["regional"]["weekStartsOn"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Lunes</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </article>

              <article className="rounded-xl border border-border bg-muted p-4">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Apariencia
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Logo y color principal del sistema.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Logo del sistema
                    </span>
                    <Input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) =>
                        handleLogoUpload(
                          "appearance",
                          "systemLogoUrl",
                          event.target.files?.[0] ?? null,
                        )
                      }
                      className="file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground hover:file:bg-accent"
                    />
                    {settings.appearance.systemLogoUrl ? (
                      <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                        <Image
                          src={settings.appearance.systemLogoUrl}
                          alt="Vista previa del logo del sistema"
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 rounded-md object-contain"
                        />
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Imagen cargada
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            PNG o JPG guardado en la configuración.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </label>

                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Color principal
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Paleta de Tailwind. Se guarda al elegirlo y aplica a toda la empresa.
                    </p>
                    <PrimaryColorPicker value={appearance.primaryColor} canManage={appearance.canManage} />
                  </div>
                </div>
              </article>

              <article className="rounded-xl border border-border bg-muted p-4 lg:col-span-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Información del sistema
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Controla metadatos visibles del ERP para la operación diaria.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Nombre del sistema
                    </span>
                    <Input
                      type="text"
                      value={settings.system.systemName}
                      onChange={(event) =>
                        updateSystemField("systemName", event.target.value)
                      }
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Versión
                    </span>
                    {/* A release build carries its own version, so it isn't editable there. */}
                    <Input
                      type="text"
                      value={APP_VERSION ? `v${APP_VERSION}` : settings.system.version}
                      disabled={Boolean(APP_VERSION)}
                      onChange={(event) =>
                        updateSystemField("version", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted">
                  <p className="text-sm text-foreground">
                    Mostrar versión en la interfaz
                  </p>
                  <Switch
                    checked={Boolean(settings.system.showVersionInInterface)}
                    onCheckedChange={(checked) =>
                      updateSystemField("showVersionInInterface", checked)
                    }
                  />
                </label>
              </article>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
