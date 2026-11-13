/**
 * Shared fixture for `StatusChip` and `EtapaBadge` (redesign FE §4.10.1): the
 * same statuses and etapas render in Visual, Esencial and Analítico.
 */
import type { WorkflowRef } from "@/lib/types/core";
import type { TaskStatusRef } from "@/lib/types/redesign";

export const STATUS_FIXTURE = {
  pendiente: { status: "pendiente", customStatus: null },
  enProceso: { status: "en_proceso", customStatus: null },
  completado: { status: "completado", customStatus: null },
  bloqueado: { status: "bloqueado", customStatus: null },
  /** Custom status that does not close: keeps the color of its stored base status. */
  enRevision: {
    status: "en_proceso",
    customStatus: { id: "cs-revision", name: "En revisión", closes: false, countsAsCompleted: false },
  },
  /** Custom status that closes: reads as Completado. */
  entregado: {
    status: "completado",
    customStatus: { id: "cs-entregado", name: "Entregado", closes: true, countsAsCompleted: true },
  },
} satisfies Record<string, TaskStatusRef>;

/** Expected `{ label, token }` per fixture entry. */
export const STATUS_EXPECTED: Record<keyof typeof STATUS_FIXTURE, { label: string; token: string }> = {
  pendiente: { label: "Pendiente", token: "chart-3" },
  enProceso: { label: "En proceso", token: "chart-2" },
  completado: { label: "Completado", token: "chart-1" },
  bloqueado: { label: "Bloqueado", token: "destructive" },
  enRevision: { label: "En revisión", token: "chart-2" },
  entregado: { label: "Entregado", token: "chart-1" },
};

export const ETAPA_FIXTURE = {
  presale: { id: "wf-presale", key: "presale", name: "Presale", sortOrder: 1 },
  diseno: { id: "wf-diseno", key: "diseno", name: "Diseño", sortOrder: 2 },
  construccion: { id: "wf-construccion", key: "construccion", name: "Construcción", sortOrder: 3 },
  decoracion: { id: "wf-decoracion", key: "decoracion", name: "Decoración", sortOrder: 4 },
  /** An etapa outside the known four: own name, neutral color. */
  otro: { id: "wf-otro", key: "mantenimiento", name: "Mantenimiento", sortOrder: 9 },
} satisfies Record<string, WorkflowRef>;

/** Expected label and color slot per fixture etapa. */
export const ETAPA_EXPECTED: Record<keyof typeof ETAPA_FIXTURE, { label: string; slot: number | null }> = {
  presale: { label: "Presale", slot: 1 },
  diseno: { label: "Diseño", slot: 2 },
  construccion: { label: "Construcción", slot: 3 },
  decoracion: { label: "Decoración", slot: 4 },
  otro: { label: "Mantenimiento", slot: null },
};
