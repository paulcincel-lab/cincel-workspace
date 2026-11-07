import "server-only";

import { notFound, redirect } from "next/navigation";

import type { PersonasContactsProps } from "@/components/personas/PersonasContacts";
import type { PersonasTab } from "@/components/personas/PersonasTabs";
import { fetchContactsAction } from "@/lib/actions/contacts-actions";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { canSeeAdminData, resolveClientsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import {
  PERSONAS_CONTACTS_PATH,
  parseProveedoresSubfilter,
  toPersonasContact,
  type PersonasContactsTab,
} from "@/lib/personas/contacts";
import { countPersonasTabs } from "@/lib/personas/team";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Server loader shared by `/personas/{clientes,contratistas,proveedores}`
 * (redesign FE §3.6, §2.1): flag-off redirect, session, the
 * `clients.canViewClients` route rule (404 otherwise), the contacts from
 * `fetchContactsAction` with admin-only origin data stripped for viewers
 * without `canSeeAdminData`, and the tab counts.
 */
export async function loadPersonasContactsPage(
  tab: PersonasContactsTab,
  searchParams: SearchParams,
): Promise<PersonasContactsProps> {
  await redirectIfRedesignOff(PERSONAS_CONTACTS_PATH[tab], searchParams);

  let user: Awaited<ReturnType<typeof requireCapabilityUser>>;
  try {
    user = await requireCapabilityUser();
  } catch {
    redirect("/login");
  }

  const caps = resolveClientsCapabilities(user);
  if (!caps.canViewClients) notFound();
  const isAdmin = canSeeAdminData(user);

  const [rows, staff] = await Promise.all([
    fetchContactsAction(),
    fetchStaffAction().catch(() => []),
  ]);
  const contacts = rows.map((row) => toPersonasContact(row, { canSeeAdminData: isAdmin }));
  const counts: Record<PersonasTab, number> = countPersonasTabs(staff, rows);

  return {
    tab,
    contacts,
    counts,
    subfilter: tab === "proveedores" ? parseProveedoresSubfilter(searchParams.tipo) : null,
    capabilities: {
      canCreate: caps.canCreateClient,
      canEdit: caps.canEditClient,
      canDelete: caps.canDeleteClient,
      isAdmin,
    },
  };
}
