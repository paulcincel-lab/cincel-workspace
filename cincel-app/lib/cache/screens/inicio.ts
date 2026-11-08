import "server-only";

import { revalidateTargets } from "./targets";

/** ⚠ `/dashboard` only redirects to Inicio; the call stays until Phase 3 empties this helper. */
const INICIO_TARGETS = {
  dashboard: ["/dashboard"],
} as const;

/** Revalidates Inicio. */
export function revalidateInicioScreen(): void {
  revalidateTargets(INICIO_TARGETS);
}
