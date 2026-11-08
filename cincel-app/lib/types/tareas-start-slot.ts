import type { TramoBoard } from "@/lib/types/core";

/**
 * A staff member the Iniciar tramo sheet offers as a fase manager: active
 * staff only, `name` is nombre + apellido, `suggested` when a puesto of theirs
 * covers a fase of the tramo. Never the full `Staff` row.
 */
export type StartSlotCandidate = { id: string; name: string; suggested: boolean };

/**
 * `qk.tareas.startSlot(tramoId)` (Query Migration 4d, #958): the Tareas ·
 * Lista start slot of one tramo ("Listos para iniciar", "Próximos") and what
 * the Iniciar tramo sheet needs. `canStart` is `activities.canCreateActivity`.
 */
export type TareasStartSlotData = {
  board: TramoBoard;
  candidates: StartSlotCandidate[];
  canStart: boolean;
};
