"use server";

import type { ActionResult } from "@/lib/types/schedule";
import type {
  MejorasCounts,
  PublishTicketInput,
  TicketFilters,
  TicketMessageInput,
  TicketPatch,
  TicketsPage,
} from "@/lib/types/soporte";

/** Stubs (Soporte Phase 0). Every action requires `canManageSupport`. #1113 implements them; #1116 implements `publishTicketAction`. */

/** Filtered list for Mejoras, cursor paging (50). */
export async function listMejorasAction(_input: TicketFilters & { cursor?: string | null }): Promise<TicketsPage> {
  return { rows: [], nextCursor: null };
}

/** Counts per status and the `nuevo` count for the nav badge. */
export async function mejorasCountsAction(): Promise<MejorasCounts> {
  return {
    byStatus: { nuevo: 0, en_revision: 0, planeado: 0, en_progreso: 0, resuelto: 0, descartado: 0 },
    nuevo: 0,
    total: 0,
  };
}

/** Status, priority and assignee; one event per change. */
export async function updateTicketAction(_id: string, _patch: TicketPatch): Promise<ActionResult<null>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** A public reply or an internal note. */
export async function addTicketMessageAction(_id: string, _input: TicketMessageInput): Promise<ActionResult<null>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** Marks a solicitud as a duplicate of another one. */
export async function markDuplicateAction(_id: string, _ofId: string): Promise<ActionResult<null>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** Publishes a solicitud to GitHub as an RFC issue after admin review. */
export async function publishTicketAction(
  _id: string,
  _input: PublishTicketInput,
): Promise<ActionResult<{ number: number; url: string }>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}
