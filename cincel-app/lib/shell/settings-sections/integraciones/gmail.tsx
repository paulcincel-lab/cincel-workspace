/**
 * Settings section "Gmail: estado, Conectar, Sincronizar ahora, Desconectar" of /ajustes/integraciones (redesign FE §3.8, §21.1; Phase 5).
 *
 * Hidden while `fetchGmailStatusAction` is a stub; the card shows "Sincronizar
 * ahora" and "Desconectar" only once their own actions are implemented.
 * Renders inside `IntegracionesClient`; the status is `qk.ajustes.page('integraciones')`.
 */
import { IntegracionesGmail } from "@/components/ajustes/IntegracionesClient";
import { IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const integracionesGmailSection: SettingsSectionEntry = {
  page: "integraciones",
  name: "gmail",
  order: 10,
  visible: () => IMPLEMENTED.fetchGmailStatusAction,
  Component: IntegracionesGmail,
};
