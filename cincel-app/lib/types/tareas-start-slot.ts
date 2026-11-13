import type { EtapaBoard } from "@/lib/types/core";

/**
 * A staff member the Iniciar etapa sheet offers as a fase manager: active
 * staff only, `name` is nombre + apellido, `suggested` when a puesto of theirs
 * covers a fase of the etapa. Never the full `Staff` row.
 */
export type StartSlotCandidate = { id: string; name: string; suggested: boolean };

/**
 * `qk.tareas.startSlot(etapaId)` (Query Migration 4d, #958): the Tareas ·
 * Lista start slot of one etapa ("Listos para iniciar", "Próximos") and what
 * the Iniciar etapa sheet needs. `canStart` is `activities.canCreateActivity`.
 */
export type TareasStartSlotData = {
  board: EtapaBoard;
  candidates: StartSlotCandidate[];
  canStart: boolean;
};
