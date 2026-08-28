/**
 * Clients data access.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/clients-actions.ts` (Drizzle + session authz). This module keeps
 * its historical function names/signatures so existing callers don't change.
 *
 * TODO(phase-2 clients RSC): `getClientsSnapshot()` returns `[]` — pages should
 * move to Server Components that pass `initialData` instead of relying on a
 * synchronous snapshot.
 */
import {
  fetchClientsAction,
  saveClientsAction,
  deleteClientAction,
} from "@/lib/actions/clients-actions";

/** @deprecated dead key kept so optimistic `writeStorage` calls still compile. */
export const MANUAL_CLIENTS_STORAGE_KEY = "cincel.clients.manual.v1";

export type ManualClient = {
  id: number;
  name: string;
  emails: string[];
  phone: string;
  kind: "Empresa" | "Particular";
  contacts: Array<{
    name: string;
    role: string;
    phone: string;
    email: string;
  }>;
  completedProjects: string[];
  acquisitionChannel: string;
  totalSpent: number;
  hasActiveProject: boolean;
  projectName: string;
  projectType: string;
  totalProjectsWorked: number;
  firstWorkDate: string;
};

export function getClientsSnapshot(): ManualClient[] {
  return [];
}

export async function fetchClients(): Promise<ManualClient[]> {
  return fetchClientsAction();
}

export async function saveClients(clients: ManualClient[]): Promise<void> {
  await saveClientsAction(clients);
}

export async function deleteClientAndLinkedProjects(
  clientLegacyId: number,
  linkedProjectLegacyIds: number[]
): Promise<void> {
  await deleteClientAction(clientLegacyId, linkedProjectLegacyIds);
}
