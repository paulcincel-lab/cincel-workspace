/**
 * Project Flow compatibility (redesign BE §9.7, FE §21.2): the only place the
 * redesign touches tramo / fase / admin concepts. Redesign code imports these
 * instead of Project Flow modules.
 *
 * Client-safe: the tramo list comes through Project Flow's server action, so
 * a client component can import the pure helpers without pulling in the DB.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import * as permissions from "@/lib/auth/permissions";
import { isAdministratorRole } from "@/lib/data/roles";
import { fetchTramosNavAction } from "@/lib/actions/workflows-actions";
import { tramoColorSlot as projectFlowColorSlot, tramoColorVar as projectFlowColorVar } from "@/lib/tramos/tramo-color";
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

/** Chart slot of the three tramos (Presale, Diseño, Construcción → `chart-1..3`). */
export type TramoColorSlot = 1 | 2 | 3;

/** Display names of the firm's known tramos, by workflow key. */
const TRAMO_LABELS: Record<string, string> = {
  presale: "Presale",
  diseno: "Diseño",
  construccion: "Construcción",
  decoracion: "Decoración",
};

const normalizeKey = (key: string): string => key.trim().toLowerCase();

const bySortOrder = (a: WorkflowRef, b: WorkflowRef): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es");

/**
 * Active tramos from `workflows` rows (keys `presale` / `diseno` /
 * `construccion`), in order. Project Flow's nav read returns active,
 * non-deleted rows; the sort keeps the order stable for equal `sortOrder`.
 */
export async function listTramos(): Promise<WorkflowRef[]> {
  const rows = await fetchTramosNavAction();
  return rows
    .filter((row) => row.key.trim() !== "")
    .map((row) => ({ id: row.id, key: row.key, name: row.name, sortOrder: row.sortOrder }))
    .sort(bySortOrder);
}

/**
 * Display name of a tramo key ("Presale", "Diseño", "Construcción"). Any other
 * key is shown capitalized with separators as spaces; an empty key is "".
 */
export function tramoLabel(key: string): string {
  const normalized = normalizeKey(key);
  const known = TRAMO_LABELS[normalized];
  if (known) return known;
  const words = normalized.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** 1–3 for the known tramos, null otherwise. */
export function tramoColorSlot(key: string): TramoColorSlot | null {
  // sortOrder 0 is outside every slot, so only the fixed key slots (1–3) match.
  const slot = projectFlowColorSlot({ key, sortOrder: 0 });
  return slot === 1 || slot === 2 || slot === 3 ? slot : null;
}

/** `var(--chart-N)` for a tramo key (neutral when unknown). */
export function tramoColorVar(key: string): string {
  return projectFlowColorVar(tramoColorSlot(key) ? { key, sortOrder: 0 } : null);
}

/**
 * Fase name; null while no fase catalog exists. The catalog is the fases the
 * caller already loaded (e.g. the task's tramo fases); without one, or when
 * the id is not in it, there is no fase to name.
 */
export function phaseLabel(phaseId: string, catalog?: readonly WorkflowPhaseRef[] | null): string | null {
  if (!phaseId || !catalog || catalog.length === 0) return null;
  const name = catalog.find((phase) => phase.id === phaseId)?.name.trim();
  return name ? name : null;
}
