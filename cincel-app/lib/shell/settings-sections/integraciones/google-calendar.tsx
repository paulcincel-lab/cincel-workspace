/**
 * Settings section "Google Calendar" of /ajustes/integraciones (redesign FE §3.8, §21.1).
 *
 * The direct-sync controls of Calendario and the subscription link
 * (`CalendarFeedLinkSection`, inline), for whoever can see the calendar.
 * Renders inside `IntegracionesClient`.
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
