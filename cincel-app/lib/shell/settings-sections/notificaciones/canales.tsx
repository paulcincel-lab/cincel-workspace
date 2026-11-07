/**
 * Settings section "Canales por tipo de aviso (En la app, Correo, Resumen diario)" of /ajustes/notificaciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Contract stub: hidden until Phase 5 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function NotificacionesCanalesSection() {
  return null;
}

export const notificacionesCanalesSection: SettingsSectionEntry = {
  page: "notificaciones",
  name: "canales",
  order: 10,
  visible: () => false,
  Component: NotificacionesCanalesSection,
};
