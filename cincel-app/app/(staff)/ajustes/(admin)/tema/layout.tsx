import type { ReactNode } from "react";

import { canManageAppearance } from "@/lib/auth/permissions";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/tema (redesign FE §3.8, §8; BE §12.2): 404 without the segment capability. */
export default async function AjustesTemaLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(canManageAppearance, children);
}
