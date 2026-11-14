"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/shadcn/button";
import { useAppearanceStoreApiOrNull } from "@/lib/stores/appearance-store";
import { mutationErrorText } from "@/lib/query/mutation";
import type { RecordColumn } from "@/lib/types/widgets";
import {
  clampWidth,
  columnBounds,
  columnWidthVar,
  effectiveWidth,
  fitWidth,
  hasRememberedWidths,
  stepWidth,
  tableWidths,
  widthVars,
  withoutTableWidths,
  type WidthBounds,
} from "@/lib/ui/table-widths";
import { createWidthsSaver, type WidthsSaver } from "@/lib/ui/table-widths-saver";

/**
 * Resizable columns (#1125). The widths of a table live in CSS variables on
 * its root element (`--cw-<column>` for each column, `--tw` and `--tmin` for
 * the table itself); the `<colgroup>` and the table read them. A drag writes
 * the variables straight on the element, so only the header and the
 * `<colgroup>` change: no row re-renders while the pointer moves. The
 * remembered widths come from the user's preferences (seeded by the layout,
 * per table id) and are saved with a debounced `setTableColumnWidthsAction`.
 *
 * Below `md` (390 px phones) nothing is remembered or shown: the tables keep
 * their default widths and their own horizontal scroll, and no handles render.
 */

export const RESET_WIDTHS_LABEL = "Restablecer anchos";
export const RESIZE_SAVE_ERROR = "No se pudieron guardar los anchos de las columnas.";

/** Handles show from the `md` breakpoint (768 px) up. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function desktopNow(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(DESKTOP_QUERY).matches;
}

const noSubscribe = () => () => undefined;

/** The accessible name of a column's handle. */
export function resizeHandleLabel(column: Pick<RecordColumn, "label">): string {
  return `Ancho de la columna ${column.label}`;
}

export type ColumnResize = {
  /** Handles are shown and widths are remembered (a table id, and a desktop viewport). */
  resizable: boolean;
  /** On the table's root element: the width variables. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Callback ref for the table root, to combine with other owners through `mergeRootRefs`. */
  attachRoot: (el: HTMLDivElement | null) => void;
  rootStyle: CSSProperties;
  /** On every `<table>` of the root: `table-layout: fixed` through the classes, width through the variables. */
  tableStyle: CSSProperties;
  /** True while at least one column of this table has a remembered width. */
  canReset: boolean;
  /** The `<col>`s of a table, in the order of the cells. */
  colgroup(options: { select: boolean; actions: boolean; actionsWidth: number; selectWidth: number }): ReactNode;
  /** The drag handle of a header cell (null when not resizable or for a column that cannot resize). */
  handle(column: RecordColumn): ReactNode;
  /** The "Restablecer anchos" button (null when nothing to reset). */
  resetButton(): ReactNode;
};

type Controller = {
  /** The width in force for a column (null = `auto`), for when the element cannot be measured. */
  width(column: RecordColumn): number | null;
  begin(): void;
  setLive(column: RecordColumn, px: number): void;
  fit(column: RecordColumn): void;
  commit(): void;
};

export function useColumnResize({
  tableId,
  columns,
  extraWidth = 0,
}: {
  tableId?: string;
  columns: RecordColumn[];
  /** Fixed columns outside `columns` (checkbox, row actions), in px. */
  extraWidth?: number;
}): ColumnResize {
  const store = useAppearanceStoreApiOrNull();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopNow, () => true);
  const resizable = tableId !== undefined && desktop;

  const remembered = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    () => (tableId ? store?.getState().preferences.tableColumnWidths?.[tableId] : undefined),
    () => (tableId ? store?.getState().preferences.tableColumnWidths?.[tableId] : undefined),
  );
  const applied = resizable ? remembered : undefined;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const columnsRef = useRef(columns);
  const extraRef = useRef(extraWidth);
  useLayoutEffect(() => {
    columnsRef.current = columns;
    extraRef.current = extraWidth;
  });
  const live = useRef<Record<string, number>>({ ...(applied ?? {}) });
  const dragging = useRef(false);

  const attachRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
  }, []);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const column of columnsRef.current) {
      const px = effectiveWidth(column, live.current);
      root.style.setProperty(columnWidthVar(column.key), px === null ? "auto" : `${px}px`);
    }
    const table = tableWidths(columnsRef.current, live.current, extraRef.current);
    root.style.setProperty("--tw", table.width);
    root.style.setProperty("--tmin", `${table.min}px`);
  }, []);

  // What the preferences say (first render, another tab's save, "Restablecer anchos") wins unless a drag is running.
  useLayoutEffect(() => {
    if (dragging.current) return;
    live.current = { ...(applied ?? {}) };
    paint();
  }, [applied, paint]);

  const confirmed = useRef(remembered);
  const saver = useRef<WidthsSaver | null>(null);
  useEffect(() => {
    if (!tableId) return;
    const instance = createWidthsSaver({
      tableId,
      onSaved: (all) => {
        confirmed.current = all[tableId];
      },
      onError: (error) => {
        toast.error(`${RESIZE_SAVE_ERROR} ${mutationErrorText(error)}`);
        const all = { ...store?.getState().preferences.tableColumnWidths };
        if (confirmed.current) all[tableId] = confirmed.current;
        else delete all[tableId];
        store?.getState().setTableColumnWidths(all);
      },
    });
    saver.current = instance;
    return () => {
      void instance.flush();
      saver.current = null;
    };
  }, [tableId, store]);

  const controller = useMemo<Controller>(
    () => ({
      width: (column) => effectiveWidth(column, live.current),
      begin() {
        dragging.current = true;
      },
      setLive(column, px) {
        live.current = { ...live.current, [column.key]: clampWidth(px, columnBounds(column)) };
        paint();
      },
      fit(column) {
        const root = rootRef.current;
        if (!root) return;
        const bounds = columnBounds(column);
        const tables = Array.from(root.querySelectorAll("table"));
        // Let the column take its natural width: the other columns keep theirs, the layout turns automatic for a moment.
        for (const table of tables) table.style.tableLayout = "auto";
        root.style.setProperty("--tw", "max-content");
        root.style.setProperty("--tmin", "0px");
        root.style.setProperty(columnWidthVar(column.key), "auto");
        let natural = 0;
        for (const th of Array.from(root.querySelectorAll<HTMLElement>("th[data-column-key]"))) {
          if (th.dataset.columnKey === column.key) natural = Math.max(natural, th.getBoundingClientRect().width);
        }
        for (const table of tables) table.style.tableLayout = "";
        live.current = { ...live.current, [column.key]: fitWidth(natural, bounds) };
        paint();
      },
      commit() {
        dragging.current = false;
        if (!tableId) return;
        const next = { ...live.current };
        const all = { ...store?.getState().preferences.tableColumnWidths, [tableId]: next };
        store?.getState().setTableColumnWidths(all);
        saver.current?.schedule(next);
      },
    }),
    [paint, store, tableId],
  );

  const reset = useCallback(() => {
    if (!tableId) return;
    live.current = {};
    paint();
    store?.getState().setTableColumnWidths(withoutTableWidths(store.getState().preferences.tableColumnWidths, tableId));
    saver.current?.schedule(null);
    void saver.current?.flush();
  }, [paint, store, tableId]);

  const rootStyle = useMemo<CSSProperties>(() => {
    const table = tableWidths(columns, applied, extraWidth);
    return { ...widthVars(columns, applied), "--tw": table.width, "--tmin": `${table.min}px` } as CSSProperties;
  }, [columns, applied, extraWidth]);

  const canReset = resizable && hasRememberedWidths(columns, applied);

  return {
    resizable,
    rootRef,
    attachRoot,
    rootStyle,
    tableStyle: { width: "var(--tw)", minWidth: "var(--tmin)" },
    canReset,
    colgroup: ({ select, actions, actionsWidth, selectWidth }) => (
      <colgroup>
        {select ? <col style={{ width: selectWidth }} /> : null}
        {columns.map((column) => (
          <col key={column.key} style={{ width: `var(${columnWidthVar(column.key)})` }} />
        ))}
        {actions ? <col style={{ width: actionsWidth }} /> : null}
      </colgroup>
    ),
    handle: (column) =>
      resizable ? <ResizeHandle key="resize-handle" column={column} controller={controller} /> : null,
    resetButton: () =>
      canReset ? (
        <Button type="button" variant="link" size="sm" onClick={reset}>
          {RESET_WIDTHS_LABEL}
        </Button>
      ) : null,
  };
}

/**
 * The drag handle on the right edge of a header cell: `role="separator"` with
 * its width as the value. Drag with the pointer, double-click to fit the
 * column to its content, Left and Right (16 px) with the keyboard.
 */
function ResizeHandle({ column, controller }: { column: RecordColumn; controller: Controller }) {
  const bounds: WidthBounds = columnBounds(column);
  const ref = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState<number>(bounds.min);
  const start = useRef<{ x: number; width: number } | null>(null);

  // The header cell's real width: follows drags, fits, resets and an `auto` title column.
  useLayoutEffect(() => {
    const th = ref.current?.parentElement;
    if (!th) return;
    const read = () => {
      const measured = Math.round(th.getBoundingClientRect().width);
      setNow(measured > 0 ? measured : (controller.width(column) ?? bounds.min));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(th);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured once per mount; the observer follows later changes
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start.current = { x: event.clientX, width: ref.current?.parentElement?.getBoundingClientRect().width ?? now };
    controller.begin();
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    controller.setLive(column, start.current.width + event.clientX - start.current.x);
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    start.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    controller.commit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = stepWidth(controller.width(column) ?? now, event.key, bounds);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    controller.begin();
    controller.setLive(column, next);
    controller.commit();
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={resizeHandleLabel(column)}
      aria-valuenow={now}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      data-slot="column-resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        controller.begin();
        controller.fit(column);
        controller.commit();
      }}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none items-stretch justify-end outline-none select-none max-md:hidden after:my-1 after:w-px after:bg-border hover:after:bg-foreground focus-visible:after:w-0.5 focus-visible:after:bg-ring"
    />
  );
}

/** One callback ref that fills every given ref or callback with the same element. */
export function mergeRootRefs(
  ...refs: Array<RefObject<HTMLDivElement | null> | ((el: HTMLDivElement | null) => void) | null>
): (el: HTMLDivElement | null) => void {
  return (el) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    }
  };
}
