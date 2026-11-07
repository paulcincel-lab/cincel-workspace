import { readStorage, removeStorage } from "@/lib/repositories/browser-state-repository";

/** Where the settings lived before they moved to the database; read once to pick up an old value. */
export const GENERAL_SETTINGS_STORAGE_KEY = "cincel.settings.general.v1";
/** core.app_settings key holding the settings as JSON. */
export const GENERAL_SETTINGS_SETTING_KEY = "general_settings";

/** Largest logo image accepted (bytes), so a save stays well under the server action body limit. */
export const GENERAL_SETTINGS_LOGO_MAX_BYTES = 200 * 1024;

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
  /** Instagram profile linked from the avatar menu (`https://` only); null hides the link. */
  instagramUrl: string | null;
  /** Address behind "Contactar al administrador" and the avatar-menu mail link; null hides it. */
  contactEmail: string | null;
};

export type RegionalSettings = {
  language: GeneralLanguage;
  timeZone: GeneralTimeZone;
  dateFormat: GeneralDateFormat;
  weekStartsOn: WeekStartDay;
};

export type AppearanceSettings = {
  systemLogoUrl: string;
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
    instagramUrl: null,
    contactEmail: null,
  },
  regional: {
    language: "es-MX",
    timeZone: "America/Mexico_City",
    dateFormat: "dd/MM/yyyy",
    weekStartsOn: "monday",
  },
  appearance: {
    systemLogoUrl: "/favicon.ico",
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

/** An absolute `https://` URL with a dotted host. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !/\s/.test(value);
  } catch {
    return false;
  }
}

/** A plain `name@domain.tld` address. */
export function isContactEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** A stored link kept only when it is a non-empty string of the right shape; anything else is null. */
function sanitizeLink(value: unknown, isValid: (candidate: string) => boolean): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && isValid(trimmed) ? trimmed : null;
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
      instagramUrl: sanitizeLink(companyCandidate.instagramUrl, isHttpsUrl),
      contactEmail: sanitizeLink(companyCandidate.contactEmail, isContactEmail),
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
    },
    system: {
      systemName: sanitizeString(systemCandidate.systemName, defaults.system.systemName),
      version: sanitizeString(systemCandidate.version, defaults.system.version),
      showVersionInInterface: sanitizeBoolean(systemCandidate.showVersionInInterface, defaults.system.showVersionInInterface),
    },
  };
}

export type LoadedGeneralSettings = { settings: GeneralSettings; hasCustom: boolean; savedAt: string | null };

export function buildDefaultLoadedGeneralSettings(): LoadedGeneralSettings {
  return { settings: deepCloneDefaults(), hasCustom: false, savedAt: null };
}

/** A settings value stored before they moved to the database (this browser only), or null. */
export function readLegacyGeneralSettings(): GeneralSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = readStorage(GENERAL_SETTINGS_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && parsed.version === 1 ? sanitizeGeneralSettings(parsed) : null;
  } catch {
    return null;
  }
}

export function clearLegacyGeneralSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeStorage(GENERAL_SETTINGS_STORAGE_KEY);
}

/** "Guardado 4 nov 2026, 10:30" style label for the last save. */
export function formatGeneralSettingsSavedAt(savedAt: string): string {
  const date = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: GENERAL_SETTINGS_DEFAULTS.regional.timeZone,
  }).format(new Date(savedAt));
  return `Guardado ${date}`;
}

export function buildDefaultGeneralSettings(): GeneralSettings {
  return deepCloneDefaults();
}
