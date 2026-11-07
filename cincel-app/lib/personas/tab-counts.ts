import "server-only";

import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import type { ContactListItem, Staff } from "@/lib/types/core";

import { countPersonasTabs, type PersonasTab } from "./team";

/**
 * Counts of the four Personas tabs (redesign FE §3.6). Each list goes through
 * its own action, so a viewer without `team.canViewTeam` or
 * `clients.canViewClients` gets 0 for those tabs. Pass `staff` when the page
 * already loaded it.
 */
export async function loadPersonasTabCounts(options: { staff?: Staff[] } = {}): Promise<Record<PersonasTab, number>> {
  const [staff, contacts] = await Promise.all([
    options.staff ? Promise.resolve(options.staff) : fetchStaffAction().catch((): Staff[] => []),
    fetchContactsAction().catch((): ContactListItem[] => []),
  ]);
  return countPersonasTabs(staff, contacts);
}
