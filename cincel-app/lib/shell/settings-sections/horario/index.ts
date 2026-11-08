/**
 * Settings sections of /ajustes/horario (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { horarioControlSection } from "./control";
import { horarioReglasSection } from "./reglas";
import { horarioVistaPreviaSection } from "./vista-previa";
import { horarioHorasEquipoSection } from "./horas-equipo";

export const HORARIO_SECTIONS: readonly SettingsSectionEntry[] = [
  horarioControlSection,
  horarioReglasSection,
  horarioVistaPreviaSection,
  horarioHorasEquipoSection,
];
