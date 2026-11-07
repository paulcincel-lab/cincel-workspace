"use server";

import { stubDefault } from "@/lib/stubs";
import type { PeopleOverviewRow, PersonaDetail } from "@/lib/types/redesign";

/**
 * Personas aggregates (redesign BE §7.11). Auth: `team.canViewTeam`; hours only
 * for `canViewTeamHours` or self; admin tasks only with `canSeeAdminData`.
 */

/** Errors: `NOT_FOUND` (the stub has no data, so every id is not found). */
export async function fetchPersonaDetailAction(staffId: string): Promise<PersonaDetail> {
  void staffId;
  throw new Error("NOT_FOUND");
}

/** One row per active staff member. */
export async function fetchPeopleOverviewAction(): Promise<PeopleOverviewRow[]> {
  return stubDefault<PeopleOverviewRow[]>([]);
}
