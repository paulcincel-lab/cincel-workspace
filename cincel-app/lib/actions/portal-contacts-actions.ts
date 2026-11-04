"use server";

import { resolvePortalCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { listInvitableContacts, type PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Contacts the Invitar cliente sheet offers (FE §2.4). Empty without `portal.manageAccess`. */
export async function listInvitablePortalContactsAction(projectId: string): Promise<PortalInvitableContact[]> {
  if (typeof projectId !== "string" || !UUID_RE.test(projectId)) return [];
  try {
    const user = await requireCapabilityUser();
    if (!resolvePortalCapabilities(user).manageAccess) return [];
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return [];
    throw error;
  }
  return listInvitableContacts(projectId);
}
