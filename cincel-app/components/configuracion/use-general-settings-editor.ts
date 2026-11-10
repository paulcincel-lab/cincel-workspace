"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { restoreGeneralSettingsAction, saveGeneralSettingsAction } from "@/lib/actions/app-settings-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { orgGeneralOptions } from "@/lib/query/options/org";
import {
  buildDefaultLoadedGeneralSettings,
  clearLegacyGeneralSettings,
  GENERAL_SETTINGS_LOGO_MAX_BYTES,
  type GeneralSettings,
  type LoadedGeneralSettings,
  readLegacyGeneralSettings,
} from "@/lib/settings/general-settings";
import { type HeaderLinkErrors, headerLinkErrors } from "@/lib/settings/header-links";
import { useGeneralForm, useGeneralFormApi, type LogoScope } from "@/lib/stores/ajustes/general-form-store";

export type { LogoScope } from "@/lib/stores/ajustes/general-form-store";

const SAVE_ERROR = "No se pudo guardar la configuración. Intenta de nuevo.";
const RESTORE_ERROR = "No se pudo restaurar la configuración. Intenta de nuevo.";

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

/**
 * The saved general settings (`qk.org.general()`), seeded by the root layout;
 * never fetched on mount. Defaults until the seed is there.
 */
export function useSavedGeneralSettings(): LoadedGeneralSettings {
  const { data } = useQuery({
    ...orgGeneralOptions(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return useMemo(() => data ?? buildDefaultLoadedGeneralSettings(), [data]);
}

/** The avatar-menu link errors of a draft (Ajustes › General validates them before saving). */
export function generalLinkErrors(settings: GeneralSettings, headerLinks: boolean): HeaderLinkErrors {
  return headerLinks ? headerLinkErrors(settings.company) : {};
}

/**
 * How many fields differ between the saved settings and the draft (one per
 * changed leaf of company, regional, appearance and system): the save bar's
 * "{n} cambios sin guardar".
 */
export function changedFieldCount(saved: GeneralSettings, draft: GeneralSettings): number {
  let count = 0;
  for (const group of ["company", "regional", "appearance", "system"] as const) {
    const a = saved[group] as Record<string, unknown>;
    const b = draft[group] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if ((a[key] ?? null) !== (b[key] ?? null)) count += 1;
    }
  }
  return count;
}

export type GeneralSettingsEditorOptions = {
  canManage: boolean;
  /** Ajustes › General only: validate the avatar-menu link fields before saving. */
  headerLinks?: boolean;
};

/**
 * State and actions of the General settings editor of Ajustes › General. The
 * draft and errors live in the page's `GeneralFormStoreProvider`; the saved
 * settings are `qk.org.general()`. Save and restore write the result back with
 * `setQueryData`, so every `useGeneralSettings()` reader updates at once; the
 * actions also revalidate the root layout for its server-rendered parts.
 */
export function useGeneralSettingsEditor({ canManage, headerLinks = false }: GeneralSettingsEditorOptions) {
  const general = useSavedGeneralSettings();
  const form = useGeneralFormApi();
  const settings = useGeneralForm((s) => s.settings);
  const error = useGeneralForm((s) => s.error);
  const logoError = useGeneralForm((s) => s.logoError);
  const pickedUpLegacy = useGeneralForm((s) => s.pickedUpLegacy);
  const defaultSettings = useMemo(() => buildDefaultLoadedGeneralSettings().settings, []);

  // One-time pickup: a value saved in this browser before the settings moved to the server.
  useEffect(() => {
    if (general.hasCustom) {
      clearLegacyGeneralSettings();
      return;
    }
    if (!canManage) return;
    const legacy = readLegacyGeneralSettings();
    if (legacy && JSON.stringify(legacy) !== JSON.stringify(general.settings)) {
      const current = form.getState().settings;
      form.getState().pickUpLegacy({
        ...legacy,
        // The old browser value predates the link fields; keep the server ones.
        company: {
          ...legacy.company,
          instagramUrl: current.company.instagramUrl,
          contactEmail: current.company.contactEmail,
        },
      });
    }
  }, [canManage, form, general.hasCustom, general.settings]);

  const save = useActionMutation(saveGeneralSettingsAction, {
    setData: (qc, result, next) => {
      qc.setQueryData<LoadedGeneralSettings>(qk.org.general(), {
        settings: next as GeneralSettings,
        hasCustom: true,
        savedAt: result.savedAt,
      });
      form.getState().replace(next as GeneralSettings);
      clearLegacyGeneralSettings();
    },
    onFormError: () => form.getState().setError(SAVE_ERROR),
  });

  const restore = useActionMutation(restoreGeneralSettingsAction, {
    setData: (qc) => {
      qc.setQueryData<LoadedGeneralSettings>(qk.org.general(), buildDefaultLoadedGeneralSettings());
      form.getState().replace(defaultSettings);
    },
    onFormError: () => form.getState().setError(RESTORE_ERROR),
  });

  const dirtyCount = useMemo(() => changedFieldCount(general.settings, settings), [general.settings, settings]);
  const isDirty = dirtyCount > 0;

  const linkErrors: HeaderLinkErrors = useMemo(() => generalLinkErrors(settings, headerLinks), [headerLinks, settings]);
  const hasLinkErrors = Object.keys(linkErrors).length > 0;

  const { setCompanyField, setRegionalField, setAppearanceField, setSystemField, setLogoError } = form.getState();

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
        setCompanyField("logoUrl", dataUrl);
        return;
      }

      if (scope === "appearance" && field === "systemLogoUrl") {
        setAppearanceField("systemLogoUrl", dataUrl);
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
    form.getState().setError(null);
    save.mutate(toSave());
  };

  /** Back to the saved settings (the save bar's "Descartar"). */
  const discardChanges = () => {
    form.getState().replace(general.settings);
    setLogoError(null);
  };

  const restoreDefaults = () => {
    form.getState().setError(null);
    restore.mutate(undefined);
  };

  return {
    settings,
    savedAt: general.savedAt,
    hasCustomConfig: general.hasCustom,
    isDirty,
    dirtyCount,
    pending: save.isPending || restore.isPending,
    error,
    logoError,
    pickedUpLegacy,
    linkErrors,
    hasLinkErrors,
    canManage,
    updateCompanyField: setCompanyField,
    updateRegionalField: setRegionalField,
    updateAppearanceField: setAppearanceField,
    updateSystemField: setSystemField,
    handleLogoUpload,
    saveChanges,
    discardChanges,
    restoreDefaults,
  };
}

export type GeneralSettingsEditor = ReturnType<typeof useGeneralSettingsEditor>;
