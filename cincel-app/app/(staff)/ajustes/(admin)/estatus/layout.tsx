import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { requirePageCapability } from "@/lib/auth/session";

/** Server guard of /ajustes/estatus (redesign FE §3.8, §8; BE §12.2): 404 without the segment capability. */
export default async function AjustesEstatusLayout({ children }: { children: ReactNode }) {
  await requirePageCapability(AJUSTES_SEGMENT_CAPABILITY.estatus);
  return <>{children}</>;
}
