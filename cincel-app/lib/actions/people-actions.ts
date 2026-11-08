"use server";

import { z } from "zod";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveTeamCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadPeopleOverview, loadPersonasDetail } from "@/lib/loaders/personas";
import { listStaff } from "@/lib/repositories/staff-repository";
import type { PeopleOverviewRow, PersonaDetail } from "@/lib/types/redesign";
import { UuidSchema } from "@/lib/validation/project-flow";

/**
 * Personas aggregates (redesign BE §7.11). Auth: `team.canViewTeam`; hours only
 * for `canViewTeamHours` or self; admin tasks only with `canSeeAdminData`. The
 * logic lives in `lib/loaders/personas.ts` (Query Migration 6), which the
 * `/personas` pages also prefetch with.
 */

async function requireTeamViewer(): Promise<AuthenticatedUser> {
  const user = await requireCapabilityUser();
  if (!resolveTeamCapabilities(user).canViewTeam) throw new Error("FORBIDDEN");
  return user;
}

const PersonaDetailInput = z.object({ staffId: UuidSchema });

/**
 * `qk.personas.detail(staffId)`. FORBIDDEN without `team.canViewTeam`; null
 * for an id that is not a UUID or an unknown or deleted person. What a viewer
 * sees of another person follows `canSeeAdminData` / `canViewTeamHours`.
 */
export async function fetchPersonaDetailAction(input: z.input<typeof PersonaDetailInput>): Promise<PersonaDetail | null> {
  const user = await requireTeamViewer();
  const parsed = PersonaDetailInput.safeParse(input);
  if (!parsed.success) return null;
  return loadPersonasDetail(user, parsed.data);
}

/** One row per active staff member, from one `listStaff` read. Errors: `FORBIDDEN`. */
export async function fetchPeopleOverviewAction(): Promise<PeopleOverviewRow[]> {
  const user = await requireTeamViewer();
  return loadPeopleOverview(user, await listStaff());
}
