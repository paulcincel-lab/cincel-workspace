import { getSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";
import { SupabaseOperationError } from "@/lib/supabase/errors";
import { readStorage, writeStorage } from "@/lib/repositories/browser-state-repository";
import { teamMembers as baseMockMembers, type TeamMember } from "@/lib/data/team";

export type { TeamMember };

export const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";

// ── Mappers ──────────────────────────────────────────────────────────────────

type SupabaseTeamMember = {
  id: string;
  legacy_id: number | null;
  name: string;
  birth_date: string | null;
  nationality: string | null;
  phone: string | null;
  institutional_email: string | null;
  address: string | null;
  marital_status: string | null;
  home_phone: string | null;
  personal_email: string | null;
  curp: string | null;
  rfc: string | null;
  emergency_contact: {
    name: string;
    relation: string;
    phone: string;
    address: string;
  } | null;
  role: string | null;
  area: string | null;
  capacity: number;
  availability: string | null;
  active: boolean;
  auth: {
    passwordHash: string;
    authEnabled: boolean;
    mustChangePassword?: boolean;
    passwordUpdatedAt: string | null;
    lastLoginAt: string | null;
  } | null;
};

function mapSupabaseMember(row: SupabaseTeamMember): TeamMember {
  return {
    id: row.legacy_id ?? 0,
    name: row.name,
    birthDate: row.birth_date ?? "",
    nationality: row.nationality ?? "",
    phone: row.phone ?? "",
    institutionalEmail: row.institutional_email ?? "",
    address: row.address ?? "",
    maritalStatus: row.marital_status ?? "",
    homePhone: row.home_phone ?? "",
    personalEmail: row.personal_email ?? "",
    curp: row.curp ?? "",
    rfc: row.rfc ?? "",
    emergencyContact: row.emergency_contact ?? {
      name: "",
      relation: "",
      phone: "",
      address: "",
    },
    role: row.role ?? "",
    area: row.area ?? "",
    capacity: row.capacity,
    availability: row.availability ?? "Disponible",
    active: row.active,
    auth: row.auth ?? undefined,
  };
}

// ── Snapshot (sync) ──────────────────────────────────────────────────────────

export function getTeamMembersSnapshot(): TeamMember[] {
  if (typeof window === "undefined") {
    return baseMockMembers;
  }

  const stored = readStorage(TEAM_MEMBERS_STORAGE_KEY);

  if (!stored) {
    return baseMockMembers;
  }

  try {
    const parsed = JSON.parse(stored) as TeamMember[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : baseMockMembers;
  } catch {
    return baseMockMembers;
  }
}

// ── Fetch (async) ─────────────────────────────────────────────────────────────

type PaginationParams = {
  limit?: number;
  offset?: number;
};

export async function fetchTeamMembers(pagination?: PaginationParams): Promise<TeamMember[]> {
  if (!isSupabaseEnabled()) {
    return getTeamMembersSnapshot();
  }

  const client = getSupabaseClient();

  if (!client) {
    return getTeamMembersSnapshot();
  }

  let query = client
    .schema("core")
    .from("team_members")
    .select(
      `
      id, legacy_id, name, birth_date, nationality, phone, institutional_email,
      address, marital_status, home_phone, personal_email, curp, rfc,
      emergency_contact, role, area, capacity, availability, active, auth
    `
    )
    .is("deleted_at", null)
    .order("name");

  if (pagination?.limit !== undefined && pagination?.offset !== undefined) {
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  } else if (pagination?.limit !== undefined) {
    query = query.limit(pagination.limit);
  }

  const { data, error } = await query;

  if (error || !data) {
    throw new SupabaseOperationError(
      "fetchTeamMembers",
      error?.message ?? "No se recibieron datos de core.team_members"
    );
  }

  const members = (data as unknown as SupabaseTeamMember[]).map(mapSupabaseMember);

  return members;
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveTeamMembers(members: TeamMember[]): Promise<void> {
  if (!isSupabaseEnabled()) {
    if (typeof window !== "undefined") {
      writeStorage(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
    }
    return;
  }

  const client = getSupabaseClient();

  if (!client) {
    if (typeof window !== "undefined") {
      writeStorage(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
    }
    return;
  }

  const rows = members.map((m) => ({
    legacy_id: m.id,
    name: m.name,
    birth_date: m.birthDate || null,
    nationality: m.nationality || null,
    phone: m.phone || null,
    institutional_email: m.institutionalEmail || null,
    address: m.address || null,
    marital_status: m.maritalStatus || null,
    home_phone: m.homePhone || null,
    personal_email: m.personalEmail || null,
    curp: m.curp || null,
    rfc: m.rfc || null,
    emergency_contact: m.emergencyContact ?? null,
    role: m.role || null,
    area: m.area || null,
    capacity: m.capacity,
    availability: m.availability || null,
    active: m.active,
    auth: m.auth ?? null,
  }));

  const { error } = await client
    .schema("core")
    .from("team_members")
    .upsert(rows, { onConflict: "legacy_id" });

  if (error) {
    throw new SupabaseOperationError("saveTeamMembers", error.message);
  }

}
