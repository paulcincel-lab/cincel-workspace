/**
 * Project Flow compatibility (redesign BE §9.7, FE §21.2): the only place the
 * redesign touches etapa / fase / admin concepts. Redesign code imports these
 * instead of Project Flow modules.
 *
 * Client-safe: the etapa list comes through Project Flow's server action, so
 * a client component can import the pure helpers without pulling in the DB.
 */
import { cache } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import * as permissions from "@/lib/auth/permissions";
import { isAdministratorRole } from "@/lib/data/roles";
import { fetchEtapasNavAction } from "@/lib/actions/workflows-actions";
import { etapaColorSlot as projectFlowColorSlot, etapaColorVar as projectFlowColorVar } from "@/lib/etapas/etapa-color";
import type { WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

type AdminGate = (user: AuthenticatedUser | null | undefined) => boolean;

/** Without Project Flow's helper, admin data is for the administrator role only. */
const administratorRoleGate: AdminGate = (user) => isAdministratorRole(user?.member.role);

/**
 * Admin-only data gate: Project Flow's `canSeeAdminData` when present, else
 * `isAdministratorRole` on the member's role.
 */
export const canSeeAdminData: AdminGate =
  (permissions as { canSeeAdminData?: AdminGate }).canSeeAdminData ?? administratorRoleGate;

/** Chart slot of the known etapas (Presale, Diseño, Construcción, Decoración → `chart-1..4`). */
export type EtapaColorSlot = 1 | 2 | 3 | 4;

/** Display names of the firm's known etapas, by workflow key. */
const ETAPA_LABELS: Record<string, string> = {
  presale: "Presale",
  diseno: "Diseño",
  construccion: "Construcción",
  decoracion: "Decoración",
};

const normalizeKey = (key: string): string => key.trim().toLowerCase();

const bySortOrder = (a: WorkflowRef, b: WorkflowRef): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");

/**
 * Active etapas from `workflows` rows (keys `presale` / `diseno` /
 * `construccion`), in order. Project Flow's nav read returns active,
 * non-deleted rows; the sort keeps the order stable for equal `sortOrder`.
 * Per-request cache on the server (the nav and the page share one read).
 */
export const listEtapas = cache(async function listEtapas(): Promise<WorkflowRef[]> {
  const rows = await fetchEtapasNavAction();
  return rows
    .filter((row) => row.key.trim() !== "")
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder, colorSlot: row.colorSlot ?? null }))
    .sort(bySortOrder);
});

/**
 * Display name of an etapa key ("Presale", "Diseño", "Construcción"). Any other
 * key is shown capitalized with separators as spaces; an empty key is "".
 */
export function etapaLabel(key: string): string {
  const normalized = normalizeKey(key);
  const known = ETAPA_LABELS[normalized];
  if (known) return known;
  const words = normalized.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** 1–4 for the known etapas (`decoracion` → 4), null otherwise. */
export function etapaColorSlot(key: string): EtapaColorSlot | null {
  // sortOrder 0 is outside every slot, so only the fixed key slots (1–4) match.
  const slot = projectFlowColorSlot({ key, sortOrder: 0 });
  return slot === 1 || slot === 2 || slot === 3 || slot === 4 ? slot : null;
}

/**
 * `var(--chart-N)` for an etapa key (neutral when unknown). With the row's
 * `sortOrder`, an etapa outside the four known keys takes Project Flow's slot
 * for it (sortOrder 1–5 → `chart-N`), as everywhere else.
 */
export function etapaColorVar(key: string, sortOrder?: number): string {
  if (etapaColorSlot(key)) return projectFlowColorVar({ key, sortOrder: 0 });
  return projectFlowColorVar(typeof sortOrder === "number" ? { key, sortOrder } : null);
}

/**
 * Fase name; null while no fase catalog exists. The catalog is the fases the
 * caller already loaded (e.g. the task's etapa fases); without one, or when
 * the id is not in it, there is no fase to name.
 */
export function phaseLabel(phaseId: string, catalog?: readonly WorkflowPhaseRef[] | null): string | null {
  if (!phaseId || !catalog || catalog.length === 0) return null;
  const name = catalog.find((phase) => phase.id === phaseId)?.name.trim();
  return name ? name : null;
}
