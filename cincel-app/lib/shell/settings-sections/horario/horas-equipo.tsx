/**
 * Settings section "Horas del equipo" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function HorarioHorasEquipoSection() {
  return null;
}

export const horarioHorasEquipoSection: SettingsSectionEntry = {
  page: "horario",
  name: "horas-equipo",
  order: 40,
  visible: () => false,
  Component: HorarioHorasEquipoSection,
};
