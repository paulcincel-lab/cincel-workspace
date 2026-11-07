/**
 * Quantity takeoff calculator (redesign BE §10.3 `quantity_takeoff`): pieces /
 * boxes / sacks for a material over an area, with waste (default 10 %). Pure.
 */
import { notImplemented } from "@/lib/stubs";

export type TakeoffInput = { material: string; area: number; format: string; wastePct?: number };

export type TakeoffResult = { unit: string; quantity: number; withWaste: number; notes: string[] };

export function quantityTakeoff(input: TakeoffInput): TakeoffResult {
  return notImplemented("quantityTakeoff", input);
}
