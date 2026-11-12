"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { canSeeAdminData, resolveClientsCapabilities } from "@/lib/auth/permissions";
import * as contactsRepository from "@/lib/repositories/contacts-repository";
import type {
  ContactDetail,
  ContactInput,
  ContactListItem,
  ContactPersonInput,
  ContactTag,
  ContactType,
  HistoryEvent,
} from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";

/**
 * One capability gate (clients) covers the whole contacts module for now —
 * clientes, socios and proveedores share the same directory screen. A finer
 * per-type gate can be added in Phase 4 if the client asks for it.
 *
 * No path revalidation (Query Migration 6): the Personas screens read through
 * TanStack Query and the caller's mutation invalidates its keys. The writes
 * the UI calls return `ActionResult` (production strips thrown messages).
 */
async function requireContactsCapabilities() {
  return resolveClientsCapabilities(await requireCapabilityUser());
}

export async function fetchContactsAction(
  options: { type?: ContactType; search?: string } = {}
): Promise<ContactListItem[]> {
  const caps = await requireContactsCapabilities();
  if (!caps.canViewClients) return [];
  return contactsRepository.listContacts(options);
}

/** What a viewer may see of a contact sheet: the project list is admin-only (BE §12, B2). */
function sheetFor(user: Awaited<ReturnType<typeof requireCapabilityUser>>, contact: ContactDetail): ContactDetail {
  return canSeeAdminData(user) ? contact : { ...contact, projects: [] };
}

/**
 * A contact's Directorio sheet. Which projects a client has is admin-only
 * data (project flow BE §12, B2): non-administrators get `projects: []`;
 * `stats` keeps its counts, which name no project.
 */
export async function fetchContactAction(id: string): Promise<ContactDetail | null> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canViewClients) return null;
  const contact = await contactsRepository.getContact(id);
  if (!contact || canSeeAdminData(user)) return contact;
  return { ...contact, projects: [] };
}

export async function fetchContactHistoryAction(contactId: string): Promise<HistoryEvent[]> {
  const caps = await requireContactsCapabilities();
  if (!caps.canViewClients) return [];
  return contactsRepository.listContactHistory(contactId);
}

/** Creates a contact; the result is the viewer's sheet of it. Errors (as results): FORBIDDEN. */
export async function createContactAction(input: ContactInput): Promise<ActionResult<ContactDetail>> {
  return toActionResult(async () => {
    const user = await requireCapabilityUser();
    if (!resolveClientsCapabilities(user).canCreateClient) {
      throw new Error("FORBIDDEN: contact create");
    }
    return sheetFor(user, await contactsRepository.createContact(input, user.member.id));
  });
}

/** Updates a contact; the result is the viewer's sheet of it. Errors (as results): FORBIDDEN. */
export async function updateContactAction(
  id: string,
  patch: Partial<ContactInput>
): Promise<ActionResult<ContactDetail>> {
  return toActionResult(async () => {
    const user = await requireCapabilityUser();
    if (!resolveClientsCapabilities(user).canEditClient) {
      throw new Error("FORBIDDEN: contact edit");
    }
    return sheetFor(user, await contactsRepository.updateContact(id, patch, user.member.id));
  });
}

/** Soft-deletes a contact. Errors (as results): FORBIDDEN. */
export async function deleteContactAction(id: string): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const user = await requireCapabilityUser();
    if (!resolveClientsCapabilities(user).canDeleteClient) {
      throw new Error("FORBIDDEN: contact delete");
    }
    await contactsRepository.softDeleteContact(id, user.member.id);
  });
}

export async function setContactPeopleAction(
  ...args: Parameters<typeof setContactPeopleActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setContactPeopleActionImpl>>>> {
  return toActionResult(() => setContactPeopleActionImpl(...args));
}

async function setContactPeopleActionImpl(
  contactId: string,
  people: ContactPersonInput[]
): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canEditClient) {
    throw new Error("FORBIDDEN: contact edit");
  }
  await contactsRepository.setContactPeople(contactId, people);
}

export async function setContactTagsAction(
  ...args: Parameters<typeof setContactTagsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setContactTagsActionImpl>>>> {
  return toActionResult(() => setContactTagsActionImpl(...args));
}

async function setContactTagsActionImpl(contactId: string, tags: ContactTag[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canEditClient) {
    throw new Error("FORBIDDEN: contact edit");
  }
  await contactsRepository.setContactTags(contactId, tags);
}

/**
 * Merge duplicate contacts into `keepId`: every FK reference (projects,
 * project links, people, tags, provider profile, history) moves to the
 * survivor, then the duplicates are soft-deleted. Same capability as a
 * plain contact delete — merging is destructive to the losing records.
 */
export async function mergeContactsAction(
  keepId: string,
  duplicateIds: string[]
): Promise<ContactDetail> {
  const user = await requireCapabilityUser();
  if (!resolveClientsCapabilities(user).canDeleteClient) {
    throw new Error("FORBIDDEN: contact merge");
  }
  const row = await contactsRepository.mergeContacts(keepId, duplicateIds, user.member.id);
  return row;
}
