/**
 * Stagger helper for the motion utilities in `app/globals.css` (`anim-in`,
 * `rise`, `grow`, …): every animation there waits `--anim-delay`. Frame
 * values: Esencial cards 40 ms, kanban cards 60 ms per card + 40 ms per
 * column, Resumen sections 60 ms. Pure and client-importable.
 */
import type { CSSProperties } from "react";

/** `{ "--anim-delay": "<min(index, max) × stepMs>ms" }` for the item at `index`. */
export function staggerStyle(index: number, stepMs = 40, max = 10): CSSProperties {
  const steps = Math.max(0, Math.min(index, max));
  return { "--anim-delay": `${steps * stepMs}ms` } as CSSProperties;
}
