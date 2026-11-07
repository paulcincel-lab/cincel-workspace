import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { requirePageCapability } from "@/lib/auth/session";

/**
 * Server guard of /ajustes/horario (redesign FE §3.8, §8; BE §12.2): admits
 * `canManageTimeTracking` or `canViewTeamHours`; each section of the page
 * checks its own capability. 404 otherwise.
 */
export default async function AjustesHorarioLayout({ children }: { children: ReactNode }) {
  await requirePageCapability(AJUSTES_SEGMENT_CAPABILITY.horario);
  return <>{children}</>;
}
