/**
 * Settings section "Resumen diario" of /ajustes/notificaciones (redesign FE §3.8, §21.1; canvas `Ajustes-Notificaciones`).
 *
 * Info only: the fixed 07:30 digest of the events marked in the "Resumen
 * diario" column. Visible with the other sections of the page; renders inside
 * `NotificacionesClient`.
 */
import { NotificacionesResumenDiario } from "@/components/ajustes/NotificacionesClient";
import { IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const notificacionesResumenDiarioSection: SettingsSectionEntry = {
  page: "notificaciones",
  name: "resumen-diario",
  order: 30,
  visible: () => IMPLEMENTED.fetchNotificationPreferencesAction && IMPLEMENTED.updateNotificationPreferencesAction,
  Component: NotificacionesResumenDiario,
};
