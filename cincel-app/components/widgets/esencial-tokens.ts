/**
 * Esencial color helpers (ADR 0005): the CSS colors of the tramo dot and the
 * status dot + ink label used by `EsencialItemRow` and `StatusChip
 * variant="dot"`. Pure; every value is a theme token (`var(--…)`).
 */
import { statusColorToken, statusColorVar } from "@/lib/tasks/status-options";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";
import type { TaskStatusRef } from "@/lib/types/redesign";

/** CSS color of a tramo dot (`var(--chart-N)`); neutral without a tramo. */
export function tramoDot(tramo: WorkflowRef | null): string {
  if (!tramo) return "var(--muted-foreground)";
  return tramoColorVar(tramo.key, tramo.sortOrder);
}

/**
 * Dot color and label ink of a task status: `chart-N` dot with its
 * `chart-N-ink` label; Bloqueado is `destructive` for both.
 */
export function statusTone(status: TaskStatusRef): { dot: string; ink: string } {
  const token = statusColorToken(status);
  const dot = statusColorVar(token);
  return { dot, ink: token === "destructive" ? dot : `var(--${token}-ink)` };
}
