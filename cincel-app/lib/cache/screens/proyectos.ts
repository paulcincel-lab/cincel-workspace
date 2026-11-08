import "server-only";

import { revalidateTargets } from "./targets";

/**
 * Proyectos: the list, and per project the ficha, cronograma and clientes
 * tabs. One function per screen so each Phase 5 split (5a list, 5b ficha,
 * 5c cronograma, 5d clientes) empties only its own.
 */
const LIST_TARGETS = {
  proyectos: ["/proyectos"],
  proyectosLayout: ["/proyectos", "layout"],
} as const;

export type ProyectosListScreenTarget = keyof typeof LIST_TARGETS;

/** Revalidates the project list: the given targets in that order, or all of them. */
export function revalidateProyectosListScreen(only?: readonly ProyectosListScreenTarget[]): void {
  revalidateTargets(LIST_TARGETS, only);
}

function fichaTargets(id: string) {
  return {
    ficha: [`/proyectos/${id}/ficha`],
    projectLayout: [`/proyectos/${id}`, "layout"],
  } as const;
}

export type ProyectoFichaScreenTarget = keyof ReturnType<typeof fichaTargets>;

/** Revalidates one project's ficha (and its layout): the given targets in that order, or all of them. */
export function revalidateProyectoFichaScreen(id: string, only?: readonly ProyectoFichaScreenTarget[]): void {
  revalidateTargets(fichaTargets(id), only);
}

/** Revalidates one project's cronograma tab. */
export function revalidateProyectoCronogramaScreen(id: string): void {
  revalidateTargets({ cronograma: [`/proyectos/${id}/cronograma`] } as const);
}

const CLIENTES_TARGETS = {
  clientes: ["/proyectos/[id]/clientes", "page"],
} as const;

/** Revalidates the clientes tab of every project. */
export function revalidateProyectoClientesScreen(): void {
  revalidateTargets(CLIENTES_TARGETS);
}
