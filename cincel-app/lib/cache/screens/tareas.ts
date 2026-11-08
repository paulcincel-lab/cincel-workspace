import "server-only";

import { revalidateTargets } from "./targets";

/**
 * Tareas and the redirect-only routes it replaced (⚠ `/tablero`,
 * `/calendario`, `/mis-tareas`, the `/actividades` layout). Every one of these
 * calls still re-renders the current route into the action response and
 * clears the client router cache, so none may be dropped until Phase 4 adds
 * the TanStack invalidation for Tareas and empties this helper.
 */
const TAREAS_TARGETS = {
  tareas: ["/tareas"],
  tablero: ["/tablero"],
  calendario: ["/calendario"],
  misTareas: ["/mis-tareas"],
  actividadesLayout: ["/actividades", "layout"],
} as const;

export type TareasScreenTarget = keyof typeof TAREAS_TARGETS;

/** Revalidates Tareas: the given targets in that order, or all of them. */
export function revalidateTareasScreen(only?: readonly TareasScreenTarget[]): void {
  revalidateTargets(TAREAS_TARGETS, only);
}
