/**
 * Providers data access — contractors, external collaborators, stores.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/providers-actions.ts` (Drizzle + session authz). This module
 * keeps its historical function names/signatures so the proveedores pages
 * don't change.
 *
 * The `cincel.{contractors,colaboradores,tiendas}.data.v2` localStorage keys
 * stay as the first-paint source (`get*Snapshot()`); fetch/save mirror the full
 * list back into them.
 */
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { contractors as baseContractors } from "@/lib/data/contractors";
import { colaboradores as baseColaboradores } from "@/lib/data/colaboradores";
import { tiendas as baseTiendas } from "@/lib/data/tiendas";
import type { Contractor } from "@/lib/types/contractor";
import type { Colaborador } from "@/lib/types/colaborador";
import type { Tienda } from "@/lib/types/tienda";
import {
  fetchContractorsAction,
  saveContractorsAction,
  fetchColaboradoresAction,
  saveColaboradoresAction,
  fetchTiendasAction,
  saveTiendasAction,
} from "@/lib/actions/providers-actions";

export type { Contractor, Colaborador, Tienda };

export const CONTRACTORS_STORAGE_KEY = "cincel.contractors.data.v2";
export const COLABORADORES_STORAGE_KEY = "cincel.colaboradores.data.v2";
export const TIENDAS_STORAGE_KEY = "cincel.tiendas.data.v2";

function snapshot<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  const stored = readStorage(key);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored) as T[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mirror<T>(key: string, list: T[]): void {
  if (typeof window !== "undefined" && list.length > 0) {
    writeStorage(key, JSON.stringify(list));
  }
}

// ── Contractors ────────────────────────────────────────────────────────────

export function getContractorsSnapshot(): Contractor[] {
  return snapshot(CONTRACTORS_STORAGE_KEY, baseContractors);
}

export async function fetchContractors(): Promise<Contractor[]> {
  const rows = await fetchContractorsAction();
  mirror(CONTRACTORS_STORAGE_KEY, rows);
  return rows;
}

export async function saveContractors(contractors: Contractor[]): Promise<void> {
  await saveContractorsAction(contractors);
  mirror(CONTRACTORS_STORAGE_KEY, contractors);
}

// ── Collaborator providers ─────────────────────────────────────────────────

export function getColaboradoresSnapshot(): Colaborador[] {
  return snapshot(COLABORADORES_STORAGE_KEY, baseColaboradores);
}

export async function fetchColaboradores(): Promise<Colaborador[]> {
  const rows = await fetchColaboradoresAction();
  mirror(COLABORADORES_STORAGE_KEY, rows);
  return rows;
}

export async function saveColaboradores(items: Colaborador[]): Promise<void> {
  await saveColaboradoresAction(items);
  mirror(COLABORADORES_STORAGE_KEY, items);
}

// ── Stores ─────────────────────────────────────────────────────────────────

export function getTiendasSnapshot(): Tienda[] {
  return snapshot(TIENDAS_STORAGE_KEY, baseTiendas);
}

export async function fetchTiendas(): Promise<Tienda[]> {
  const rows = await fetchTiendasAction();
  mirror(TIENDAS_STORAGE_KEY, rows);
  return rows;
}

export async function saveTiendas(items: Tienda[]): Promise<void> {
  await saveTiendasAction(items);
  mirror(TIENDAS_STORAGE_KEY, items);
}
