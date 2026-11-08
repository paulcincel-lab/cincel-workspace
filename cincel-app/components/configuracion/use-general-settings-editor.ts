"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { restoreGeneralSettingsAction, saveGeneralSettingsAction } from "@/lib/actions/app-settings-actions";
import {
  buildDefaultGeneralSettings,
  clearLegacyGeneralSettings,
  GENERAL_SETTINGS_LOGO_MAX_BYTES,
  type GeneralSettings,
  type LoadedGeneralSettings,
  readLegacyGeneralSettings,
} from "@/lib/settings/general-settings";
import { type HeaderLinkErrors, headerLinkErrors } from "@/lib/settings/header-links";

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

    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

export type LogoScope = "company" | "appearance";

export type GeneralSettingsEditorOptions = {
  general: LoadedGeneralSettings;
  canManage: boolean;
  /** Ajustes › General only: validate the avatar-menu link fields before saving. */
  headerLinks?: boolean;
};

/** State and actions of the General settings editor of Ajustes › General. */
export function useGeneralSettingsEditor({ general, canManage, headerLinks = false }: GeneralSettingsEditorOptions) {
  const router = useRouter();
  const defaultSettings = useMemo(() => buildDefaultGeneralSettings(), []);

  const [settings, setSettings] = useState<GeneralSettings>(general.settings);
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(general.hasCustom);
  // What's stored now — "Guardar cambios" enables on any difference from it.
  const [savedSettings, setSavedSettings] = useState<GeneralSettings>(general.settings);
  const [savedAt, setSavedAt] = useState<string | null>(general.savedAt);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<{ scope: LogoScope; message: string } | null>(null);
  const [pickedUpLegacy, setPickedUpLegacy] = useState(false);
  const [pending, startTransition] = useTransition();

  // One-time pickup: a value saved in this browser before the settings moved to the server.
  useEffect(() => {
    if (general.hasCustom) {
      clearLegacyGeneralSettings();
      return;
    }
    if (!canManage) return;
    const legacy = readLegacyGeneralSettings();
    if (legacy && JSON.stringify(legacy) !== JSON.stringify(general.settings)) {
      // Browser storage is only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings((current) => ({
        ...legacy,
        // The old browser value predates the link fields; keep the server ones.
        company: {
          ...legacy.company,
          instagramUrl: current.company.instagramUrl,
          contactEmail: current.company.contactEmail,
        },
      }));
      setPickedUpLegacy(true);
    }
  }, [canManage, general.hasCustom, general.settings]);

  const isDirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(savedSettings), [savedSettings, settings]);

  const linkErrors: HeaderLinkErrors = useMemo(
    () => (headerLinks ? headerLinkErrors(settings.company) : {}),
    [headerLinks, settings.company],
  );
  const hasLinkErrors = Object.keys(linkErrors).length > 0;

  const updateCompanyField = <TKey extends keyof GeneralSettings["company"]>(
    key: TKey,
    value: GeneralSettings["company"][TKey],
  ) => {
    setSettings((current) => ({ ...current, company: { ...current.company, [key]: value } }));
  };

  const updateRegionalField = <TKey extends keyof GeneralSettings["regional"]>(
    key: TKey,
    value: GeneralSettings["regional"][TKey],
  ) => {
    setSettings((current) => ({ ...current, regional: { ...current.regional, [key]: value } }));
  };

  const updateAppearanceField = <TKey extends keyof GeneralSettings["appearance"]>(
    key: TKey,
    value: GeneralSettings["appearance"][TKey],
  ) => {
    setSettings((current) => ({ ...current, appearance: { ...current.appearance, [key]: value } }));
  };

  const updateSystemField = <TKey extends keyof GeneralSettings["system"]>(
    key: TKey,
    value: GeneralSettings["system"][TKey],
  ) => {
    setSettings((current) => ({ ...current, system: { ...current.system, [key]: value } }));
  };

  const handleLogoUpload = async (scope: LogoScope, field: "logoUrl" | "systemLogoUrl", file: File | null) => {
    setLogoError(null);

    if (!file) {
      return;
    }

    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLogoError({ scope, message: "Solo se permiten imágenes PNG o JPG." });
      return;
    }

    if (file.size > GENERAL_SETTINGS_LOGO_MAX_BYTES) {
      setLogoError({ scope, message: `La imagen debe pesar como máximo ${GENERAL_SETTINGS_LOGO_MAX_BYTES / 1024} KB.` });
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
      setLogoError({ scope, message: "No se pudo cargar la imagen. Intenta de nuevo." });
    }
  };

  /** The settings as sent to the server: link fields trimmed, blanks as null. */
  const toSave = (): GeneralSettings => {
    if (!headerLinks) return settings;
    const instagramUrl = settings.company.instagramUrl?.trim() ?? "";
    const contactEmail = settings.company.contactEmail?.trim() ?? "";
    return {
      ...settings,
      company: {
        ...settings.company,
        website: settings.company.website.trim(),
        instagramUrl: instagramUrl || null,
        contactEmail: contactEmail || null,
      },
    };
  };

  const saveChanges = () => {
    if (hasLinkErrors) return;
    setError(null);
    const next = toSave();
    startTransition(async () => {
      try {
        const result = await saveGeneralSettingsAction(next);
        setSavedAt(result.savedAt);
        setSettings(next);
        setSavedSettings(next);
        setHasCustomConfig(true);
        setPickedUpLegacy(false);
        clearLegacyGeneralSettings();
        router.refresh();
      } catch {
        setError("No se pudo guardar la configuración. Intenta de nuevo.");
      }
    });
  };

  const restoreDefaults = () => {
    setError(null);
    startTransition(async () => {
      try {
        await restoreGeneralSettingsAction();
        setSettings(defaultSettings);
        setSavedSettings(defaultSettings);
        setHasCustomConfig(false);
        setSavedAt(null);
        setPickedUpLegacy(false);
        router.refresh();
      } catch {
        setError("No se pudo restaurar la configuración. Intenta de nuevo.");
      }
    });
  };

  return {
    settings,
    savedAt,
    hasCustomConfig,
    isDirty,
    pending,
    error,
    logoError,
    pickedUpLegacy,
    linkErrors,
    hasLinkErrors,
    canManage,
    updateCompanyField,
    updateRegionalField,
    updateAppearanceField,
    updateSystemField,
    handleLogoUpload,
    saveChanges,
    restoreDefaults,
  };
}

export type GeneralSettingsEditor = ReturnType<typeof useGeneralSettingsEditor>;
