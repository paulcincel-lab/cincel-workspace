import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contactPeople, contacts, projectContacts, projects } from "@/lib/db/schema";

/**
 * Contacts the Clientes tab can invite (FE §2.4): the project's client plus its
 * `project_contacts` of type `cliente` or `socio`. Empty while the project has
 * no client (BE §8.8). Staff side only.
 */

export type PortalInvitableContact = {
  id: string;
  name: string;
  type: "cliente" | "socio";
  /** The contact's email, else its primary person's; null when neither is set. */
  email: string | null;
  /** True for the project's own client (`projects.client_id`). */
  isProjectClient: boolean;
};

/**
 * One statement (Query Migration 5d, #962): the live project with a client,
 * joined to its client and its linked contacts of type cliente or socio, plus
 * each contact's primary person (at most one per contact) for the email.
 */
export async function listInvitableContacts(projectId: string): Promise<PortalInvitableContact[]> {
  const linked = db
    .select({ contactId: projectContacts.contactId })
    .from(projectContacts)
    .where(eq(projectContacts.projectId, projectId));

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      type: contacts.type,
      email: contacts.email,
      personEmail: contactPeople.email,
      clientId: projects.clientId,
    })
    .from(projects)
    .innerJoin(contacts, or(eq(contacts.id, projects.clientId), inArray(contacts.id, linked)))
    .leftJoin(contactPeople, and(eq(contactPeople.contactId, contacts.id), eq(contactPeople.isPrimary, true)))
    .where(
      and(
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
        // No client yet (project flow): nobody can be invited until one is assigned.
        isNotNull(projects.clientId),
        inArray(contacts.type, ["cliente", "socio"]),
        isNull(contacts.deletedAt),
      ),
    )
    .orderBy(asc(contacts.name));

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as "cliente" | "socio",
      email: row.email?.trim() || row.personEmail?.trim() || null,
      isProjectClient: row.id === row.clientId,
    }))
    .sort((a, b) => Number(b.isProjectClient) - Number(a.isProjectClient));
}
