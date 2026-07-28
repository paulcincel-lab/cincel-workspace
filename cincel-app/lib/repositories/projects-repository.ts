import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { projects as baseProjects } from "@/lib/data/projects";

export type Project = (typeof baseProjects)[number];

export const PROJECTS_STORAGE_KEY = "cincel.projects.data.v1";

// ── Mappers ──────────────────────────────────────────────────────────────────

type SupabaseProject = {
  id: string;
  legacy_id: number | null;
  code: string | null;
  name: string;
  status: string | null;
  active: boolean;
  project_type: string | null;
  stage: string | null;
  phase: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  manager_name: string | null;
  coordinator_name: string | null;
  progress: number;
  start_date: string | null;
  clients: {
    legacy_id: number | null;
    name: string;
    kind: string;
    phone: string | null;
    acquisition_channel: string | null;
    total_spent_mxn: number;
    first_work_date: string | null;
    has_active_project: boolean;
    client_contacts: Array<{
      name: string;
      role: string | null;
      phone: string | null;
      email: string | null;
      sort_order: number;
    }>;
  } | null;
  project_drive_links: Array<{
    administrativo_url: string | null;
    planos_url: string | null;
    renders_url: string | null;
    reportes_url: string | null;
  }>;
  project_members: Array<{ member_name_snapshot: string | null }>;
};

function mapSupabaseProject(row: SupabaseProject): Project {
  const client = row.clients;
  const drive = row.project_drive_links[0] ?? null;
  const team = row.project_members
    .map((m) => m.member_name_snapshot)
    .filter((n): n is string => Boolean(n));

  const contacts = client?.client_contacts
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      name: c.name,
      role: c.role ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    })) ?? [];

  const emails = contacts.map((c) => c.email).filter(Boolean);

  return {
    id: row.legacy_id ?? 0,
    code: row.code ?? "",
    name: row.name,
    active: row.active,
    status: row.status ?? "Activo",
    client: {
      id: client?.legacy_id ?? 0,
      name: client?.name ?? "",
      emails,
      phone: client?.phone ?? "",
      kind: (client?.kind ?? "Particular") as "Empresa" | "Particular",
      contacts,
      completedProjects: [],
      acquisitionChannel: client?.acquisition_channel ?? "",
      totalSpent: client?.total_spent_mxn ?? 0,
    },
    type: row.project_type ?? "",
    stage: row.stage ?? "",
    phase: row.phase ?? "",
    address: {
      street: row.address_street ?? "",
      city: row.address_city ?? "",
      state: row.address_state ?? "",
    },
    manager: row.manager_name ?? "",
    coordinator: row.coordinator_name ?? "",
    team,
    progress: row.progress,
    startDate: row.start_date ?? "",
    drive: {
      administrativo: drive?.administrativo_url ?? "",
      planos: drive?.planos_url ?? "",
      renders: drive?.renders_url ?? "",
      reportes: drive?.reportes_url ?? "",
    },
  };
}

// ── Snapshot (sync, localStorage / mock) ─────────────────────────────────────

export function getProjectsSnapshot(): Project[] {
  if (typeof window === "undefined") {
    return baseProjects;
  }

  const stored = readStorage(PROJECTS_STORAGE_KEY);

  if (!stored) {
    return baseProjects;
  }

  try {
    const parsed = JSON.parse(stored) as Project[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseProjects;
  } catch {
    return baseProjects;
  }
}

// ── Fetch (async, Supabase primary / localStorage solo si no configurado) ────

export async function fetchProjects(): Promise<Project[]> {
  if (!isSupabaseEnabled()) {
    return getProjectsSnapshot();
  }

  const client = getSupabaseClient();

  // Supabase habilitado pero sin credenciales → fallback seguro (no configurado)
  if (!client) {
    return getProjectsSnapshot();
  }

  const { data, error } = await client
    .schema("core")
    .from("projects")
    .select(
      `
      id, legacy_id, code, name, status, active, project_type, stage, phase,
      address_street, address_city, address_state,
      manager_name, coordinator_name, progress, start_date,
      clients!projects_client_id_fkey (
        legacy_id, name, kind, phone, acquisition_channel, total_spent_mxn,
        first_work_date, has_active_project,
        client_contacts!client_contacts_client_id_fkey (name, role, phone, email, sort_order)
      ),
      project_drive_links!project_drive_links_project_id_fkey (
        administrativo_url, planos_url, renders_url, reportes_url
      ),
      project_members!project_members_project_id_fkey (member_name_snapshot)
    `
    )
    .is("deleted_at", null)
    .order("name");

  // Supabase habilitado pero falla → error explícito, sin fallback silencioso
  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchProjects",
      error?.message ?? "No se recibieron datos de core.projects"
    );
  }

  const projects = (data as unknown as SupabaseProject[]).map(mapSupabaseProject);

  return projects;
}

// ── Save (async, Supabase primary / localStorage solo si no configurado) ─────

export async function saveProjects(projects: Project[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    // Supabase deshabilitado → localStorage es la fuente de verdad
    if (typeof window !== "undefined") {
      writeStorage(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    // Sin credenciales → fallback seguro
    if (typeof window !== "undefined") {
      writeStorage(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    }
    return;
  }

  const rows = projects.map((p) => ({
    legacy_id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
    active: p.active,
    project_type: p.type,
    stage: p.stage,
    phase: p.phase,
    address_street: p.address?.street ?? null,
    address_city: p.address?.city ?? null,
    address_state: p.address?.state ?? null,
    manager_name: p.manager,
    coordinator_name: p.coordinator,
    progress: p.progress,
    start_date: p.startDate || null,
  }));

  const { error } = await client
    .schema("core")
    .from("projects")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveProjects", error.message);
  }

  if (typeof window !== "undefined") {
    writeStorage(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }

}
