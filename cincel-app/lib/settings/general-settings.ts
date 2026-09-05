import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";

export const GENERAL_SETTINGS_STORAGE_KEY = "cincel.settings.general.v1";
export const GENERAL_SETTINGS_CHANGED_EVENT = "cincel:general-settings-changed";

export type GeneralLanguage = "es-MX";

export type GeneralTimeZone = "America/Mexico_City";

export type GeneralDateFormat = "dd/MM/yyyy";

export type WeekStartDay = "monday";

export type GeneralCompanySettings = {
  legalName: string;
  tradeName: string;
  primaryEmail: string;
  phone: string;
  website: string;
  address: string;
  rfc: string;
  logoUrl: string;
};

export type RegionalSettings = {
  language: GeneralLanguage;
  timeZone: GeneralTimeZone;
  dateFormat: GeneralDateFormat;
  weekStartsOn: WeekStartDay;
};

export type AppearanceSettings = {
  systemLogoUrl: string;
  primaryColor: string;
};

export type SystemInformationSettings = {
  systemName: string;
  version: string;
  showVersionInInterface: boolean;
};

export type GeneralSettings = {
  company: GeneralCompanySettings;
  regional: RegionalSettings;
  appearance: AppearanceSettings;
  system: SystemInformationSettings;
};

type StoredGeneralSettings = {
  version: 1;
  data: GeneralSettings;
};

export const GENERAL_SETTINGS_DEFAULTS: GeneralSettings = {
  company: {
    legalName: "Cincel Arquitectura y Construccion S.A. de C.V.",
    tradeName: "Cincel Workspace",
    primaryEmail: "contacto@cincel.mx",
    phone: "+52 33 0000 0000",
    website: "https://cincel.mx",
    address: "Guadalajara, Jalisco, Mexico",
    rfc: "",
    logoUrl: "/favicon.ico",
  },
  regional: {
    language: "es-MX",
    timeZone: "America/Mexico_City",
    dateFormat: "dd/MM/yyyy",
    weekStartsOn: "monday",
  },
  appearance: {
    systemLogoUrl: "/favicon.ico",
    primaryColor: "#0A0A0A",
  },
  system: {
    systemName: "Cincel Workspace",
    version: "v0.1.0-beta",
    showVersionInInterface: true,
  },
};

function deepCloneDefaults(): GeneralSettings {
  return {
    company: { ...GENERAL_SETTINGS_DEFAULTS.company },
    regional: { ...GENERAL_SETTINGS_DEFAULTS.regional },
    appearance: { ...GENERAL_SETTINGS_DEFAULTS.appearance },
    system: { ...GENERAL_SETTINGS_DEFAULTS.system },
  };
}

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeEnum<TValue extends string>({
  value,
  allowed,
  fallback,
}: {
  value: unknown;
  allowed: readonly TValue[];
  fallback: TValue;
}): TValue {
  if (typeof value !== "string") {
    return fallback;
  }

  return allowed.includes(value as TValue) ? (value as TValue) : fallback;
}

export function sanitizeGeneralSettings(candidate: unknown): GeneralSettings {
  const defaults = deepCloneDefaults();

  if (!candidate || typeof candidate !== "object") {
    return defaults;
  }

  const payload = candidate as StoredGeneralSettings;

  if (payload.version !== 1 || !payload.data || typeof payload.data !== "object") {
    return defaults;
  }

  const companyCandidate = payload.data.company ?? {};
  const regionalCandidate = payload.data.regional ?? {};
  const appearanceCandidate = payload.data.appearance ?? {};
  const systemCandidate = payload.data.system ?? {};

  return {
    company: {
      legalName: sanitizeString(companyCandidate.legalName, defaults.company.legalName),
      tradeName: sanitizeString(companyCandidate.tradeName, defaults.company.tradeName),
      primaryEmail: sanitizeString(companyCandidate.primaryEmail, defaults.company.primaryEmail),
      phone: sanitizeString(companyCandidate.phone, defaults.company.phone),
      website: sanitizeString(companyCandidate.website, defaults.company.website),
      address: sanitizeString(companyCandidate.address, defaults.company.address),
      rfc: sanitizeString(companyCandidate.rfc, defaults.company.rfc),
      logoUrl: sanitizeString(companyCandidate.logoUrl, defaults.company.logoUrl),
    },
    regional: {
      language: sanitizeEnum({
        value: regionalCandidate.language,
        allowed: ["es-MX"],
        fallback: defaults.regional.language,
      }),
      timeZone: sanitizeEnum({
        value: regionalCandidate.timeZone,
        allowed: ["America/Mexico_City"],
        fallback: defaults.regional.timeZone,
      }),
      dateFormat: sanitizeEnum({
        value: regionalCandidate.dateFormat,
        allowed: ["dd/MM/yyyy"],
        fallback: defaults.regional.dateFormat,
      }),
      weekStartsOn: sanitizeEnum({
        value: regionalCandidate.weekStartsOn,
        allowed: ["monday"],
        fallback: defaults.regional.weekStartsOn,
      }),
    },
    appearance: {
      systemLogoUrl: sanitizeString(appearanceCandidate.systemLogoUrl, defaults.appearance.systemLogoUrl),
      primaryColor: sanitizeString(appearanceCandidate.primaryColor, defaults.appearance.primaryColor),
    },
    system: {
      systemName: sanitizeString(systemCandidate.systemName, defaults.system.systemName),
      version: sanitizeString(systemCandidate.version, defaults.system.version),
      showVersionInInterface: sanitizeBoolean(systemCandidate.showVersionInInterface, defaults.system.showVersionInInterface),
    },
  };
}

export function loadGeneralSettings(): { settings: GeneralSettings; hasCustom: boolean } {
  if (typeof window === "undefined") {
    return { settings: deepCloneDefaults(), hasCustom: false };
  }

  const stored = readStorage(GENERAL_SETTINGS_STORAGE_KEY);

  if (!stored) {
    return { settings: deepCloneDefaults(), hasCustom: false };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      settings: sanitizeGeneralSettings(parsed),
      hasCustom: true,
    };
  } catch {
    return { settings: deepCloneDefaults(), hasCustom: false };
  }
}

export function saveGeneralSettings(settings: GeneralSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredGeneralSettings = {
    version: 1,
    data: settings,
  };

  writeStorage(GENERAL_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(GENERAL_SETTINGS_CHANGED_EVENT));
}

export function restoreDefaultGeneralSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeStorage(GENERAL_SETTINGS_STORAGE_KEY);
  window.dispatchEvent(new Event(GENERAL_SETTINGS_CHANGED_EVENT));
}

export function buildDefaultGeneralSettings(): GeneralSettings {
  return deepCloneDefaults();
}
