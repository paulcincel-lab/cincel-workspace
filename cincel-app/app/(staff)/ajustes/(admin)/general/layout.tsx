import type { ReactNode } from "react";

import { canManageGeneralSettings } from "@/lib/auth/permissions";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/general (redesign FE §3.8, §8; BE §12.2): 404 without the segment capability. */
export default async function AjustesGeneralLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(canManageGeneralSettings, children);
}
