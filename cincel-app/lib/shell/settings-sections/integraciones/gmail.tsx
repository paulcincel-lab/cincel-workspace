/**
 * Settings section "Gmail: estado, Conectar, Sincronizar ahora, Desconectar" of /ajustes/integraciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Contract stub: hidden until Phase 5 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function IntegracionesGmailSection() {
  return null;
}

export const integracionesGmailSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "gmail",
  order: 10,
  visible: () => false,
  Component: IntegracionesGmailSection,
};
