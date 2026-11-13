import type { ActionResult } from "@/lib/types/schedule";

/**
 * Editable table cells (#1021, #1023): the contract shared by the popover
 * editors (`CellEditor`), the commit hook (`useCellCommit`), the table
 * wrapper (`EditableCell`) and the column types of `GroupedTable`,
 * `RecordTable` and `DataTable`. A column without `edit` is calculated and
 * stays inert; the cell's rendered content never changes at rest.
 */

/** One entry of a select / person list. `value: null` is the "Sin …" entry. */
export type CellOption = {
  value: string | null;
  label: string;
  /** Colour of the dot (a CSS colour or token, e.g. `var(--chart-2)`). */
  color?: string;
  avatar?: { name: string; photoUrl?: string };
};

type Base<Row> = {
  /** The current value: an option value, an ISO date (`YYYY-MM-DD`) or text. */
  value(row: Row): string | null;
  /** Saves `v` (`null` clears). Undo calls it again with the previous value. */
  commit(row: Row, v: string | null): Promise<ActionResult<unknown>>;
};

export type CellEdit<Row> =
  | (Base<Row> & { kind: "select"; options(row: Row): CellOption[]; searchable?: boolean; clearable?: boolean })
  | (Base<Row> & { kind: "person"; options(row: Row): CellOption[]; clearable?: boolean })
  | (Base<Row> & { kind: "date"; quickPicks?: boolean; clearable?: boolean })
  | (Base<Row> & { kind: "text"; required?: boolean })
  /** A decimal number (its value is the text of the number, e.g. "2.5"); out of `min`–`max` shows `rangeError`. */
  | (Base<Row> & {
      kind: "number";
      min: number;
      max: number;
      step?: number;
      clearable?: boolean;
      placeholder?: string;
      rangeError: string;
    });

export type CellEditKind = CellEdit<unknown>["kind"];

/**
 * Multi-select of people (#1038, e.g. a task's equipo de apoyo): a searchable
 * list with checkboxes and avatars; Enter or closing saves. Its value is a
 * list of ids, so it sits beside the single-value kinds of `CellEdit`.
 */
export type PeopleCellEdit<Row> = {
  kind: "people";
  /** The ids currently picked. */
  value(row: Row): string[];
  /** Saves the whole list (`[]` clears). Undo calls it again with the previous list. */
  commit(row: Row, ids: string[]): Promise<ActionResult<unknown>>;
  options(row: Row): CellOption[];
  /** Ids that can't be picked for this row (e.g. its Responsable). */
  exclude?(row: Row): string[];
  /** Shown beside an excluded option ("Ya es responsable"). */
  excludedLabel?: string;
};

/** What a column's `edit` takes: a single-value kind or the people multi-select. */
export type AnyCellEdit<Row> = CellEdit<Row> | PeopleCellEdit<Row>;
export type AnyCellEditKind = AnyCellEdit<unknown>["kind"];

export function isPeopleEdit<Row>(edit: AnyCellEdit<Row> | undefined): edit is PeopleCellEdit<Row> {
  return edit?.kind === "people";
}

/** Avatars a people cell shows at rest before "+n". */
export const PEOPLE_MAX_AVATARS = 3;
/** The overflow after `PEOPLE_MAX_AVATARS` avatars ("+2"). */
export const PEOPLE_OVERFLOW = (n: number): string => `+${n}`;
/** A people cell with nobody picked. */
export const PEOPLE_EMPTY = "—";
/** Keys of the people editor, in its footer. */
export const PEOPLE_HINT = { left: "↑↓ elegir · Espacio marcar · Enter guardar", right: "Esc cerrar" } as const;

/** What a cell saves: one value (`null` clears) or, for a people cell, the whole list. */
export type CellValue = string | null | string[];

/** Same value: lists compare as sets (order and repeats don't count). */
export function sameCellValue(a: CellValue, b: CellValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const left = new Set(a);
    const right = new Set(b);
    return left.size === right.size && [...left].every((id) => right.has(id));
  }
  return a === b;
}

/** true, or the reason shown when the viewer clicks a locked cell */
export type CanEdit<Row> = (row: Row) => true | string;

/** How a cell behaves: calculated (no edit), locked with a reason, or editable. */
export type CellEditState = { state: "inert" } | { state: "locked"; reason: string } | { state: "editable" };

export function cellEditState<Row>(row: Row, edit?: AnyCellEdit<Row>, canEdit?: CanEdit<Row>): CellEditState {
  if (!edit) return { state: "inert" };
  const allowed = canEdit ? canEdit(row) : true;
  return allowed === true ? { state: "editable" } : { state: "locked", reason: allowed };
}

/** List editors show a search box above this many options (person always searches). */
export const SEARCH_MIN_OPTIONS = 5;

// Copy (Spanish, sentence case).
export const SAVED_TOAST = (label: string): string => `${label} guardado.`;
export const UNDO_LABEL = "Deshacer";
export const UNDONE_TOAST = "Cambio deshecho.";
/** How long the toast offers Deshacer (and ⌘/Ctrl+Z undoes), in ms. */
export const UNDO_MS = 5000;
export const EMPTY_TITLE_ERROR = "El título no puede quedar vacío.";
export const SEARCH_PLACEHOLDER = (label: string): string => `Buscar ${label.toLowerCase()}…`;
export const SEARCH_ARIA_LABEL = "Buscar";
export const NO_RESULTS = "Sin resultados";
export const OPEN_TASK_LABEL = "Abrir tarea";

/** Clear entries of the list / date editors. */
export const CLEAR_LABEL = {
  person: "Sin asignar",
  priority: "Sin prioridad",
  phase: "Sin fase",
  space: "Sin espacio",
  date: "Sin fecha",
} as const;

/** Quick picks of the date editor, in order. */
export const DATE_QUICK_PICKS = [
  { id: "today", label: "Hoy" },
  { id: "tomorrow", label: "Mañana" },
  { id: "next-monday", label: "Próximo lunes" },
  { id: "plus-week", label: "+1 semana" },
  { id: "none", label: "Sin fecha" },
] as const;
export type DateQuickPick = (typeof DATE_QUICK_PICKS)[number]["id"];

/** Reasons shown on a locked cell (from `resolveActivitiesCapabilities` and the task / project rules). */
export const LOCK_REASON = {
  /** Not the task's responsable nor an admin (`requireTaskWriter`). */
  taskWriter: "Solo el responsable o un admin puede cambiar esta tarea.",
  /** Tramo change (#1022): admins only. */
  tramo: "Solo un admin puede mover la tarea de etapa.",
  /** Responsable without `canChangeResponsible`. */
  responsible: "Solo un admin puede cambiar el responsable.",
  /** Apoyo (equipo de apoyo, #1038): the same permission as the Responsable. */
  support: "Solo un admin puede cambiar el equipo de apoyo.",
  /** Estatus when `statusScope === "none"`. */
  status: "Tu rol no puede cambiar el estatus de las tareas.",
  /** Fase of a subtask: it inherits the parent's. */
  subtaskPhase: "La fase viene de la tarea principal.",
  /** Admin tasks have no tramo, fase nor espacio. */
  adminTask: "Las tareas de administración no tienen etapa, fase ni espacio.",
  /** Project fields: project admin rules of `updateProjectAction` / `setProjectCurrentTramoAction`. */
  project: "Solo un admin puede cambiar este proyecto.",
} as const;
export type LockReasonKey = keyof typeof LOCK_REASON;

/** A local date as ISO `YYYY-MM-DD` (no timezone shift). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The ISO date a quick pick stands for, counted from `today`; "none" clears (null). */
export function quickPickDate(id: DateQuickPick, today: Date = new Date()): string | null {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (id) {
    case "today":
      break;
    case "tomorrow":
      d.setDate(d.getDate() + 1);
      break;
    case "next-monday":
      // The next Monday after today (a Monday gives the one a week later).
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      break;
    case "plus-week":
      d.setDate(d.getDate() + 7);
      break;
    case "none":
      return null;
  }
  return toIsoDate(d);
}
