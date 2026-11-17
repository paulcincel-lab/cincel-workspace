import "server-only";

import { revalidateTargets, type ScreenTarget } from "./targets";

const TARGETS = {
  layout: ["/", "layout"],
} as const satisfies Record<string, ScreenTarget>;

/**
 * Re-renders the root layout so `SessionHydrator` re-reads the session access.
 * For changes that can alter the signed-in person's own access (the permissions
 * matrix); the client drops its cached screens in the same step.
 */
export function revalidateSessionLayout(): void {
  revalidateTargets(TARGETS);
}
