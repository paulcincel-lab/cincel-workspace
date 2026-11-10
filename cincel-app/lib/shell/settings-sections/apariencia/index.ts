/**
 * Settings sections of /ajustes/apariencia (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { aparienciaTemaSection } from "./tema";
import { aparienciaModoSection } from "./modo";
import { aparienciaEstiloSection } from "./estilo";
import { aparienciaTamanoTextoSection } from "./tamano-texto";
import { aparienciaDensidadSection } from "./densidad";

/** Canvas `Ajustes-Apariencia` order: Tema, Modo, Estilo, Tamaño de texto, then Densidad (not in the frame; kept last). */
export const APARIENCIA_SECTIONS: readonly SettingsSectionEntry[] = [
  aparienciaTemaSection,
  aparienciaModoSection,
  aparienciaEstiloSection,
  aparienciaTamanoTextoSection,
  aparienciaDensidadSection,
];
