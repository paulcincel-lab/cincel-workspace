import { setTableColumnWidthsAction } from "@/lib/actions/table-widths-actions";
import { runAction } from "@/lib/query/mutation";
import type { TableColumnWidths } from "@/lib/types/redesign";
import { WIDTHS_SAVE_DEBOUNCE_MS } from "@/lib/ui/table-widths";

export type WidthsSaver = {
  /** Queues the table's widths (`null` = forget them); the save is sent after the debounce. */
  schedule(widths: Record<string, number> | null): void;
  /** Sends what is queued now (unmount, "Restablecer anchos"). Resolves when the call ends. */
  flush(): Promise<void>;
  /** Drops what is queued without sending it (identity change). */
  cancel(): void;
};

type SaverOptions = {
  tableId: string;
  /** What the server confirmed: called with every table's widths after a save. */
  onSaved(all: TableColumnWidths): void;
  /** A failed save. */
  onError(error: unknown): void;
  delayMs?: number;
};

/**
 * The debounced `setTableColumnWidthsAction` of one table (#1125). A drag or a
 * run of keystrokes ends in one save carrying the last widths; a failed save
 * reports through `onError` and leaves the caller to show the confirmed ones.
 */
export function createWidthsSaver({ tableId, onSaved, onError, delayMs = WIDTHS_SAVE_DEBOUNCE_MS }: SaverOptions): WidthsSaver {
  let queued: { widths: Record<string, number> | null } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = async () => {
    clear();
    if (!queued) return;
    const { widths } = queued;
    queued = null;
    try {
      const result = await runAction(setTableColumnWidthsAction, { tableId, widths });
      onSaved(result.tableColumnWidths);
    } catch (error) {
      onError(error);
    }
  };

  return {
    schedule(widths) {
      queued = { widths };
      clear();
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    cancel() {
      clear();
      queued = null;
    },
  };
}
