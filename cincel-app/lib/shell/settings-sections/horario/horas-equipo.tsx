/**
 * Settings section "Horas del equipo" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * `canViewTeamHours` (Administrador, Dirección); hidden while
 * `fetchTeamHoursAction` is a stub. The only section that changes with the
 * presentation style (`TeamHoursTable` on `TeamHoursWidget`). Renders inside `HorarioClient`.
 */
import { HorarioHorasEquipo } from "@/components/ajustes/HorarioSections";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import { canViewTeamHours } from "@/lib/auth/permissions";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const horarioHorasEquipoSection: SettingsSectionEntry = {
  page: "horario",
  name: "horas-equipo",
  order: 40,
  visible: (user) => IMPLEMENTED.fetchTeamHoursAction && canViewTeamHours(user),
  Component: HorarioHorasEquipo,
};
