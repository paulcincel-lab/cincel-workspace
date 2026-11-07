/**
 * Settings section "Canales por tipo de aviso (En la app, Correo, Resumen diario)" of /ajustes/notificaciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Visible once the notification preference actions are implemented; renders
 * inside `NotificacionesClient`, which holds the form state.
 */
import { NotificacionesCanales } from "@/components/ajustes/NotificacionesClient";
import { IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const notificacionesCanalesSection: SettingsSectionEntry = {
  page: "notificaciones",
  name: "canales",
  order: 10,
  visible: () => IMPLEMENTED.fetchNotificationPreferencesAction && IMPLEMENTED.updateNotificationPreferencesAction,
  Component: NotificacionesCanales,
};
