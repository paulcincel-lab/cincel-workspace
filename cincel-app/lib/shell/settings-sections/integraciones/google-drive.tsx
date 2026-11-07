/**
 * Settings section "Google Drive (estado existente)" of /ajustes/integraciones (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function IntegracionesGoogleDriveSection() {
  return null;
}

export const integracionesGoogleDriveSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "google-drive",
  order: 30,
  visible: () => false,
  Component: IntegracionesGoogleDriveSection,
};
