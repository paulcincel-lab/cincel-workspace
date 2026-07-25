"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import {
  buildDefaultGeneralSettings,
  type GeneralSettings,
  GENERAL_SETTINGS_STORAGE_KEY,
  loadGeneralSettings,
  restoreDefaultGeneralSettings,
  saveGeneralSettings,
} from "@/lib/settings/general-settings";

const CONFIG_NAV_ITEMS: Array<{ key: string; label: string; href?: string; enabled: boolean }> = [
  { key: "permisos", label: "Permisos", href: "/configuracion/permisos", enabled: true },
  { key: "general", label: "General", href: "/configuracion/general", enabled: true },
  { key: "catalogos", label: "Catalogos", enabled: false },
  { key: "seguridad", label: "Seguridad", enabled: false },
  { key: "integraciones", label: "Integraciones", enabled: false },
  { key: "api-webhooks", label: "API / Webhooks", enabled: false },
  { key: "notificaciones", label: "Notificaciones", enabled: false },
];

function toggleClasses(enabled: boolean): string {
  if (enabled) {
    return "bg-emerald-500 border-emerald-500";
  }

  return "bg-slate-300 border-slate-300";
}

export default function GeneralSettingsWorkspace() {
  const defaultSettings = useMemo(() => buildDefaultGeneralSettings(), []);
  const initialState = useMemo(() => loadGeneralSettings(), []);

  const [settings, setSettings] = useState<GeneralSettings>(initialState.settings);
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(initialState.hasCustom);

  useEffect(() => {
    const refresh = () => {
      const loaded = loadGeneralSettings();
      setSettings(loaded.settings);
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
    return JSON.stringify(settings) !== JSON.stringify(defaultSettings);
  }, [defaultSettings, settings]);

  const updateCompanyField = <TKey extends keyof GeneralSettings["company"]>(key: TKey, value: GeneralSettings["company"][TKey]) => {
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

  const updateAppearanceField = <TKey extends keyof GeneralSettings["appearance"]>(
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

  const updateSystemField = <TKey extends keyof GeneralSettings["system"]>(key: TKey, value: GeneralSettings["system"][TKey]) => {
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
    setHasCustomConfig(true);
  };

  const restoreDefaults = () => {
    restoreDefaultGeneralSettings();
    setSettings(defaultSettings);
    setHasCustomConfig(false);
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Configuracion</h2>
            <nav className="mt-4 space-y-1.5">
              {CONFIG_NAV_ITEMS.map((item) => {
                const isGeneral = item.key === "general";

                if (item.enabled && item.href) {
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${isGeneral ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-400"
                  >
                    {item.label}
                    <span className="ml-2 text-xs text-slate-400">Proximamente</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-3xl font-bold text-slate-900">General</h1>
              <p className="mt-2 text-sm text-slate-600">Administra la configuración base de la empresa y del sistema.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Editor de configuración general</h2>
                  <p className="mt-1 text-sm text-slate-600">Ajusta la información principal de la empresa y del sistema.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Fuente actual: {hasCustomConfig ? "Configuración personalizada" : "Valores por defecto"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Clave de persistencia: {GENERAL_SETTINGS_STORAGE_KEY}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={restoreDefaults}
                    disabled={!hasCustomConfig}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${hasCustomConfig ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                  >
                    Restaurar configuración por defecto
                  </button>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={!isDirty}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${!isDirty ? "cursor-not-allowed bg-slate-300" : "bg-blue-600 hover:bg-blue-700"}`}
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">Información de la empresa</h3>
                  <p className="mt-1 text-xs text-slate-500">Datos principales utilizados en documentos, contacto y cabecera.</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Nombre de la empresa</span>
                      <input
                        type="text"
                        value={settings.company.legalName}
                        onChange={(event) => updateCompanyField("legalName", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Nombre comercial</span>
                      <input
                        type="text"
                        value={settings.company.tradeName}
                        onChange={(event) => updateCompanyField("tradeName", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Correo principal</span>
                      <input
                        type="email"
                        value={settings.company.primaryEmail}
                        onChange={(event) => updateCompanyField("primaryEmail", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Teléfono</span>
                      <input
                        type="text"
                        value={settings.company.phone}
                        onChange={(event) => updateCompanyField("phone", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Sitio web</span>
                      <input
                        type="url"
                        value={settings.company.website}
                        onChange={(event) => updateCompanyField("website", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">RFC (opcional)</span>
                      <input
                        type="text"
                        value={settings.company.rfc}
                        onChange={(event) => updateCompanyField("rfc", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">Dirección</span>
                      <input
                        type="text"
                        value={settings.company.address}
                        onChange={(event) => updateCompanyField("address", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-medium text-slate-600">Logotipo de la empresa (URL)</span>
                      <input
                        type="text"
                        value={settings.company.logoUrl}
                        onChange={(event) => updateCompanyField("logoUrl", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">Configuración regional</h3>
                  <p className="mt-1 text-xs text-slate-500">Estructura preparada para soportar más opciones regionales en próximas versiones.</p>

                  <div className="mt-4 space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Idioma</span>
                      <select
                        value={settings.regional.language}
                        onChange={(event) => updateRegionalField("language", event.target.value as GeneralSettings["regional"]["language"])}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="es-MX">Español (México)</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Zona horaria</span>
                      <select
                        value={settings.regional.timeZone}
                        onChange={(event) => updateRegionalField("timeZone", event.target.value as GeneralSettings["regional"]["timeZone"])}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="America/Mexico_City">America/Mexico_City</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Formato de fecha</span>
                      <select
                        value={settings.regional.dateFormat}
                        onChange={(event) => updateRegionalField("dateFormat", event.target.value as GeneralSettings["regional"]["dateFormat"])}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Primer día de la semana</span>
                      <select
                        value={settings.regional.weekStartsOn}
                        onChange={(event) => updateRegionalField("weekStartsOn", event.target.value as GeneralSettings["regional"]["weekStartsOn"])}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="monday">Lunes</option>
                      </select>
                    </label>
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">Apariencia</h3>
                  <p className="mt-1 text-xs text-slate-500">Bloque simplificado para Beta. Sin sistema completo de temas.</p>

                  <div className="mt-4 space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Logo del sistema (URL)</span>
                      <input
                        type="text"
                        value={settings.appearance.systemLogoUrl}
                        onChange={(event) => updateAppearanceField("systemLogoUrl", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Color principal (opcional)</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={settings.appearance.primaryColor}
                          onChange={(event) => updateAppearanceField("primaryColor", event.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                        />
                        <span
                          className="inline-flex h-8 w-8 rounded-md border border-slate-300"
                          style={{ backgroundColor: settings.appearance.primaryColor || "#ffffff" }}
                        />
                      </div>
                    </label>
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">Información del sistema</h3>
                  <p className="mt-1 text-xs text-slate-500">Controla metadatos visibles del ERP para la operación diaria.</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Nombre del sistema</span>
                      <input
                        type="text"
                        value={settings.system.systemName}
                        onChange={(event) => updateSystemField("systemName", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-600">Versión</span>
                      <input
                        type="text"
                        value={settings.system.version}
                        onChange={(event) => updateSystemField("version", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateSystemField("showVersionInInterface", !settings.system.showVersionInInterface)}
                    className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <p className="text-sm text-slate-700">Mostrar versión en la interfaz</p>
                    <span className={`inline-flex h-6 w-11 items-center rounded-full border px-0.5 ${toggleClasses(Boolean(settings.system.showVersionInInterface))}`}>
                      <span
                        className={`h-4 w-4 rounded-full bg-white transition ${settings.system.showVersionInInterface ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </span>
                  </button>
                </article>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
