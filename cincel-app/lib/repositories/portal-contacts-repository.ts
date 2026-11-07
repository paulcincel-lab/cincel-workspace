import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contactPeople, contacts, projectContacts, projects } from "@/lib/db/schema";

/**
 * Contacts the Clientes tab can invite (FE §2.4): the project's client plus its
 * `project_contacts` of type `cliente` or `socio`. Staff side only.
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

export async function listInvitableContacts(projectId: string): Promise<PortalInvitableContact[]> {
  const [project] = await db
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return [];

  const linked = await db
    .select({ contactId: projectContacts.contactId })
    .from(projectContacts)
    .where(eq(projectContacts.projectId, projectId));
  const ids = [
    ...new Set([project.clientId, ...linked.map((row) => row.contactId)].filter((id): id is string => id !== null)),
  ];

  const rows = await db
    .select({ id: contacts.id, name: contacts.name, type: contacts.type, email: contacts.email })
    .from(contacts)
    .where(and(inArray(contacts.id, ids), inArray(contacts.type, ["cliente", "socio"]), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.name));
  if (rows.length === 0) return [];

  const people = await db
    .select({ contactId: contactPeople.contactId, email: contactPeople.email })
    .from(contactPeople)
    .where(and(inArray(contactPeople.contactId, rows.map((row) => row.id)), eq(contactPeople.isPrimary, true)));
  const primaryEmail = new Map(people.map((person) => [person.contactId, person.email?.trim() || null]));

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as "cliente" | "socio",
      email: row.email?.trim() || primaryEmail.get(row.id) || null,
      isProjectClient: row.id === project.clientId,
    }))
    .sort((a, b) => Number(b.isProjectClient) - Number(a.isProjectClient));
}
