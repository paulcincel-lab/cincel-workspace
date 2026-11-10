/**
 * Settings section "Horario silencioso" of /ajustes/notificaciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Visible once the notification preference actions are implemented; renders
 * inside `NotificacionesClient`, whose page-scoped store holds the draft.
 */
import { NotificacionesHorasSilencio } from "@/components/ajustes/NotificacionesClient";
import { IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const notificacionesHorasSilencioSection: SettingsSectionEntry = {
  page: "notificaciones",
  name: "horas-silencio",
  order: 20,
  visible: () => IMPLEMENTED.fetchNotificationPreferencesAction && IMPLEMENTED.updateNotificationPreferencesAction,
  Component: NotificacionesHorasSilencio,
};
