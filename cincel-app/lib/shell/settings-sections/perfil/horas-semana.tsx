/**
 * Settings section "Mis horas esta semana" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function PerfilHorasSemanaSection() {
  return null;
}

export const perfilHorasSemanaSection: SettingsSectionEntry = {
  page: "perfil",
  name: "horas-semana",
  order: 30,
  visible: () => false,
  Component: PerfilHorasSemanaSection,
};
