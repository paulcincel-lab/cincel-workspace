/**
 * Settings section "Jornada de trabajo" of /ajustes/general (Calendario FE §6.5): the org workday
 * in hours (`calendario.workday_hours`), admin only.
 */
import { WorkdayHoursSection } from "@/components/ajustes/WorkdayHoursSection";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const generalJornadaSection: SettingsSectionEntry = {
  page: "general",
  name: "jornada",
  order: 20,
  visible: (user) => canManageGeneralSettings(user),
  Component: WorkdayHoursSection,
};
