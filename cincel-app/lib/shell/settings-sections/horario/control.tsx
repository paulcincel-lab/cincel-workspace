/**
 * Settings section "Activar control de horario" (Desactivado · En prueba · Obligatorio and the mandatory date) of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * `canManageTimeTracking` only. Renders inside `HorarioClient`, which holds the settings.
 */
import { HorarioControl } from "@/components/ajustes/HorarioSections";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { canManageTimeTracking } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const horarioControlSection: SettingsSectionEntry = {
  page: "horario",
  name: "control",
  order: 10,
  visible: (user) => IMPLEMENTED.fetchTimeTrackingSettingsAction && canManageTimeTracking(user),
  Component: HorarioControl,
};
