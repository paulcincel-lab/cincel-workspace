"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";

import type { CellEditState } from "@/components/widgets/editable-cell";

/**
 * Keyboard grid of an editable table (#1024): the table is one tab stop
 * (roving tabindex over its `[data-grid-cell]` elements), arrows move between
 * cells (rows without cells, such as group headers and "Cargar más", are
 * skipped), Enter / F2 open the editor, a letter opens a list editor with that
 * letter in its search, Supr / Backspace clears a clearable cell and ⌘/Ctrl +
 * Enter follows the cell's open link. In a table with row delete
 * (`onRowDelete`, #1041) the row handles Supr first and opens the delete
 * confirmation instead, so there only Backspace clears a cell. After a save the grid keeps focus on the
 * same row id when sorting or regrouping re-renders the row elsewhere, and a
 * row that lands in another group scrolls into view and flashes once.
 *
 * The tables only render cell attributes (`cellProps`) and the classes of
 * `GRID_CELL_CLASS`; each `EditableCell` registers how it opens and clears.
 */

/** What an `EditableCell` exposes to the grid. */
export type CellHandle = {
  /** Opens the editor (or closes it when `toggle` and it is open). */
  open(options?: { initialQuery?: string; toggle?: boolean }): void;
  /** Supr / Backspace (only Backspace in a table with row delete): saves `null` when the column is clearable. */
  clear(): void;
  /** A typed letter opens the editor with that letter in its search (list editors). */
  acceptsLetters: boolean;
};

export type CellGrid = {
  register(rowId: string, columnKey: string, handle: CellHandle): () => void;
  /** Tab from an editor: focus the next editable cell of the row (the same cell when none). */
  moveNext(rowId: string, columnKey: string): void;
  /** Before a save: follow the row (focus, regroup flash) through the re-renders that come next. */
  saving(rowId: string, columnKey: string): void;
};

export const CellGridContext = createContext<CellGrid | null>(null);

export function useCellGridContext(): CellGrid | null {
  return useContext(CellGridContext);
}

/**
 * Classes of a grid cell, static so Tailwind sees them. At rest they add
 * nothing visible: hover on editable cells (soft fill + 1 px inset border),
 * focus / open (2 px primary inset ring), saving (pulse, off under reduced
 * motion) and `cursor: not-allowed` on locked cells.
 */
export const GRID_CELL_CLASS =
  "group/cell relative outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary " +
  "data-[cell-state=editable]:cursor-pointer data-[cell-state=editable]:hover:bg-muted data-[cell-state=editable]:hover:ring-1 data-[cell-state=editable]:hover:ring-inset data-[cell-state=editable]:hover:ring-border " +
  "data-[cell-state=locked]:cursor-not-allowed " +
  "data-[cell-open]:ring-2 data-[cell-open]:ring-inset data-[cell-open]:ring-primary " +
  "data-[cell-saving]:animate-pulse motion-reduce:animate-none";

/** Row class: the regroup flash (`row-new` is off under reduced motion). */
export const GRID_ROW_CLASS = "data-[row-flash]:row-new";

/** Group attribute of a row: a save that changes it flashes the row. */
export const GRID_GROUP_ATTR = "data-grid-group";

const FLASH_MS = 1600;
/** How long after a save the grid follows the row (optimistic patch, then the refetch). */
const TRACK_MS = 8000;
/** Window in which a focus return to the old cell (popover closing) is redirected after Tab. */
const REDIRECT_MS = 600;

const LETTER = /^\p{L}$/u;

function key(rowId: string, columnKey: string): string {
  return `${rowId}\u0000${columnKey}`;
}

function isCell(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.hasAttribute("data-grid-cell");
}

function idsOf(cell: HTMLElement): { row: string; column: string } {
  return { row: cell.dataset.cellRow ?? "", column: cell.dataset.cellColumn ?? "" };
}

function groupOf(cell: HTMLElement): string | null {
  return cell.closest(`[${GRID_GROUP_ATTR}]`)?.getAttribute(GRID_GROUP_ATTR) ?? null;
}

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

type Tracked = { row: string; column: string; group: string | null; until: number };

export type UseCellGrid = {
  /** The wrapper of every table of the grid. */
  rootRef: RefObject<HTMLDivElement | null>;
  api: CellGrid;
  /** Spread on the wrapper. */
  rootProps: {
    ref: RefObject<HTMLDivElement | null>;
    onKeyDown(event: KeyboardEvent<HTMLElement>): void;
    onFocus(event: FocusEvent<HTMLElement>): void;
  };
  /** Spread on each cell (`td`) of a data row. */
  cellProps(
    rowId: string,
    columnKey: string,
    state: CellEditState["state"],
  ): {
    "data-grid-cell": "";
    "data-cell-row": string;
    "data-cell-column": string;
    "data-cell-state": CellEditState["state"];
    tabIndex: number;
    onClick(event: MouseEvent<HTMLElement>): void;
    onClickCapture(event: MouseEvent<HTMLElement>): void;
  };
};

/** True when the click lands on a link or control of the cell's own content. */
function ownTarget(cell: HTMLElement, target: EventTarget | null): { inside: boolean; link: HTMLAnchorElement | null; control: boolean } {
  if (!(target instanceof Node) || !cell.contains(target)) return { inside: false, link: null, control: false };
  const el = target instanceof HTMLElement ? target : target.parentElement;
  const link = el?.closest("a");
  const control = el?.closest("button, input, select, textarea, [role='button'], [role='checkbox']");
  return {
    inside: true,
    link: link && cell.contains(link) ? link : null,
    control: Boolean(control && control !== cell && cell.contains(control)),
  };
}

export function useCellGrid(enabled: boolean): UseCellGrid {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handles = useRef(new Map<string, CellHandle>());
  const active = useRef<{ row: string; column: string } | null>(null);
  const tracked = useRef<Tracked | null>(null);
  const redirect = useRef<{ cell: HTMLElement; until: number } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => {
    const cells = (): HTMLElement[] => {
      const root = rootRef.current;
      if (!root) return [];
      // A table nested in an expanded row (`data-row-detail`, #1042) is its own grid.
      return Array.from(root.querySelectorAll<HTMLElement>("[data-grid-cell]")).filter((cell) => {
        const detail = cell.closest("[data-row-detail]");
        return !detail || !root.contains(detail);
      });
    };

    const find = (row: string, column: string): HTMLElement | undefined =>
      cells().find((cell) => cell.dataset.cellRow === row && cell.dataset.cellColumn === column);

    /** Cells by row, in document order. */
    const rows = (): HTMLElement[][] => {
      const byRow = new Map<Element, HTMLElement[]>();
      for (const cell of cells()) {
        const tr = cell.closest("tr") ?? cell;
        const list = byRow.get(tr);
        if (list) list.push(cell);
        else byRow.set(tr, [cell]);
      }
      return Array.from(byRow.values());
    };

    const activate = (cell: HTMLElement) => {
      for (const other of cells()) if (other !== cell && other.tabIndex !== -1) other.tabIndex = -1;
      cell.tabIndex = 0;
      active.current = idsOf(cell);
    };

    const focusCell = (cell: HTMLElement) => {
      activate(cell);
      cell.focus({ preventScroll: true });
      cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };

    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms);
      timers.current.add(id);
    };

    const flash = (cell: HTMLElement) => {
      const tr = cell.closest("tr");
      if (!tr) return;
      tr.setAttribute("data-row-flash", "");
      later(() => tr.removeAttribute("data-row-flash"), FLASH_MS);
    };

    /** One tab stop, and the saved row followed through re-renders. */
    const sync = () => {
      if (!enabled) return;
      const all = cells();
      if (all.length === 0) return;
      const current = active.current ? find(active.current.row, active.current.column) : undefined;
      const stop = current ?? all[0];
      for (const cell of all) {
        const tabIndex = cell === stop ? 0 : -1;
        if (cell.tabIndex !== tabIndex) cell.tabIndex = tabIndex;
      }
      const t = tracked.current;
      if (!t) return;
      if (Date.now() > t.until) {
        tracked.current = null;
        return;
      }
      const cell = find(t.row, t.column);
      if (!cell) return;
      const following = active.current?.row === t.row;
      if (following && focusLost()) {
        activate(cell);
        cell.focus({ preventScroll: true });
      }
      const group = groupOf(cell);
      if (group !== t.group) {
        t.group = group;
        cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        flash(cell);
      }
    };

    const grid: CellGrid = {
      register(row, column, handle) {
        const k = key(row, column);
        handles.current.set(k, handle);
        return () => {
          if (handles.current.get(k) === handle) handles.current.delete(k);
        };
      },
      moveNext(row, column) {
        const cell = find(row, column);
        if (!cell) return;
        const rowCells = rows().find((list) => list.includes(cell)) ?? [cell];
        const next = rowCells.slice(rowCells.indexOf(cell) + 1).find((other) => other.dataset.cellState === "editable") ?? cell;
        focusCell(next);
        redirect.current = { cell: next, until: Date.now() + REDIRECT_MS };
      },
      saving(row, column) {
        const cell = find(row, column);
        tracked.current = { row, column, group: cell ? groupOf(cell) : null, until: Date.now() + TRACK_MS };
        // The optimistic patch or the refetch re-renders the table; check once more after it.
        later(sync, 0);
        later(sync, 300);
      },
    };

    const handleOf = (cell: HTMLElement) => {
      const { row, column } = idsOf(cell);
      return handles.current.get(key(row, column));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      const cell = event.target;
      // Keys typed in an editor (a portal) bubble here through React; only the cells' own keys count.
      if (!enabled || !isCell(cell)) return;
      const grid2d = rows();
      const r = grid2d.findIndex((list) => list.includes(cell));
      if (r === -1) return;
      const rowCells = grid2d[r];
      const c = rowCells.indexOf(cell);
      const column = cell.dataset.cellColumn;
      const sameColumn = (list: HTMLElement[]) =>
        list.find((other) => other.dataset.cellColumn === column) ?? list[Math.min(c, list.length - 1)];
      const ctrl = event.metaKey || event.ctrlKey;
      let target: HTMLElement | undefined;
      switch (event.key) {
        case "ArrowRight":
          target = rowCells[c + 1];
          break;
        case "ArrowLeft":
          target = rowCells[c - 1];
          break;
        case "ArrowDown":
          target = grid2d[r + 1] ? sameColumn(grid2d[r + 1]) : undefined;
          break;
        case "ArrowUp":
          target = grid2d[r - 1] ? sameColumn(grid2d[r - 1]) : undefined;
          break;
        case "Home":
          target = ctrl ? grid2d[0]?.[0] : rowCells[0];
          break;
        case "End":
          target = ctrl ? grid2d.at(-1)?.at(-1) : rowCells.at(-1);
          break;
        case "Enter":
        case "F2": {
          event.preventDefault();
          if (ctrl && event.key === "Enter") {
            (cell.querySelector<HTMLAnchorElement>("a[data-cell-open]") ?? cell.querySelector<HTMLAnchorElement>("a[href]"))?.click();
            return;
          }
          handleOf(cell)?.open();
          return;
        }
        case "Delete":
        case "Backspace": {
          const handle = handleOf(cell);
          if (!handle) return;
          event.preventDefault();
          handle.clear();
          return;
        }
        default: {
          if (ctrl || event.altKey || !LETTER.test(event.key)) return;
          const handle = handleOf(cell);
          if (!handle?.acceptsLetters) return;
          event.preventDefault();
          handle.open({ initialQuery: event.key });
          return;
        }
      }
      if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") event.preventDefault();
      if (target) focusCell(target);
    };

    const onFocus = (event: FocusEvent<HTMLElement>) => {
      if (!enabled || !isCell(event.target)) return;
      const pending = redirect.current;
      if (pending && pending.cell !== event.target && Date.now() < pending.until && pending.cell.isConnected) {
        // The editor closed and handed focus back to its old cell after Tab moved on.
        redirect.current = null;
        activate(pending.cell);
        pending.cell.focus({ preventScroll: true });
        return;
      }
      activate(event.target);
    };

    const cellProps: UseCellGrid["cellProps"] = (rowId, columnKey, state) => ({
      "data-grid-cell": "",
      "data-cell-row": rowId,
      "data-cell-column": columnKey,
      "data-cell-state": state,
      tabIndex: -1,
      onClickCapture(event) {
        if (state === "inert") return;
        const { inside, link } = ownTarget(event.currentTarget, event.target);
        // A plain click on the content's link edits the cell; ⌘/Ctrl/Shift-click and the open icon follow it.
        if (!inside || !link || link.hasAttribute("data-cell-open")) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
      },
      onClick(event) {
        if (state === "inert") return;
        // Editable cells never trigger the row's own click (onRowClick), editor clicks included.
        event.stopPropagation();
        const { inside, link, control } = ownTarget(event.currentTarget, event.target);
        if (!inside || control || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (link?.hasAttribute("data-cell-open")) return;
        const cell = event.currentTarget;
        activate(cell);
        handleOf(cell)?.open({ toggle: true });
      },
    });

    return { grid, sync, onKeyDown, onFocus, cellProps };
  }, [enabled]);

  // Every render of the table: one tab stop, and follow the saved row.
  useLayoutEffect(() => {
    api.sync();
  });

  return {
    rootRef,
    api: api.grid,
    rootProps: { ref: rootRef, onKeyDown: api.onKeyDown, onFocus: api.onFocus },
    cellProps: api.cellProps,
  };
}
