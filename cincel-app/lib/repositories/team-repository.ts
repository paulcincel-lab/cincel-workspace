/**
 * Team (collaborators) data access.
 *
 * Reads/writes go to Postgres via the Server Actions in
 * `lib/actions/team-actions.ts` (Drizzle + session authz). No localStorage:
 * callers server-render initial data and hydrate via `fetchTeamMembers()`;
 * `getTeamMembersSnapshot()` returns the built-in mock set only as a
 * pre-hydration seed.
 */
import { teamMembers as baseMockMembers, type TeamMember } from "@/lib/data/team";
import {
  fetchTeamMembersAction,
  fetchTeamMembersPublicAction,
  saveTeamMembersAction,
  setTeamMemberCredentialAction,
  type TeamMemberPublicRow,
} from "@/lib/actions/team-actions";

export type { TeamMember, TeamMemberPublicRow };

export function getTeamMembersSnapshot(): TeamMember[] {
  return baseMockMembers;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  return fetchTeamMembersAction();
}

/** PII-free roster — for Header / permissions / assignment dropdowns. */
export async function fetchTeamMembersPublic(): Promise<TeamMemberPublicRow[]> {
  return fetchTeamMembersPublicAction();
}

export async function saveTeamMembers(members: TeamMember[]): Promise<void> {
  await saveTeamMembersAction(members);
}

export async function setTeamMemberCredential(
  legacyId: number,
  options: { enableAccess: boolean; temporaryPassword?: string }
): Promise<void> {
  await setTeamMemberCredentialAction(legacyId, options);
}
