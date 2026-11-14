/**
 * Soporte repository (stubs). #1109 implements the user-side functions, #1113
 * the admin ones, #1116 and #1117 the GitHub ones. Reads return safe empty
 * defaults; writes return `{ ok: false, error: "NOT_IMPLEMENTED" }`.
 */
import type { ActionResult } from "@/lib/types/schedule";
import type {
  CreateTicketInput,
  MejorasCounts,
  PublishTicketInput,
  TicketDetail,
  TicketFilters,
  TicketMessageInput,
  TicketPatch,
  TicketsPage,
  TicketStatus,
} from "@/lib/types/soporte";

const NOT_IMPLEMENTED = { ok: false, error: "NOT_IMPLEMENTED" } as const;
const EMPTY_PAGE: TicketsPage = { rows: [], nextCursor: null };

/** Who is asking: ownership and the capability are resolved by the action. */
export type TicketViewer = { staffId: string; canManageSupport: boolean };

// ── User side (#1109) ───────────────────────────────────────────────────────

/** Inserts the ticket and its `created` event; returns the generated code. */
export async function createTicket(
  _staffId: string,
  _input: CreateTicketInput & { area: string; appVersion: string },
): Promise<ActionResult<{ id: string; code: string }>> {
  return NOT_IMPLEMENTED;
}

/** The author's own tickets, newest first, cursor paging (20). */
export async function listMyTickets(
  _staffId: string,
  _filters: TicketFilters,
  _cursor: string | null,
): Promise<TicketsPage> {
  return EMPTY_PAGE;
}

/** One ticket for its author or an admin; null when missing or not visible. Authors never get `internal` events. */
export async function getTicket(_viewer: TicketViewer, _id: string): Promise<TicketDetail | null> {
  return null;
}

/** A public reply by the author; reopens `resuelto` within 14 days. */
export async function addAuthorReply(_staffId: string, _id: string, _text: string): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

/** The author withdraws a `nuevo` ticket. */
export async function withdrawTicket(_staffId: string, _id: string): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

/** Staff ids holding `canManageSupport`, for the new-ticket notification. */
export async function listSupportAdminIds(): Promise<string[]> {
  return [];
}

// ── Admin side (#1113) ──────────────────────────────────────────────────────

export async function listMejoras(_filters: TicketFilters, _cursor: string | null): Promise<TicketsPage> {
  return EMPTY_PAGE;
}

export async function getMejorasCounts(): Promise<MejorasCounts> {
  return {
    byStatus: { nuevo: 0, en_revision: 0, planeado: 0, en_progreso: 0, resuelto: 0, descartado: 0 },
    nuevo: 0,
    total: 0,
  };
}

/** Applies the patch; one event per changed field with before/after. */
export async function updateTicket(_actorId: string, _id: string, _patch: TicketPatch): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

export async function addTicketMessage(
  _actorId: string,
  _id: string,
  _input: TicketMessageInput,
): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

export async function markDuplicate(_actorId: string, _id: string, _ofId: string): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

// ── GitHub (#1116, #1117) ───────────────────────────────────────────────────

/** Stores the issue number and URL, writes the `published` event and moves `nuevo`/`en_revision` to `planeado`. */
export async function recordPublished(
  _actorId: string,
  _id: string,
  _issue: { number: number; url: string },
  _input: PublishTicketInput,
): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}

/** Published, not closed tickets that the sync should look at (batches of 50). */
export async function listSyncableTickets(
  _limit: number,
): Promise<{ id: string; githubIssueNumber: number; status: TicketStatus }[]> {
  return [];
}

/** Applies a mapped GitHub state: a `synced` event with a null actor and `github_synced_at`. */
export async function applySyncedStatus(
  _id: string,
  _status: TicketStatus | null,
  _message?: string,
): Promise<ActionResult<null>> {
  return NOT_IMPLEMENTED;
}
