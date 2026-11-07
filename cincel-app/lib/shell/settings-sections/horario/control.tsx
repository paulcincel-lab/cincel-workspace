/**
 * Settings section "Control de horario activado / desactivado y fecha obligatoria" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function HorarioControlSection() {
  return null;
}

export const horarioControlSection: SettingsSectionEntry = {
  page: "horario",
  name: "control",
  order: 10,
  visible: () => false,
  Component: HorarioControlSection,
};
