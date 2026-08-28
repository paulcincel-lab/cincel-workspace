/**
 * Team (collaborators) data access.
 *
 * Phase 2: reads/writes go to Postgres via the Server Actions in
 * `lib/actions/team-actions.ts` (Drizzle + session authz). This module keeps its
 * historical function names/signatures so existing callers don't change.
 *
 * Legacy readers (Header, proyectos ficha, PermissionsWorkspace,
 * use-projects-data) still read the `cincel.team.members.v1` localStorage key
 * directly, so `fetchTeamMembers()` / `saveTeamMembers()` mirror the DB result
 * into that key. `getTeamMembersSnapshot()` returns the built-in mock set for
 * synchronous first paint.
 */
import { writeStorage } from "@/lib/repositories/browser-state-repository";
import { teamMembers as baseMockMembers, type TeamMember } from "@/lib/data/team";
import {
  fetchTeamMembersAction,
  saveTeamMembersAction,
} from "@/lib/actions/team-actions";

export type { TeamMember };

export const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";

/**
 * Mirror the full member list into the legacy localStorage key that Header,
 * proyectos ficha, PermissionsWorkspace and use-projects-data still read
 * synchronously. Pass the full array, never a diffed subset.
 */
export function mirrorTeamMembersToStorage(members: TeamMember[]): void {
  if (typeof window !== "undefined" && members.length > 0) {
    writeStorage(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
  }
}

export function getTeamMembersSnapshot(): TeamMember[] {
  return baseMockMembers;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const members = await fetchTeamMembersAction();
  mirrorTeamMembersToStorage(members);
  return members;
}

export async function saveTeamMembers(members: TeamMember[]): Promise<void> {
  // `members` may be a diffed subset — do not mirror it here. Callers mirror
  // their full array separately.
  await saveTeamMembersAction(members);
}
