/**
 * Shared DTOs for the Cronograma de Obra (project schedule) feature. Ids are
 * uuids; dates are ISO YYYY-MM-DD strings. This is a separate domain from
 * the office workflow `Task` in lib/types/task.ts — do not conflate them.
 */

export type ScheduleStatus = "pending" | "progress" | "done";

export interface ScheduleTask {
  id: string;
  stableKey: string;
  legacyId: string | null;
  planta: string;
  seccion: string;
  responsable: string | null;
  inicio: string;
  fin: string;
  tarea: string;
  status: ScheduleStatus;
  flagged: boolean;
}

export interface PaymentRow {
  fecha: string;
  pagadoPct: number;
  avancePct: number;
}

export interface Imprevisto {
  id: string;
  fecha: string;
  texto: string;
}

export interface Adicional {
  partida: string;
  items: string[];
}

export interface CronogramaData {
  project: { id: string; name: string; address: string | null };
  schedule: { id: string; version: number; paymentCalendarLabel: string | null };
  tasks: ScheduleTask[];
  payments: PaymentRow[];
  imprevistos: Imprevisto[];
  adicionales: Adicional[];
}

export type GapStatus = { kind: "onTime" } | { kind: "late" | "ahead"; weeks: number };

export interface ProgressMetrics {
  total: number;
  plannedCount: number;
  plannedPct: number;
  doneCount: number;
  progressCount: number;
  realPct: number;
  pagosAvancePct: number;
  pagosPagadoPct: number;
  onTimePct: number;
  aheadPct: number;
  projectWeeks: number;
  delayVsObra: GapStatus;
  delayVsPagos: GapStatus;
}

export interface SCurvePoint {
  weekStart: string;
  planned: number;
  real: number | null;
  pagos: number;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface NormalizedScheduleTask {
  legacyId: string | null;
  planta: string;
  seccion: string;
  responsable: string | null;
  inicio: string;
  fin: string;
  tarea: string;
  stableKey: string;
}

export interface ImportDiffSummary {
  keptCount: number;
  newCount: number;
  removedCount: number;
  removedTasks: Array<{ stableKey: string; tarea: string }>;
}

export interface LegacyStateApplyResult {
  matchedCount: number;
  unmatchedKeys: string[];
}
