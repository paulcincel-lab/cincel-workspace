import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";

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

// ── Snapshot (sync) ──────────────────────────────────────────────────────────

export function getClientsSnapshot(): ManualClient[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = readStorage(MANUAL_CLIENTS_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as ManualClient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Fetch (async) ─────────────────────────────────────────────────────────────

export async function fetchClients(): Promise<ManualClient[]> {
  if (!isSupabaseEnabled()) {
    return getClientsSnapshot();
  }

  const client = getSupabaseClient();

  if (!client) {
    return getClientsSnapshot();
  }

  const { data, error } = await client
    .schema("core")
    .from("clients")
    .select(
      `
      legacy_id, name, kind, phone, acquisition_channel, total_spent_mxn,
      total_projects_worked, first_work_date, has_active_project,
      active_project_name, active_project_type,
      client_contacts!client_contacts_client_id_fkey (name, role, phone, email, sort_order)
    `
    )
    .is("deleted_at", null)
    .order("name");

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchClients",
      error?.message ?? "No se recibieron datos de core.clients"
    );
  }

  type SupabaseClient = {
    legacy_id: number | null;
    name: string;
    kind: string;
    phone: string | null;
    acquisition_channel: string | null;
    total_spent_mxn: number;
    total_projects_worked: number;
    first_work_date: string | null;
    has_active_project: boolean;
    active_project_name: string | null;
    active_project_type: string | null;
    client_contacts: Array<{
      name: string;
      role: string | null;
      phone: string | null;
      email: string | null;
      sort_order: number;
    }>;
  };

  const clients: ManualClient[] = (data as unknown as SupabaseClient[]).map((row) => {
    const contacts = row.client_contacts
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        name: c.name,
        role: c.role ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
      }));

    const emails = contacts.map((c) => c.email).filter(Boolean);

    return {
      id: row.legacy_id ?? 0,
      name: row.name,
      emails,
      phone: row.phone ?? "",
      kind: row.kind as "Empresa" | "Particular",
      contacts,
      completedProjects: [],
      acquisitionChannel: row.acquisition_channel ?? "",
      totalSpent: row.total_spent_mxn,
      hasActiveProject: row.has_active_project,
      projectName: row.active_project_name ?? "",
      projectType: row.active_project_type ?? "",
      totalProjectsWorked: row.total_projects_worked,
      firstWorkDate: row.first_work_date ?? "",
    };
  });

  return clients;
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveClients(clients: ManualClient[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(MANUAL_CLIENTS_STORAGE_KEY, JSON.stringify(clients));
    }
    return;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    if (typeof window !== "undefined") {
      writeStorage(MANUAL_CLIENTS_STORAGE_KEY, JSON.stringify(clients));
    }
    return;
  }

  const rows = clients.map((c) => ({
    legacy_id: c.id,
    name: c.name,
    kind: c.kind,
    phone: c.phone || null,
    acquisition_channel: c.acquisitionChannel || null,
    total_spent_mxn: c.totalSpent,
    total_projects_worked: c.totalProjectsWorked,
    first_work_date: c.firstWorkDate || null,
    has_active_project: c.hasActiveProject,
    active_project_name: c.projectName || null,
    active_project_type: c.projectType || null,
  }));

  const { error } = await supabase
    .schema("core")
    .from("clients")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveClients", error.message);
  }

  if (typeof window !== "undefined") {
    writeStorage(MANUAL_CLIENTS_STORAGE_KEY, JSON.stringify(clients));
  }

}

export async function deleteClientAndLinkedProjects(
  clientLegacyId: number,
  linkedProjectLegacyIds: number[]
): Promise<void> {
  if (!isSupabaseEnabled()) {
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const deletedAt = new Date().toISOString();

  const { data: clientRow, error: clientLookupError } = await supabase
    .schema("core")
    .from("clients")
    .select("id")
    .eq("legacy_id", clientLegacyId)
    .maybeSingle();

  if (clientLookupError) {
    throw new SupabaseOperationError("deleteClientAndLinkedProjects.clientLookup", clientLookupError.message);
  }

  if (clientRow?.id) {
    const { error: projectsByClientError } = await supabase
      .schema("core")
      .from("projects")
      .update({ deleted_at: deletedAt })
      .eq("client_id", clientRow.id);

    if (projectsByClientError) {
      throw new SupabaseOperationError("deleteClientAndLinkedProjects.projectsByClient", projectsByClientError.message);
    }
  }

  if (linkedProjectLegacyIds.length > 0) {
    const { error: projectsError } = await supabase
      .schema("core")
      .from("projects")
      .update({ deleted_at: deletedAt })
      .in("legacy_id", linkedProjectLegacyIds);

    if (projectsError) {
      throw new SupabaseOperationError("deleteClientAndLinkedProjects.projects", projectsError.message);
    }
  }

  const { error: clientError } = await supabase
    .schema("core")
    .from("clients")
    .update({ deleted_at: deletedAt })
    .eq("legacy_id", clientLegacyId);

  if (clientError) {
    throw new SupabaseOperationError("deleteClientAndLinkedProjects.client", clientError.message);
  }
}
