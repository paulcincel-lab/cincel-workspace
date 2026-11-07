/**
 * Settings section "Lo que ve el equipo al iniciar sesión" of /ajustes/horario (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function HorarioVistaPreviaSection() {
  return null;
}

export const horarioVistaPreviaSection: SettingsSectionEntry = {
  page: "horario",
  name: "vista-previa",
  order: 30,
  visible: () => false,
  Component: HorarioVistaPreviaSection,
};
