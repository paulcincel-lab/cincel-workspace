"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { setRowsSelected, toggleRowSelection } from "@/components/widgets/table-rows";

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

type Stored = { key: string | undefined; ids: ReadonlySet<string> };

export function useTaskSelection({ visibleIds, resetKey }: UseTaskSelectionOptions): TaskSelection {
  const [stored, setStored] = useState<Stored>({ key: resetKey, ids: NONE });
  const anchor = useRef<string | null>(null);

  // A selection made under other filters reads as empty (no effect needed to clear it).
  const raw = stored.key === resetKey ? stored.ids : NONE;
  const visibleKey = visibleIds.join("\u0000");
  const selectedIds = useMemo<ReadonlySet<string>>(() => {
    if (raw.size === 0) return NONE;
    const visible = new Set(visibleKey === "" ? [] : visibleKey.split("\u0000"));
    const kept = [...raw].filter((id) => visible.has(id));
    return kept.length === raw.size ? raw : new Set(kept);
  }, [raw, visibleKey]);

  const write = useCallback(
    (next: ReadonlySet<string>) => setStored({ key: resetKey, ids: next.size === 0 ? NONE : next }),
    [resetKey],
  );

  const toggle = useCallback(
    (id: string, options?: { range?: boolean }) => {
      write(toggleRowSelection(selectedIds, id, { order: visibleIds, anchor: anchor.current, range: options?.range }));
      anchor.current = id;
    },
    [write, selectedIds, visibleIds],
  );
  const setMany = useCallback(
    (ids: readonly string[], on: boolean) => write(setRowsSelected(selectedIds, ids, on)),
    [write, selectedIds],
  );
  const clear = useCallback(() => {
    anchor.current = null;
    write(NONE);
  }, [write]);

  return useMemo<TaskSelection>(
    () => ({
      selectedIds,
      count: selectedIds.size,
      isSelected: (id) => selectedIds.has(id),
      toggle,
      setMany,
      clear,
      onSelectionChange: write,
    }),
    [selectedIds, toggle, setMany, clear, write],
  );
}
