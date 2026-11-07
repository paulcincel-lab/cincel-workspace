import "server-only";

import { fetchPersonaDetailAction } from "@/lib/actions/people-actions";
import { IMPLEMENTED } from "@/lib/actions/people-actions.flags";
import { actionErrorCode } from "@/lib/errors";
import type { PersonaDetail } from "@/lib/types/redesign";

/** Codes that render the standard not-found state instead of the error boundary. */
const NOT_FOUND_CODES = new Set(["NOT_FOUND", "FORBIDDEN"]);

/**
 * The person's detail for `/personas/equipo/[id]`, or null when the action is
 * not implemented yet, the person does not exist, or the viewer may not see
 * the team (`team.canViewTeam`). Other errors reach the error boundary.
 */
export async function loadPersonaDetail(staffId: string): Promise<PersonaDetail | null> {
  if (!IMPLEMENTED.fetchPersonaDetailAction) return null;
  try {
    return await fetchPersonaDetailAction(staffId);
  } catch (err) {
    if (NOT_FOUND_CODES.has(actionErrorCode(err))) return null;
    throw err;
  }
}
