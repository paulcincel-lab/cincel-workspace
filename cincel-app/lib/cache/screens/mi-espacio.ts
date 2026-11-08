import "server-only";

import { revalidateTargets } from "./targets";

/** Mi espacio (Bandeja): the page and its layout. Phase 7 empties this helper. */
const MI_ESPACIO_TARGETS = {
  miEspacio: ["/mi-espacio"],
  miEspacioLayout: ["/mi-espacio", "layout"],
} as const;

export type MiEspacioScreenTarget = keyof typeof MI_ESPACIO_TARGETS;

/** Revalidates Mi espacio: the given targets in that order, or all of them. */
export function revalidateMiEspacioScreen(only?: readonly MiEspacioScreenTarget[]): void {
  revalidateTargets(MI_ESPACIO_TARGETS, only);
}
