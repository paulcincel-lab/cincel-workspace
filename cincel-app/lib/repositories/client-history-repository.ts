/**
 * Client interaction history (audit log of field changes).
 *
 * Phase 2: persisted in Postgres (`core.client_history`) via the Server Actions
 * in `lib/actions/client-history-actions.ts`. `getClientHistoryByClientId()`
 * returns `{}` for synchronous first paint — the ficha page hydrates via
 * `fetchClientHistory()`.
 */
import {
  fetchClientHistoryAction,
  appendClientHistoryAction,
  type ClientHistoryInput,
} from "@/lib/actions/client-history-actions";

export type { ClientHistoryInput };

export type ClientHistoryEntry = {
  id: string;
  clientId: number;
  field: string;
  before: string;
  after: string;
  author: string;
  date: string;
};

export function getClientHistoryByClientId(): Record<
  number,
  ClientHistoryEntry[]
> {
  return {};
}

export async function fetchClientHistory(): Promise<
  Record<number, ClientHistoryEntry[]>
> {
  return fetchClientHistoryAction();
}

export async function appendClientHistory(
  clientLegacyId: number,
  entries: ClientHistoryInput[]
): Promise<void> {
  await appendClientHistoryAction(clientLegacyId, entries);
}
