"use client";

import { useEffect, useState } from "react";

import {
  buildDefaultGeneralSettings,
  GENERAL_SETTINGS_CHANGED_EVENT,
  type GeneralSettings,
  loadGeneralSettings,
} from "@/lib/settings/general-settings";

export function useGeneralSettings(): GeneralSettings {
  const [settings, setSettings] = useState<GeneralSettings>(() => {
    if (typeof window === "undefined") {
      return buildDefaultGeneralSettings();
    }

    return loadGeneralSettings().settings;
  });

  useEffect(() => {
    const refresh = () => {
      setSettings(loadGeneralSettings().settings);
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(GENERAL_SETTINGS_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(GENERAL_SETTINGS_CHANGED_EVENT, refresh);
    };
  }, []);

  return settings;
}
