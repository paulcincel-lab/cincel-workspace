"use server";

import { revalidatePath } from "next/cache";
import { asc, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { teamMembers } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import type { TeamMember } from "@/lib/data/team";

async function requireTeamCapabilities() {
  return resolveTeamCapabilities(await requireCapabilityUser());
}

type EmergencyContact = {
  name: string;
  relation: string;
  phone: string;
  address: string;
};

function toTeamMember(row: typeof teamMembers.$inferSelect): TeamMember {
  return {
    id: row.legacyId ?? 0,
    name: row.name,
    birthDate: row.birthDate ?? "",
    nationality: row.nationality ?? "",
    phone: row.phone ?? "",
    institutionalEmail: row.institutionalEmail ?? "",
    address: row.address ?? "",
    maritalStatus: row.maritalStatus ?? "",
    homePhone: row.homePhone ?? "",
    personalEmail: row.personalEmail ?? "",
    curp: row.curp ?? "",
    rfc: row.rfc ?? "",
    emergencyContact: (row.emergencyContact as EmergencyContact | null) ?? {
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

export async function fetchTeamMembersAction(): Promise<TeamMember[]> {
  const caps = await requireTeamCapabilities();
  if (!caps.canViewTeam) return [];

  const rows = await db.query.teamMembers.findMany({
    where: isNull(teamMembers.deletedAt),
    orderBy: asc(teamMembers.name),
  });

  return rows.map(toTeamMember);
}

export async function saveTeamMembersAction(list: TeamMember[]): Promise<void> {
  const caps = await requireTeamCapabilities();
  if (
    !caps.canCreateCollaborator &&
    !caps.canEditCollaborator &&
    !caps.canChangeCollaboratorAccess &&
    !caps.canToggleCollaboratorActive
  ) {
    throw new Error("FORBIDDEN: team write");
  }

  for (const m of list) {
    const values = {
      name: m.name,
      birthDate: m.birthDate || null,
      nationality: m.nationality || null,
      phone: m.phone || null,
      institutionalEmail: m.institutionalEmail || null,
      address: m.address || null,
      maritalStatus: m.maritalStatus || null,
      homePhone: m.homePhone || null,
      personalEmail: m.personalEmail || null,
      curp: m.curp || null,
      rfc: m.rfc || null,
      emergencyContact: m.emergencyContact ?? null,
      role: m.role || null,
      area: m.area || null,
      capacity: m.capacity ?? 0,
      availability: m.availability || null,
      active: m.active ?? true,
      auth: m.auth ?? null,
    };

    await db
      .insert(teamMembers)
      .values({ legacyId: m.id, ...values })
      .onConflictDoUpdate({ target: teamMembers.legacyId, set: values });
  }

  revalidatePath("/equipo");
}
