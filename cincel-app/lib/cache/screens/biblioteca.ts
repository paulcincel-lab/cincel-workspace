import "server-only";

import { revalidateTargets } from "./targets";

/** Biblioteca › Vacaciones. Phase 8 empties this helper. */
export function revalidateVacacionesScreen(): void {
  revalidateTargets({ vacaciones: ["/biblioteca/vacaciones"] } as const);
}

/** Biblioteca (⚠ `/recursos` only redirects). Phase 8 empties this helper. */
export function revalidateBibliotecaScreen(): void {
  revalidateTargets({ recursos: ["/recursos"] } as const);
}
