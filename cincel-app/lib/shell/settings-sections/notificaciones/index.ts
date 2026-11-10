/**
 * Settings sections of /ajustes/notificaciones (redesign FE §21.1). The page imports
 * this list instead of the whole registry, so its bundle only carries its
 * own section components.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { notificacionesCanalesSection } from "./canales";
import { notificacionesHorasSilencioSection } from "./horas-silencio";
import { notificacionesResumenDiarioSection } from "./resumen-diario";

export const NOTIFICACIONES_SECTIONS: readonly SettingsSectionEntry[] = [
  notificacionesCanalesSection,
  notificacionesHorasSilencioSection,
  notificacionesResumenDiarioSection,
];
