import "server-only";

import { revalidateTargets, type ScreenTarget } from "./targets";

/**
 * Ajustes, one target per segment so each Phase 9 split empties only its own.
 * The `/configuracion/*` routes only redirect (⚠) but still re-render the
 * current route, so they stay until their segment migrates.
 */
const AJUSTES_TARGETS = {
  perfil: ["/ajustes/perfil"],
  horario: ["/ajustes/horario"],
  integraciones: ["/ajustes/integraciones"],
  notificaciones: ["/ajustes/notificaciones"],
  puestos: ["/configuracion/puestos"],
  estatus: ["/configuracion/estatus"],
  tramos: ["/configuracion/tramos"],
  workflows: ["/configuracion/workflows"],
  google: ["/configuracion/google"],
  "importar-monday": ["/configuracion/importar-monday"],
} as const satisfies Record<string, ScreenTarget>;

export type AjustesScreenSegment = keyof typeof AJUSTES_TARGETS;

/** Revalidates one Ajustes segment. */
export function revalidateAjustesScreen(seg: AjustesScreenSegment): void {
  revalidateTargets(AJUSTES_TARGETS, [seg]);
}
