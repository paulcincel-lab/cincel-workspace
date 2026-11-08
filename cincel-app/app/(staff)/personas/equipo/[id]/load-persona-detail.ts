import "server-only";

import { IMPLEMENTED } from "@/lib/actions/people-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { actionErrorCode } from "@/lib/errors";
import { loadPersonasDetail } from "@/lib/loaders/personas";
import type { PersonaDetail } from "@/lib/types/redesign";

/** Codes that render the standard not-found state instead of the error boundary. */
const NOT_FOUND_CODES = new Set(["NOT_FOUND", "FORBIDDEN"]);

/**
 * The person's detail for `/personas/equipo/[id]` (the `personas.detail(id)`
 * prefetch), or null when the action is not implemented yet, the person does
 * not exist, or the viewer may not see the team (`team.canViewTeam`). Other
 * errors reach the error boundary.
 */
export async function loadPersonaDetail(user: AuthenticatedUser, staffId: string): Promise<PersonaDetail | null> {
  if (!IMPLEMENTED.fetchPersonaDetailAction) return null;
  try {
    return await loadPersonasDetail(user, { staffId });
  } catch (err) {
    if (NOT_FOUND_CODES.has(actionErrorCode(err))) return null;
    throw err;
  }
}
