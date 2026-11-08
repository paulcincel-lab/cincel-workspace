/**
 * Settings sections of /ajustes/integraciones (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { integracionesGmailSection } from "./gmail";
import { integracionesGoogleCalendarSection } from "./google-calendar";
import { integracionesGoogleDriveSection } from "./google-drive";
import { integracionesMondaySection } from "./monday";

export const INTEGRACIONES_SECTIONS: readonly SettingsSectionEntry[] = [
  integracionesGmailSection,
  integracionesGoogleCalendarSection,
  integracionesGoogleDriveSection,
  integracionesMondaySection,
];
