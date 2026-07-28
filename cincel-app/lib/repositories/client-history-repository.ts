import { readJsonStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";

export type ClientHistoryEntry = {
  id: string;
  clientId: number;
  field: string;
  before: string;
  after: string;
  author: string;
  date: string;
};

const CLIENT_HISTORY_STORAGE_KEY = "cincel.clients.history.v1";

export function getClientHistoryByClientId(): Record<number, ClientHistoryEntry[]> {
  return readJsonStorage<Record<number, ClientHistoryEntry[]>>(CLIENT_HISTORY_STORAGE_KEY, {});
}

export function saveClientHistoryByClientId(history: Record<number, ClientHistoryEntry[]>): void {
  writeStorage(CLIENT_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function clearClientHistory(): void {
  removeStorage(CLIENT_HISTORY_STORAGE_KEY);
}
