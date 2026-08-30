"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authCredentials, teamMembers } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import type { TeamMember, TeamMemberAuthStatus } from "@/lib/data/team";

async function requireTeamCapabilities() {
  return resolveTeamCapabilities(await requireCapabilityUser());
}

type EmergencyContact = {
  name: string;
  relation: string;
  phone: string;
  address: string;
};

function toAuthStatus(
  cred: typeof authCredentials.$inferSelect | null | undefined
): TeamMemberAuthStatus | undefined {
  if (!cred) return undefined;
  return {
    authEnabled: cred.authEnabled,
    hasPasswordHash: Boolean(cred.passwordHash),
    mustChangePassword: cred.mustChangePassword,
    passwordUpdatedAt: cred.passwordUpdatedAt?.toISOString() ?? null,
    lastLoginAt: cred.lastLoginAt?.toISOString() ?? null,
  };
}

function toTeamMember(
  row: typeof teamMembers.$inferSelect,
  cred?: typeof authCredentials.$inferSelect | null
): TeamMember {
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
    authStatus: toAuthStatus(cred),
  };
}

export async function fetchTeamMembersAction(): Promise<TeamMember[]> {
  const caps = await requireTeamCapabilities();
  if (!caps.canViewTeam) return [];

  const rows = await db
    .select({ member: teamMembers, cred: authCredentials })
    .from(teamMembers)
    .leftJoin(authCredentials, eq(authCredentials.teamMemberId, teamMembers.id))
    .where(isNull(teamMembers.deletedAt))
    .orderBy(asc(teamMembers.name));

  return rows.map(({ member, cred }) => toTeamMember(member, cred));
}

export type TeamMemberPublicRow = {
  id: number;
  name: string;
  role: string;
  area: string;
  capacity: number;
  availability: string;
  active: boolean;
  institutionalEmail: string;
  phone: string;
};

/**
 * PII-free projection of the roster — no CURP/RFC/address/personal contact.
 * For consumers that only need identity/role (Header, permissions, dropdowns).
 */
export async function fetchTeamMembersPublicAction(): Promise<
  TeamMemberPublicRow[]
> {
  const caps = await requireTeamCapabilities();
  if (!caps.canViewTeam) return [];

  const rows = await db
    .select({
      legacyId: teamMembers.legacyId,
      name: teamMembers.name,
      role: teamMembers.role,
      area: teamMembers.area,
      capacity: teamMembers.capacity,
      availability: teamMembers.availability,
      active: teamMembers.active,
      institutionalEmail: teamMembers.institutionalEmail,
      phone: teamMembers.phone,
    })
    .from(teamMembers)
    .where(isNull(teamMembers.deletedAt))
    .orderBy(asc(teamMembers.name));

  return rows.map((r) => ({
    id: r.legacyId ?? 0,
    name: r.name,
    role: r.role ?? "",
    area: r.area ?? "",
    capacity: r.capacity,
    availability: r.availability ?? "Disponible",
    active: r.active,
    institutionalEmail: r.institutionalEmail ?? "",
    phone: r.phone ?? "",
  }));
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
    };

    await db
      .insert(teamMembers)
      .values({ legacyId: m.id, ...values })
      .onConflictDoUpdate({ target: teamMembers.legacyId, set: values });
  }

  revalidatePath("/equipo");
}

/**
 * Enable/disable a collaborator's system access and, when a temporary
 * password is provided, set new scrypt credentials in `core.auth_credentials`
 * with `must_change_password = true`. Never touches `team_members` directly —
 * that table carries no credential data.
 */
export async function setTeamMemberCredentialAction(
  legacyId: number,
  options: { enableAccess: boolean; temporaryPassword?: string }
): Promise<void> {
  const caps = await requireTeamCapabilities();
  if (!caps.canChangeCollaboratorAccess) {
    throw new Error("FORBIDDEN: collaborator access");
  }

  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.legacyId, legacyId),
  });
  if (!member) throw new Error("Team member not found");

  if (options.temporaryPassword) {
    const { hash, salt } = await hashPassword(options.temporaryPassword);
    await db
      .insert(authCredentials)
      .values({
        teamMemberId: member.id,
        passwordHash: hash,
        salt,
        authEnabled: options.enableAccess,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: authCredentials.teamMemberId,
        set: {
          passwordHash: hash,
          salt,
          authEnabled: options.enableAccess,
          mustChangePassword: true,
          passwordUpdatedAt: new Date(),
        },
      });
  } else {
    await db
      .update(authCredentials)
      .set({ authEnabled: options.enableAccess })
      .where(eq(authCredentials.teamMemberId, member.id));
  }

  revalidatePath("/equipo");
}
