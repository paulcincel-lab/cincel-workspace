import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/flujos (#1035): 404 without the segment capability (Administrador, as Etapas y fases). */
export default async function AjustesFlujosLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(AJUSTES_SEGMENT_CAPABILITY.flujos, children);
}
