/**
 * Settings section "Google Calendar (controles existentes)" of /ajustes/integraciones (redesign FE §3.8, §21.1).
 *
 * The existing direct-sync controls of Calendario, for whoever can see the
 * calendar. Renders inside `IntegracionesClient`.
 */
import { IntegracionesGoogleCalendar } from "@/components/ajustes/IntegracionesClient";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const integracionesGoogleCalendarSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "google-calendar",
  order: 20,
  visible: (user) => resolveCalendarCapabilities(user).canViewCalendar,
  Component: IntegracionesGoogleCalendar,
};
