/**
 * Project Flow compatibility (redesign BE §9.7, FE §21.2): the only place the
 * redesign touches tramo / fase / admin concepts. Redesign code imports these
 * instead of Project Flow modules.
 */
import { canSeeAdminData } from "@/lib/auth/permissions";
import { notImplemented } from "@/lib/stubs";
import type { WorkflowRef } from "@/lib/types/core";

export { canSeeAdminData };

/** Chart slot of the three tramos (Presale, Diseño, Construcción → `chart-1..3`). */
export type TramoColorSlot = 1 | 2 | 3;

/** Active tramos from `workflows` rows (keys `presale` / `diseno` / `construccion`), in order. */
export async function listTramos(): Promise<WorkflowRef[]> {
  return notImplemented("listTramos");
}

/** Display name of a tramo key ("Presale", "Diseño", "Construcción"). */
export function tramoLabel(key: string): string {
  return notImplemented("tramoLabel", key);
}

/** 1–3 for the known tramos, null otherwise. */
export function tramoColorSlot(key: string): TramoColorSlot | null {
  return notImplemented("tramoColorSlot", key);
}

/** `var(--chart-N)` for a tramo key (neutral when unknown). */
export function tramoColorVar(key: string): string {
  return notImplemented("tramoColorVar", key);
}

/** Fase name; null while no fase catalog exists. */
export function phaseLabel(phaseId: string): string | null {
  return notImplemented("phaseLabel", phaseId);
}
