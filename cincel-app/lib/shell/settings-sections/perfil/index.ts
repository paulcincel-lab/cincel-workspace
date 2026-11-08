/**
 * Settings sections of /ajustes/perfil (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { perfilFotoSection } from "./foto";
import { perfilDatosSection } from "./datos";
import { perfilHorasSemanaSection } from "./horas-semana";
import { perfilContrasenaSection } from "./contrasena";

export const PERFIL_SECTIONS: readonly SettingsSectionEntry[] = [
  perfilFotoSection,
  perfilDatosSection,
  perfilHorasSemanaSection,
  perfilContrasenaSection,
];
