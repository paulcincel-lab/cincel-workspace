/**
 * Settings section "Horas de silencio y resumen diario a las 07:30" of /ajustes/notificaciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Contract stub: hidden until Phase 5 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function NotificacionesHorasSilencioSection() {
  return null;
}

export const notificacionesHorasSilencioSection: SettingsSectionEntry = {
  page: "notificaciones",
  name: "horas-silencio",
  order: 20,
  visible: () => false,
  Component: NotificacionesHorasSilencioSection,
};
