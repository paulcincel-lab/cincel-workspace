/**
 * Providers data access — contractors, external collaborators, stores.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/providers-actions.ts` (Drizzle + session authz). This module
 * keeps its historical function names/signatures so the proveedores pages
 * don't change.
 *
 * No localStorage: `get*Snapshot()` returns the built-in mock set only as a
 * pre-hydration seed; the proveedores pages hydrate via `fetch*()`.
 */
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

// ── Contractors ────────────────────────────────────────────────────────────

export function getContractorsSnapshot(): Contractor[] {
  return baseContractors;
}

export async function fetchContractors(): Promise<Contractor[]> {
  const rows = await fetchContractorsAction();
  return rows;
}

export async function saveContractors(contractors: Contractor[]): Promise<void> {
  await saveContractorsAction(contractors);
}

// ── Collaborator providers ─────────────────────────────────────────────────

export function getColaboradoresSnapshot(): Colaborador[] {
  return baseColaboradores;
}

export async function fetchColaboradores(): Promise<Colaborador[]> {
  const rows = await fetchColaboradoresAction();
  return rows;
}

export async function saveColaboradores(items: Colaborador[]): Promise<void> {
  await saveColaboradoresAction(items);
}

// ── Stores ─────────────────────────────────────────────────────────────────

export function getTiendasSnapshot(): Tienda[] {
  return baseTiendas;
}

export async function fetchTiendas(): Promise<Tienda[]> {
  const rows = await fetchTiendasAction();
  return rows;
}

export async function saveTiendas(items: Tienda[]): Promise<void> {
  await saveTiendasAction(items);
}
