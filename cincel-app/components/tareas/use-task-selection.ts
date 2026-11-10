"use client";

import { useMemo } from "react";

/**
 * Selected task ids of one task table (#1040), handed to the table as
 * `selectedIds` / `onSelectionChange` and to `BulkActionBar`. Shift-click
 * selects the range from the last toggled row in `visibleIds` order; the
 * selection resets when `resetKey` changes (the filters) and drops ids no
 * longer visible.
 */
export type UseTaskSelectionOptions = {
  /** The ids of the rows shown, in table order (for ranges and "all"). */
  visibleIds: readonly string[];
  /** Changes when the filters change; a new key clears the selection. */
  resetKey?: string;
};

export type TaskSelection = {
  selectedIds: ReadonlySet<string>;
  count: number;
  isSelected(id: string): boolean;
  /** `range`: shift-click, selects from the last toggled id to `id`. */
  toggle(id: string, options?: { range?: boolean }): void;
  /** Selects (or unselects) every id given, e.g. a group's header checkbox. */
  setMany(ids: readonly string[], selected: boolean): void;
  clear(): void;
  /** For a table's controlled `onSelectionChange`. */
  onSelectionChange(ids: ReadonlySet<string>): void;
};

const NONE: ReadonlySet<string> = new Set<string>();

/** Contract stub: always empty, every call a no-op, until the selection lands. */
export function useTaskSelection(options: UseTaskSelectionOptions): TaskSelection {
  void options;
  return useMemo<TaskSelection>(
    () => ({
      selectedIds: NONE,
      count: 0,
      isSelected: () => false,
      toggle: () => undefined,
      setMany: () => undefined,
      clear: () => undefined,
      onSelectionChange: () => undefined,
    }),
    [],
  );
}
