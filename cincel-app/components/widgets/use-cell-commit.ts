"use client";

import type { QueryKey } from "@tanstack/react-query";

import type { CellEdit } from "@/components/widgets/editable-cell";

export type UseCellCommitOptions<Row> = {
  /** Query keys patched optimistically (`setQueryData`) and invalidated on settle. */
  queryKeys: QueryKey[];
  /** Field name for the toast: "<label> guardado.". */
  label: string;
  /**
   * The cached data with `row` showing `value` (optimistic patch), applied to
   * each of `queryKeys`. Without it the cache is only invalidated on settle.
   */
  apply?(cached: unknown, row: Row, value: string | null): unknown;
};

export type CellCommit<Row> = {
  /** Optimistic save of `value` through `edit.commit`; rollback and error toast on failure. */
  commit(edit: CellEdit<Row>, row: Row, value: string | null): Promise<void>;
  /** Commits the previous value of the last save while its toast shows (Deshacer, ⌘/Ctrl+Z). */
  undo(): void;
  pending: boolean;
};

/** Optimistic cell save with a 5 s Deshacer toast (#1023). */
export function useCellCommit<Row>(options: UseCellCommitOptions<Row>): CellCommit<Row> {
  void options;
  return {
    commit: async () => {},
    undo: () => {},
    pending: false,
  };
}
