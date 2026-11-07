import type { ReactNode } from "react";

import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";
import { canOpenHorario } from "@/lib/shell/settings-sections/horario/access";

/**
 * Server guard of /ajustes/horario (redesign FE §3.8, §8; BE §12.2): admits
 * `canManageTimeTracking` or `canViewTeamHours` (`canOpenHorario`); each
 * section of the page checks its own capability. 404 otherwise.
 */
export default async function AjustesHorarioLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(canOpenHorario, children);
}
