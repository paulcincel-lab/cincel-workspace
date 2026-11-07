/**
 * Settings section "Mis horas esta semana" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Hidden while the time-tracking reads are stubs; the page loads
 * `fetchMyWeekHoursAction` only when `fetchMyTodayAction().enabled`, and the
 * line renders nothing otherwise. Renders inside `PerfilClient`.
 */
import { PerfilHorasSemana } from "@/components/ajustes/PerfilClient";
import { IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const perfilHorasSemanaSection: SettingsSectionEntry = {
  page: "perfil",
  name: "horas-semana",
  order: 30,
  visible: () => IMPLEMENTED.fetchMyTodayAction && IMPLEMENTED.fetchMyWeekHoursAction,
  Component: PerfilHorasSemana,
};
