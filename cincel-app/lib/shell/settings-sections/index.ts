/**
 * Settings section registry (redesign FE §21.1): one file per section under
 * `lib/shell/settings-sections/<page>/<name>.tsx`. Each Ajustes page renders
 * its visible sections in `order` as `SettingsSection`s.
 */
import type { ComponentType } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { notificacionesCanalesSection } from "./notificaciones/canales";
import { notificacionesHorasSilencioSection } from "./notificaciones/horas-silencio";
import { integracionesGmailSection } from "./integraciones/gmail";
import { integracionesGoogleCalendarSection } from "./integraciones/google-calendar";
import { integracionesGoogleDriveSection } from "./integraciones/google-drive";
import { integracionesMondaySection } from "./integraciones/monday";
import { aparienciaTemaSection } from "./apariencia/tema";
import { aparienciaEstiloSection } from "./apariencia/estilo";
import { aparienciaModoSection } from "./apariencia/modo";
import { aparienciaDensidadSection } from "./apariencia/densidad";
import { aparienciaTamanoTextoSection } from "./apariencia/tamano-texto";
import { aparienciaNuevoDisenoSection } from "./apariencia/nuevo-diseno";
import { horarioControlSection } from "./horario/control";
import { horarioReglasSection } from "./horario/reglas";
import { horarioVistaPreviaSection } from "./horario/vista-previa";
import { horarioHorasEquipoSection } from "./horario/horas-equipo";
import { perfilFotoSection } from "./perfil/foto";
import { perfilDatosSection } from "./perfil/datos";
import { perfilHorasSemanaSection } from "./perfil/horas-semana";
import { perfilContrasenaSection } from "./perfil/contrasena";
import { generalEnlacesSection } from "./general/enlaces";

export type SettingsPage = "perfil" | "apariencia" | "notificaciones" | "integraciones" | "general" | "horario";

export type SettingsSectionEntry = {
  page: SettingsPage;
  name: string;
  order: number;
  /** Capability / flag check; false = not rendered. */
  visible(user: AuthenticatedUser): boolean;
  Component: ComponentType;
};

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  notificacionesCanalesSection,
  notificacionesHorasSilencioSection,
  integracionesGmailSection,
  integracionesGoogleCalendarSection,
  integracionesGoogleDriveSection,
  integracionesMondaySection,
  aparienciaTemaSection,
  aparienciaEstiloSection,
  aparienciaModoSection,
  aparienciaDensidadSection,
  aparienciaTamanoTextoSection,
  aparienciaNuevoDisenoSection,
  horarioControlSection,
  horarioReglasSection,
  horarioVistaPreviaSection,
  horarioHorasEquipoSection,
  perfilFotoSection,
  perfilDatosSection,
  perfilHorasSemanaSection,
  perfilContrasenaSection,
  generalEnlacesSection,
];

/** The visible sections of one page, in order. */
export function settingsSectionsFor(page: SettingsPage, user: AuthenticatedUser): SettingsSectionEntry[] {
  return SETTINGS_SECTIONS.filter((s) => s.page === page && s.visible(user)).sort((a, b) => a.order - b.order);
}
