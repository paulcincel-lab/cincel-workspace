import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { areaMembers, areas, staff, workspaceGroupMappings } from "@/lib/db/schema";
import { OFFICIAL_CINCEL_ROLES, type OfficialCincelRole } from "@/lib/data/roles";
import { DirectoryError, getDirectory, lookupMembership, type DirectoryClient } from "@/lib/google/directory";
import type { WorkspaceDenialReason } from "@/lib/types/workspace-access";

/**
 * Workspace access gate (BE §A.4): Workspace groups decide whether a staff
 * member gets in, which role they have and which áreas they belong to.
 *
 * `evaluateAccess()` only reads (mappings from the DB, status and membership
 * from the Directory API). `applyAccess()` writes an allowed result to the
 * staff row. The sign-in callback and the periodic re-check (§A.5) both use
 * them; staff-row checks (`inactive`, `sub_mismatch`, `needs_link`) belong to
 * the callback, not here.
 */

/** Reasons `evaluateAccess()` itself can return. */
export type WorkspaceAccessDenialReason = Extract<
  WorkspaceDenialReason,
  "no_role_group" | "workspace_suspended" | "workspace_deleted" | "domain"
>;

export type WorkspaceAccessGranted = {
  allowed: true;
  role: OfficialCincelRole;
  /** Áreas from matched area groups. Only applied when `areasManaged` is true. */
  areaIds: string[];
  /**
   * True when at least one area mapping (on a non-deleted área) exists. Only
   * then does `applyAccess()` replace the staff member's áreas.
   */
  areasManaged: boolean;
  reason: null;
};

export type WorkspaceAccessDenied = {
  allowed: false;
  role: null;
  areaIds: [];
  areasManaged: false;
  reason: WorkspaceAccessDenialReason;
};

export type WorkspaceAccessResult = WorkspaceAccessGranted | WorkspaceAccessDenied;

export type RoleGroupMapping = { groupId: string; role: string; rank: number };
export type AreaGroupMapping = { groupId: string; areaId: string };
export type GroupMappings = { roles: RoleGroupMapping[]; areas: AreaGroupMapping[] };

export type EvaluateAccessOptions = {
  /** Defaults to `getDirectory()` (the fake with `GOOGLE_FAKE=1`). */
  directory?: DirectoryClient | null;
  /** Defaults to `loadGroupMappings()`. */
  mappings?: GroupMappings;
  /** Defaults to `GOOGLE_WORKSPACE_DOMAIN`. */
  workspaceDomain?: string | null;
};

const OFFICIAL_ROLES: readonly string[] = OFFICIAL_CINCEL_ROLES;

function deny(reason: WorkspaceAccessDenialReason): WorkspaceAccessDenied {
  return { allowed: false, role: null, areaIds: [], areasManaged: false, reason };
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1
    ? ""
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/**
 * Role and area group mappings. Role mappings with a role outside
 * `OFFICIAL_CINCEL_ROLES` and area mappings on soft-deleted áreas are ignored.
 */
export async function loadGroupMappings(): Promise<GroupMappings> {
  const rows = await db
    .select({
      groupId: workspaceGroupMappings.groupId,
      kind: workspaceGroupMappings.kind,
      role: workspaceGroupMappings.role,
      rank: workspaceGroupMappings.rank,
      areaId: workspaceGroupMappings.areaId,
      areaDeletedAt: areas.deletedAt,
    })
    .from(workspaceGroupMappings)
    .leftJoin(areas, eq(areas.id, workspaceGroupMappings.areaId));

  const mappings: GroupMappings = { roles: [], areas: [] };
  for (const row of rows) {
    if (row.kind === "role") {
      if (row.role && OFFICIAL_ROLES.includes(row.role)) {
        mappings.roles.push({ groupId: row.groupId, role: row.role, rank: row.rank });
      }
    } else if (row.areaId && row.areaDeletedAt === null) {
      mappings.areas.push({ groupId: row.groupId, areaId: row.areaId });
    }
  }
  return mappings;
}

/**
 * Decides access for a Google account from its Workspace status and groups.
 *
 * Order: email outside `GOOGLE_WORKSPACE_DOMAIN` → `domain`; user deleted →
 * `workspace_deleted`; suspended or archived → `workspace_suspended`; in no
 * mapped role group → `no_role_group`. Otherwise the highest-rank role wins
 * (ties go to the role listed first in `OFFICIAL_CINCEL_ROLES`) and every
 * matched area group gives its área.
 *
 * Throws `DirectoryError` when the Directory can't be reached or isn't
 * configured: callers treat that as "couldn't verify", never as a denial.
 */
export async function evaluateAccess(
  sub: string,
  email: string,
  options: EvaluateAccessOptions = {},
): Promise<WorkspaceAccessResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = (options.workspaceDomain === undefined ? process.env.GOOGLE_WORKSPACE_DOMAIN : options.workspaceDomain)
    ?.trim()
    .toLowerCase();
  if (!domain || emailDomain(normalizedEmail) !== domain) return deny("domain");

  const directory = options.directory === undefined ? getDirectory() : options.directory;
  if (!directory) throw new DirectoryError("El Directorio de Google no está configurado", "network");

  const mappings = options.mappings ?? (await loadGroupMappings());
  const groupIds = [...new Set([...mappings.roles, ...mappings.areas].map((mapping) => mapping.groupId))];

  const { user, memberGroupIds } = await lookupMembership(directory, sub, normalizedEmail, groupIds);
  if (user.status === "deleted") return deny("workspace_deleted");
  if (user.status !== "active") return deny("workspace_suspended");

  const member = new Set(memberGroupIds);
  const role = mappings.roles
    .filter((mapping) => member.has(mapping.groupId))
    .sort((a, b) => b.rank - a.rank || OFFICIAL_ROLES.indexOf(a.role) - OFFICIAL_ROLES.indexOf(b.role))[0]?.role;
  if (!role) return deny("no_role_group");

  const areaIds = [
    ...new Set(mappings.areas.filter((mapping) => member.has(mapping.groupId)).map((mapping) => mapping.areaId)),
  ];
  return {
    allowed: true,
    role: role as OfficialCincelRole,
    areaIds,
    areasManaged: mappings.areas.length > 0,
    reason: null,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes an allowed result to a staff member: role, `access_checked_at = now`
 * and cleared `access_revoked_*`. Áreas are replaced, not merged, only when
 * `areasManaged`: every `area_members` row of the person (both sources) is
 * deleted and one `workspace` row is inserted per matched área. Otherwise the
 * áreas are left as they are. `area_members.role` is not set.
 *
 * Pass `tx` to run inside the caller's transaction (the sign-in upsert).
 */
export async function applyAccess(staffId: string, result: WorkspaceAccessGranted, tx?: Tx): Promise<void> {
  const write = async (t: Tx) => {
    await t
      .update(staff)
      .set({
        role: result.role,
        accessCheckedAt: new Date(),
        accessRevokedAt: null,
        accessRevokedReason: null,
      })
      .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)));

    if (!result.areasManaged) return;
    await t.delete(areaMembers).where(eq(areaMembers.staffId, staffId));
    if (result.areaIds.length > 0) {
      await t
        .insert(areaMembers)
        .values(result.areaIds.map((areaId) => ({ areaId, staffId, source: "workspace" })))
        .onConflictDoNothing();
    }
  };

  if (tx) await write(tx);
  else await db.transaction(write);
}
