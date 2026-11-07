/**
 * Settings section "Reglas de la jornada" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function HorarioReglasSection() {
  return null;
}

export const horarioReglasSection: SettingsSectionEntry = {
  page: "horario",
  name: "reglas",
  order: 20,
  visible: () => false,
  Component: HorarioReglasSection,
};
