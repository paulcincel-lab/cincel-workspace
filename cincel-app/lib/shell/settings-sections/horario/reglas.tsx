/**
 * Settings section "Reglas de la jornada" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * Editable with `canManageTimeTracking`; a read-only summary with only
 * `canViewTeamHours` (Dirección). Renders inside `HorarioClient`.
 */
import { HorarioReglas } from "@/components/ajustes/HorarioSections";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { canManageTimeTracking, canViewTeamHours } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const horarioReglasSection: SettingsSectionEntry = {
  page: "horario",
  name: "reglas",
  order: 20,
  visible: (user) =>
    IMPLEMENTED.fetchTimeTrackingSettingsAction && (canManageTimeTracking(user) || canViewTeamHours(user)),
  Component: HorarioReglas,
};
