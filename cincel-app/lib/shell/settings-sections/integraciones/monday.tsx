/**
 * Settings section "monday (enlace a /ajustes/monday)" of /ajustes/integraciones (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function IntegracionesMondaySection() {
  return null;
}

export const integracionesMondaySection: SettingsSectionEntry = {
  page: "integraciones",
  name: "monday",
  order: 40,
  visible: () => false,
  Component: IntegracionesMondaySection,
};
