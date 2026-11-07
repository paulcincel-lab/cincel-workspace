/**
 * Settings section "monday (enlace a /ajustes/monday)" of /ajustes/integraciones (redesign FE §3.8, §21.1).
 *
 * Only for viewers who pass the `/ajustes/monday` segment guard
 * (Administrador, FE §8), so the link never leads to a 404.
 */
import { IntegracionesMonday } from "@/components/ajustes/IntegracionesClient";
import { isAdministratorRole } from "@/lib/data/roles";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const integracionesMondaySection: SettingsSectionEntry = {
  page: "integraciones",
  name: "monday",
  order: 40,
  visible: (user) => isAdministratorRole(user.access),
  Component: IntegracionesMonday,
};
