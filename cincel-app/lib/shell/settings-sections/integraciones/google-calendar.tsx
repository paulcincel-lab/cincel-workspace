/**
 * Settings section "Google Calendar (controles existentes)" of /ajustes/integraciones (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function IntegracionesGoogleCalendarSection() {
  return null;
}

export const integracionesGoogleCalendarSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "google-calendar",
  order: 20,
  visible: () => false,
  Component: IntegracionesGoogleCalendarSection,
};
