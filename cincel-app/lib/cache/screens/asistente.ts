import "server-only";

import { revalidateTargets } from "./targets";

/** Asistente (thread list). Phase 10 empties this helper. */
export function revalidateAsistenteScreen(): void {
  revalidateTargets({ asistente: ["/asistente"] } as const);
}
