import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/eliminados (#1050): 404 without the segment capability. */
export default async function AjustesEliminadosLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(AJUSTES_SEGMENT_CAPABILITY.eliminados, children);
}
