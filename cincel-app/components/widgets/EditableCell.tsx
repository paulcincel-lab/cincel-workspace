"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

import { CellEditor } from "@/components/widgets/CellEditor";
import { sameCellValue, type AnyCellEdit, type CanEdit, type CellValue } from "@/components/widgets/editable-cell";
import { useCellCommit, useCellCommitContext } from "@/components/widgets/use-cell-commit";
import { useCellGridContext, type CellHandle } from "@/components/widgets/use-cell-grid";

/**
 * Wraps one table cell's rendered content (#1024). Adds only hover, focus,
 * saving and locked states and opens `CellEditor`; without `edit` the cell is
 * calculated and renders its children untouched.
 *
 * The cell element itself (the `td` with `data-grid-cell`, see
 * `use-cell-grid`) is the editor's anchor and the focus target; the content
 * keeps its own layout (`display: contents`). Saves go through
 * `useCellCommit` with the nearest `CellCommitProvider`'s query keys and
 * optimistic patch (without one, the save only runs `edit.commit`).
 */
export type EditableCellProps<Row> = {
  row: Row;
  rowId: string;
  columnKey: string;
  edit?: AnyCellEdit<Row>;
  canEdit?: CanEdit<Row>;
  /** Column label, for the toast ("Fase guardado.") and the search placeholder. */
  label?: string;
  children: ReactNode;
};

/** A click on the cell right after the editor closed (its outside press) keeps it closed. */
const REOPEN_GUARD_MS = 250;

export function EditableCell<Row>(props: EditableCellProps<Row>): ReactNode {
  if (!props.edit) return props.children;
  return <Editable {...props} edit={props.edit} />;
}

/** Delete / Backspace on the cell clears it (a people cell clears only from its editor). */
function isClearable<Row>(edit: AnyCellEdit<Row>): boolean {
  return edit.kind !== "text" && edit.kind !== "people" && edit.clearable === true;
}

/** Sets `name` on `el` while `on`, removes it otherwise. */
function flag(el: HTMLElement, name: string, on: boolean, value = "") {
  if (on) el.setAttribute(name, value);
  else el.removeAttribute(name);
}

function Editable<Row>({ row, rowId, columnKey, edit, canEdit, label, children }: EditableCellProps<Row> & { edit: AnyCellEdit<Row> }) {
  const grid = useCellGridContext();
  const saveOptions = useCellCommitContext();
  const commit = useCellCommit<Row>({
    queryKeys: saveOptions?.queryKeys ?? [],
    label: label ?? columnKey,
    apply: saveOptions?.apply,
  });

  const allowed = canEdit ? canEdit(row) : true;
  const locked = allowed !== true;

  const contentRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const closedAt = useRef(0);

  useLayoutEffect(() => {
    const el = contentRef.current;
    setAnchor(el?.closest<HTMLElement>("[data-grid-cell]") ?? el?.parentElement ?? null);
  }, []);

  useEffect(() => {
    if (!anchor) return;
    flag(anchor, "data-cell-open", open);
    flag(anchor, "aria-expanded", open, "true");
    return () => {
      anchor.removeAttribute("data-cell-open");
      anchor.removeAttribute("aria-expanded");
    };
  }, [anchor, open]);

  useEffect(() => {
    if (!anchor) return;
    flag(anchor, "data-cell-saving", commit.pending);
    flag(anchor, "aria-busy", commit.pending, "true");
    return () => {
      anchor.removeAttribute("data-cell-saving");
      anchor.removeAttribute("aria-busy");
    };
  }, [anchor, commit.pending]);

  const save = (value: CellValue) => {
    if (locked || sameCellValue(value, edit.value(row))) return;
    grid?.saving(rowId, columnKey);
    void commit.commit(edit, row, value);
  };

  // The latest state for the handle the grid keeps.
  const latest = useRef({ open, locked, save, edit, row });
  useEffect(() => {
    latest.current = { open, locked, save, edit, row };
  });

  useEffect(() => {
    if (!grid) return;
    const handle: CellHandle = {
      open(options) {
        if (options?.toggle && (latest.current.open || Date.now() - closedAt.current < REOPEN_GUARD_MS)) {
          setOpen(false);
          return;
        }
        setInitialQuery(options?.initialQuery);
        setOpen(true);
      },
      clear() {
        const now = latest.current;
        if (now.locked || !isClearable(now.edit) || now.edit.value(now.row) === null) return;
        now.save(null);
      },
      get acceptsLetters() {
        const now = latest.current;
        return !now.locked && (now.edit.kind === "select" || now.edit.kind === "person" || now.edit.kind === "people");
      },
    };
    return grid.register(rowId, columnKey, handle);
  }, [grid, rowId, columnKey]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    closedAt.current = Date.now();
    setOpen(false);
    setInitialQuery(undefined);
  };

  return (
    <>
      <span ref={contentRef} data-slot="editable-cell" className="contents">
        {children}
      </span>
      {locked ? (
        <Lock
          aria-hidden="true"
          data-slot="cell-lock"
          className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/cell:opacity-70"
        />
      ) : null}
      <CellEditor<Row>
        anchor={anchor}
        edit={edit}
        row={row}
        canEdit={allowed}
        open={open}
        onOpenChange={onOpenChange}
        onCommitted={save}
        onTabNext={() => grid?.moveNext(rowId, columnKey)}
        initialQuery={initialQuery}
        label={label}
      />
    </>
  );
}
