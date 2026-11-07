import type { ReactNode } from "react";
import { notFound, unstable_rethrow } from "next/navigation";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { requirePageCapability } from "@/lib/auth/session";

/**
 * Server guard of one Ajustes › Organización segment (redesign FE §3.8, §8;
 * BE §12.2): `requirePageCapability(cap)`, and a 404 on any failure, on
 * direct URL access too. Next's own control flow (redirect to /login,
 * notFound) passes through unchanged.
 */
export async function guardAjustesSegment(
  cap: (user: AuthenticatedUser) => boolean,
  children: ReactNode,
): Promise<ReactNode> {
  let allowed = false;
  try {
    await requirePageCapability(cap);
    allowed = true;
  } catch (err) {
    unstable_rethrow(err);
  }
  if (!allowed) notFound();
  return children;
}
