import type { ReactNode } from "react";

import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { guardAjustesSegment } from "@/lib/auth/ajustes-segment-guard";

/** Server guard of /ajustes/google (redesign FE §3.8, §8; BE §12.2): 404 without the segment capability. */
export default async function AjustesGoogleLayout({ children }: { children: ReactNode }) {
  return guardAjustesSegment(AJUSTES_SEGMENT_CAPABILITY.google, children);
}
