/**
 * Settings section "Google Drive (estado existente)" of /ajustes/integraciones (redesign FE §3.8, §21.1).
 *
 * The person's own Drive grant (the Recursos picker status). Renders inside
 * `IntegracionesClient`.
 */
import { IntegracionesGoogleDrive } from "@/components/ajustes/IntegracionesClient";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const integracionesGoogleDriveSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "google-drive",
  order: 30,
  visible: () => true,
  Component: IntegracionesGoogleDrive,
};
