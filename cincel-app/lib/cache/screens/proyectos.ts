import "server-only";

import { revalidateTargets } from "./targets";

/**
 * Proyectos: one function per screen so each Phase 5 split (5a list, 5b
 * ficha, 5c cronograma, 5d clientes) empties only its own. The list and its
 * `('/proyectos','layout')` target went in 5a (#959): `/proyectos` is the
 * `qk.proyectos.list()` query.
 */
/**
 * The ficha itself reads `qk.proyectos.tab(id,'ficha')` and is no longer
 * revalidated (5b, #960); only the project layout target is left.
 */
function fichaTargets(id: string) {
  return {
    projectLayout: [`/proyectos/${id}`, "layout"],
  } as const;
}

export type ProyectoFichaScreenTarget = keyof ReturnType<typeof fichaTargets>;

/** Revalidates one project's layout: the given targets in that order, or all of them. */
export function revalidateProyectoFichaScreen(id: string, only?: readonly ProyectoFichaScreenTarget[]): void {
  revalidateTargets(fichaTargets(id), only);
}
