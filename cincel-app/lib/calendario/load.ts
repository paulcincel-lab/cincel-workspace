/** Load and capacity (BE §9). Pure and client-safe. Bodies belong to the Phase 5 issue. */
import { notImplemented } from "@/lib/stubs";
import type { LoadLabel } from "@/lib/types/calendario";

export const DEFAULT_TASK_HOURS = 1;
export const DEFAULT_WORKDAY_HOURS = 6;
export const LOAD_LABEL_COPY: Record<LoadLabel, string> = {
  libre: "Libre",
  bien: "Bien",
  casi_lleno: "Casi lleno",
  sobrecargado: "Sobrecargado",
};

/** Task value, else the template default, else 1 h. */
export function effectiveHours(t: { estimatedHours: number | null; templateHours: number | null }): {
  hours: number;
  source: "task" | "template" | "default";
} {
  return notImplemented("effectiveHours", t);
}

/** weekly / workDays, rounded to 0.5; else the org default. */
export function workdayHours(p: { weeklyCapacityHours: number | null; workDays: number }, orgDefault: number): number {
  return notImplemented("workdayHours", p, orgDefault);
}

/** < 50 % libre, <= 85 % bien, <= 100 % casi lleno, > 100 % sobrecargado. */
export function loadLabel(hours: number, workday: number): LoadLabel {
  return notImplemented("loadLabel", hours, workday);
}

/** Pairs of event ids whose time ranges overlap. */
export function overlaps(events: { id: string; start: string; end: string }[]): [string, string][] {
  return notImplemented("overlaps", events);
}
