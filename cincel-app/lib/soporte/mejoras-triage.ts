/**
 * Pure helpers of the Mejoras triage (#1114): the optimistic row and counts
 * patches, the inverse patch Deshacer sends, the URL state of the filters and
 * the header stats. Client-safe, no server imports.
 */
import {
  TICKET_AREAS,
  TICKET_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type MejorasCounts,
  type TicketArea,
  type TicketFilters,
  type TicketKind,
  type TicketListRow,
  type TicketPatch,
  type TicketPerson,
  type TicketPriority,
  type TicketStatus,
  type TicketsPage,
} from "@/lib/types/soporte";

/** The columns of the board and the groups of the list, in flow order (`descartado` has none). */
export const BOARD_STATUSES = ["nuevo", "en_revision", "planeado", "en_progreso", "resuelto"] as const satisfies readonly TicketStatus[];

/** Statuses an admin can pick in a cell or in bulk; Descartada needs a public reason, so it lives in the detail. */
export const TRIAGE_STATUSES = BOARD_STATUSES;

export function isBoardStatus(status: TicketStatus): boolean {
  return (BOARD_STATUSES as readonly TicketStatus[]).includes(status);
}

/** One row change: the patch to send and what the row looks like afterwards. */
export type TriageChange = {
  id: string;
  patch: TicketPatch;
  /** The person for `patch.assigneeId`, for the optimistic row. */
  assignee?: TicketPerson | null;
};

/** The fields of a row that `patch` changes, as the row will show them. */
export function rowPatchOf(change: TriageChange): Partial<TicketListRow> {
  const next: Partial<TicketListRow> = {};
  const { patch } = change;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.assigneeId !== undefined) next.assignee = patch.assigneeId === null ? null : (change.assignee ?? null);
  return next;
}

/** The change that puts `row` back to what `patch` touched. */
export function inverseChange(row: TicketListRow, change: TriageChange): TriageChange {
  const patch: TicketPatch = {};
  if (change.patch.status !== undefined) patch.status = row.status;
  if (change.patch.priority !== undefined) patch.priority = row.priority;
  if (change.patch.assigneeId !== undefined) patch.assigneeId = row.assignee?.id ?? null;
  return { id: row.id, patch, assignee: row.assignee };
}

/** Whether `patch` changes anything on `row` (a drop on the same column does nothing). */
export function changesRow(row: TicketListRow, patch: TicketPatch): boolean {
  if (patch.status !== undefined && patch.status !== row.status) return true;
  if (patch.priority !== undefined && patch.priority !== row.priority) return true;
  if (patch.assigneeId !== undefined && patch.assigneeId !== (row.assignee?.id ?? null)) return true;
  return false;
}

/** The pages with every row of `changes` patched. */
export function patchPages<P extends { pages: TicketsPage[] }>(data: P, changes: readonly TriageChange[]): P {
  const byId = new Map(changes.map((change) => [change.id, change]));
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      rows: page.rows.map((row) => {
        const change = byId.get(row.id);
        return change ? { ...row, ...rowPatchOf(change) } : row;
      }),
    })),
  };
}

/** The counts after the status moves of `moves` (`from` → `to` per row); other fields do not touch them. */
export function patchCounts(counts: MejorasCounts, moves: readonly { from: TicketStatus; to: TicketStatus }[]): MejorasCounts {
  const byStatus = { ...counts.byStatus };
  for (const { from, to } of moves) {
    if (from === to) continue;
    byStatus[from] = Math.max(0, byStatus[from] - 1);
    byStatus[to] += 1;
  }
  return { ...counts, byStatus, nuevo: byStatus.nuevo };
}

/** Rows of `rows` by status, in the order they came. */
export function groupByStatus(rows: readonly TicketListRow[]): Record<TicketStatus, TicketListRow[]> {
  const groups = Object.fromEntries(TICKET_STATUSES.map((status) => [status, [] as TicketListRow[]])) as Record<
    TicketStatus,
    TicketListRow[]
  >;
  for (const row of rows) groups[row.status].push(row);
  return groups;
}

// ── Header stats ────────────────────────────────────────────────────────────

/** "En curso": the solicitudes someone is already working on. */
export function inProgressCount(counts: MejorasCounts): number {
  return counts.byStatus.en_revision + counts.byStatus.planeado + counts.byStatus.en_progreso;
}

/** "45 min", "6 h", "3 d"; an em dash while there is no first response yet. */
export function formatFirstResponse(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

// ── Filters in the URL ──────────────────────────────────────────────────────

type ParamsLike = { get(name: string): string | null };

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | undefined {
  return raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** `?asignado=sin` is "Sin asignar". */
export const UNASSIGNED_PARAM = "sin";

/** The Mejoras filters of the URL (`estado`, `tipo`, `area`, `prioridad`, `asignado`, `autor`, `q`); unknown values are ignored. */
export function parseMejorasFilters(params: ParamsLike): TicketFilters {
  const filters: TicketFilters = {};
  const status = oneOf(TICKET_STATUSES, params.get("estado"));
  if (status) filters.status = status;
  const kind: TicketKind | undefined = oneOf(TICKET_KINDS, params.get("tipo"));
  if (kind) filters.kind = kind;
  const area: TicketArea | undefined = oneOf(TICKET_AREAS, params.get("area"));
  if (area) filters.area = area;
  const priority: TicketPriority | undefined = oneOf(TICKET_PRIORITIES, params.get("prioridad"));
  if (priority) filters.priority = priority;
  const assignee = params.get("asignado")?.trim();
  if (assignee === UNASSIGNED_PARAM) filters.unassigned = true;
  else if (assignee) filters.assigneeId = assignee;
  const author = params.get("autor")?.trim();
  if (author) filters.authorId = author;
  const q = params.get("q")?.trim();
  if (q) filters.q = q;
  return filters;
}

/** The URL params of `filters`, for `history.replaceState`. */
export function mejorasFilterParams(filters: TicketFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "abiertas" && filters.status !== "cerradas") params.set("estado", filters.status);
  if (filters.kind) params.set("tipo", filters.kind);
  if (filters.area) params.set("area", filters.area);
  if (filters.priority) params.set("prioridad", filters.priority);
  if (filters.unassigned) params.set("asignado", UNASSIGNED_PARAM);
  else if (filters.assigneeId) params.set("asignado", filters.assigneeId);
  if (filters.authorId) params.set("autor", filters.authorId);
  if (filters.q) params.set("q", filters.q);
  return params;
}

/** The filters the board and the grouped list read: everything, newest activity first. */
export const BOARD_FILTERS: TicketFilters = { sort: "updated" };

/** Initials of a person's name for an avatar fallback. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}
