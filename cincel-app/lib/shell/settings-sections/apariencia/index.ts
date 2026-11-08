/**
 * Settings sections of /ajustes/apariencia (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { aparienciaTemaSection } from "./tema";
import { aparienciaEstiloSection } from "./estilo";
import { aparienciaModoSection } from "./modo";
import { aparienciaDensidadSection } from "./densidad";
import { aparienciaTamanoTextoSection } from "./tamano-texto";

export const APARIENCIA_SECTIONS: readonly SettingsSectionEntry[] = [
  aparienciaTemaSection,
  aparienciaEstiloSection,
  aparienciaModoSection,
  aparienciaDensidadSection,
  aparienciaTamanoTextoSection,
];
