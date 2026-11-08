import "server-only";

import { revalidateTargets } from "./targets";

/** Personas and the redirect-only routes it replaced (⚠ `/equipo`, `/directorio`). Phase 6 empties this helper. */
const PERSONAS_TARGETS = {
  personas: ["/personas"],
  equipo: ["/equipo"],
  directorio: ["/directorio"],
} as const;

export type PersonasScreenTarget = keyof typeof PERSONAS_TARGETS;

/** Revalidates Personas: the given targets in that order, or all of them. */
export function revalidatePersonasScreen(only?: readonly PersonasScreenTarget[]): void {
  revalidateTargets(PERSONAS_TARGETS, only);
}
