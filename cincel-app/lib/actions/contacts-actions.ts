"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import * as contactsRepository from "@/lib/repositories/contacts-repository";
import type {
  ContactDetail,
  ContactInput,
  ContactListItem,
  ContactPersonInput,
  ContactTag,
  ContactType,
} from "@/lib/types/core";

/**
 * One capability gate (clients) covers the whole contacts module for now —
 * clientes, socios and proveedores share the same directory screen. A finer
 * per-type gate can be added in Phase 4 if the client asks for it.
 */
async function requireContactsCapabilities() {
  return resolveClientsCapabilities(await requireCapabilityUser());
}

function revalidateDirectorio() {
  revalidatePath("/directorio");
}

export async function fetchContactsAction(
  options: { type?: ContactType; search?: string } = {}
): Promise<ContactListItem[]> {
  const caps = await requireContactsCapabilities();
  if (!caps.canViewClients) return [];
  return contactsRepository.listContacts(options);
}

export async function fetchContactAction(id: string): Promise<ContactDetail | null> {
  const caps = await requireContactsCapabilities();
  if (!caps.canViewClients) return null;
  return contactsRepository.getContact(id);
}

export async function createContactAction(input: ContactInput): Promise<ContactDetail> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canCreateClient) {
    throw new Error("FORBIDDEN: contact create");
  }
  const row = await contactsRepository.createContact(input, user.member.id);
  revalidateDirectorio();
  return row;
}

export async function updateContactAction(
  id: string,
  patch: Partial<ContactInput>
): Promise<ContactDetail> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canEditClient) {
    throw new Error("FORBIDDEN: contact edit");
  }
  const row = await contactsRepository.updateContact(id, patch, user.member.id);
  revalidateDirectorio();
  return row;
}

export async function deleteContactAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canDeleteClient) {
    throw new Error("FORBIDDEN: contact delete");
  }
  await contactsRepository.softDeleteContact(id, user.member.id);
  revalidateDirectorio();
}

export async function setContactPeopleAction(
  contactId: string,
  people: ContactPersonInput[]
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canEditClient) {
    throw new Error("FORBIDDEN: contact edit");
  }
  await contactsRepository.setContactPeople(contactId, people);
  revalidateDirectorio();
}

export async function setContactTagsAction(contactId: string, tags: ContactTag[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canEditClient) {
    throw new Error("FORBIDDEN: contact edit");
  }
  await contactsRepository.setContactTags(contactId, tags);
  revalidateDirectorio();
}
