"use client";

import type { ReactNode } from "react";

/**
 * The bar at the bottom of a table while rows are selected (#1040): "n
 * seleccionadas", the actions, and "Quitar selección". Renders nothing when
 * `count` is 0. Field pickers (Estatus, Responsable, …) go in `children`.
 */
export type BulkBarAction = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect(): void;
};

export type BulkActionBarProps = {
  count: number;
  actions: BulkBarAction[];
  /** "Quitar selección" (and Esc). */
  onClear(): void;
  /** Extra controls after the actions (e.g. a picker popover per field). */
  children?: ReactNode;
};

/** Contract stub: renders nothing until the bar lands. */
export function BulkActionBar(props: BulkActionBarProps): ReactNode {
  void props;
  return null;
}
