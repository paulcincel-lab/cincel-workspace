/**
 * Settings sections of /ajustes/general (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { generalEnlacesSection } from "./enlaces";
import { generalJornadaSection } from "./jornada";

export const GENERAL_SECTIONS: readonly SettingsSectionEntry[] = [
  generalEnlacesSection,
  generalJornadaSection,
];
