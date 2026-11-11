"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  type AnyCellEdit,
  type CellValue,
  sameCellValue,
  SAVED_TOAST,
  UNDO_LABEL,
  UNDO_MS,
  UNDONE_TOAST,
} from "@/components/widgets/editable-cell";
import { actionErrorText } from "@/lib/errors";
import type { ActionResult } from "@/lib/types/schedule";

export type UseCellCommitOptions<Row> = {
  /** Query keys patched optimistically (`setQueryData`) and invalidated on settle. */
  queryKeys: QueryKey[];
  /** Field name for the toast: "<label> guardado.". */
  label: string;
  /**
   * The cached data with `row` showing `value` (optimistic patch), applied to
   * each of `queryKeys`. Without it the cache is only invalidated on settle.
   * A people cell's list never goes through it: its `commit` patches the
   * caches it knows.
   */
  apply?(cached: unknown, row: Row, value: string | null): unknown;
};

export type CellCommit<Row> = {
  /** Optimistic save of `value` through `edit.commit`; rollback and error toast on failure. */
  commit(edit: AnyCellEdit<Row>, row: Row, value: CellValue): Promise<void>;
  /** Commits the previous value of the last save while its toast shows (Deshacer, ⌘/Ctrl+Z). */
  undo(): void;
  pending: boolean;
};

/** Save options a page gives every editable cell of its tables (query keys + optimistic patch). */
export type CellCommitContextValue = {
  queryKeys: QueryKey[];
  apply?: (cached: unknown, row: unknown, value: string | null) => unknown;
};

const CellCommitContext = createContext<CellCommitContextValue | null>(null);

/**
 * Gives the editable cells under it the page's query keys and optimistic
 * patch. Pages wrap their tables in it; `EditableCell` reads it with
 * `useCellCommitContext()` and passes it to `useCellCommit`.
 */
export function CellCommitProvider<Row>(props: {
  queryKeys: QueryKey[];
  apply?: (cached: unknown, row: Row, value: string | null) => unknown;
  children: ReactNode;
}): ReactNode {
  const { queryKeys, apply, children } = props;
  // Keys are usually written inline; compare them by content so the value stays stable.
  const keysJson = JSON.stringify(queryKeys);
  const value = useMemo<CellCommitContextValue>(
    () => ({
      queryKeys: JSON.parse(keysJson) as QueryKey[],
      apply: apply as CellCommitContextValue["apply"],
    }),
    [keysJson, apply],
  );
  return createElement(CellCommitContext.Provider, { value }, children);
}

/** The nearest `CellCommitProvider`'s options, or null outside one. */
export function useCellCommitContext(): CellCommitContextValue | null {
  return useContext(CellCommitContext);
}

type UndoEntry<Row> = { edit: AnyCellEdit<Row>; row: Row; previous: CellValue; toastId: string | number };

/** `edit.commit` with the value its kind takes (a list for a people cell). */
function runCommit<Row>(edit: AnyCellEdit<Row>, row: Row, value: CellValue): Promise<ActionResult<unknown>> {
  if (edit.kind === "people") return edit.commit(row, Array.isArray(value) ? value : []);
  return edit.commit(row, Array.isArray(value) ? null : value);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Optimistic cell save with a 5 s Deshacer toast (#1023). */
export function useCellCommit<Row>(options: UseCellCommitOptions<Row>): CellCommit<Row> {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [pendingCount, setPendingCount] = useState(0);
  const undoRef = useRef<UndoEntry<Row> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoArmed, setUndoArmed] = useState(false);

  const clearUndo = useCallback(() => {
    undoRef.current = null;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndoArmed(false);
  }, []);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  /** Writes `value` optimistically, saves, rolls back on failure. Resolves to whether it saved. */
  const save = useCallback(
    async (edit: AnyCellEdit<Row>, row: Row, value: CellValue): Promise<boolean> => {
      const { queryKeys, apply } = optionsRef.current;
      setPendingCount((n) => n + 1);
      const snapshot: [QueryKey, unknown][] = [];
      if (apply && !Array.isArray(value)) {
        for (const queryKey of queryKeys) {
          await queryClient.cancelQueries({ queryKey });
          for (const [key, cached] of queryClient.getQueriesData({ queryKey })) {
            if (cached === undefined) continue;
            snapshot.push([key, cached]);
            queryClient.setQueryData(key, apply(cached, row, value));
          }
        }
      }
      let error: unknown = null;
      try {
        const result = await runCommit(edit, row, value);
        if (!result.ok) error = result.error;
      } catch (thrown) {
        error = thrown ?? "";
      }
      if (error !== null) {
        for (const [key, cached] of snapshot) queryClient.setQueryData(key, cached);
        toast.error(actionErrorText(error));
      }
      for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
      setPendingCount((n) => n - 1);
      return error === null;
    },
    [queryClient],
  );

  const undo = useCallback(() => {
    const entry = undoRef.current;
    if (!entry) return;
    clearUndo();
    toast.dismiss(entry.toastId);
    void save(entry.edit, entry.row, entry.previous).then((ok) => {
      if (ok) toast(UNDONE_TOAST);
    });
  }, [clearUndo, save]);

  const commit = useCallback(
    async (edit: AnyCellEdit<Row>, row: Row, value: CellValue) => {
      const previous: CellValue = edit.value(row);
      if (sameCellValue(previous, value)) return;
      // A new save replaces the undo of the last one.
      const last = undoRef.current;
      if (last) toast.dismiss(last.toastId);
      clearUndo();
      const ok = await save(edit, row, value);
      if (!ok) return;
      const toastId = toast(SAVED_TOAST(optionsRef.current.label), {
        duration: UNDO_MS,
        action: { label: UNDO_LABEL, onClick: () => undo() },
      });
      undoRef.current = { edit, row, previous, toastId };
      setUndoArmed(true);
      undoTimer.current = setTimeout(clearUndo, UNDO_MS);
    },
    [clearUndo, save, undo],
  );

  // ⌘/Ctrl+Z undoes the last save while its toast shows (not while typing in a field).
  useEffect(() => {
    if (!undoArmed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoArmed, undo]);

  return useMemo(() => ({ commit, undo, pending: pendingCount > 0 }), [commit, undo, pendingCount]);
}
