/**
 * Settings section "Lo que ve el equipo al iniciar sesión" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * `canManageTimeTracking` only: a preview of the `ClockInPrompt` copy for the
 * settings being edited. Renders inside `HorarioClient`.
 */
import { HorarioVistaPrevia } from "@/components/ajustes/HorarioSections";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { canManageTimeTracking } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const horarioVistaPreviaSection: SettingsSectionEntry = {
  page: "horario",
  name: "vista-previa",
  order: 30,
  visible: (user) => IMPLEMENTED.fetchTimeTrackingSettingsAction && canManageTimeTracking(user),
  Component: HorarioVistaPrevia,
};
