import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/menu: 404 for anyone who is not an administrator. */
export default async function AjustesMenuLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(AJUSTES_SEGMENT_CAPABILITY.menu, children);
}
