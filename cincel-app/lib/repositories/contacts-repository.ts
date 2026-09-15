import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  clientStats,
  contactPeople,
  contactTags,
  contacts,
  projects,
  providerProfiles,
} from "@/lib/db/schema";
import { recordChanges } from "@/lib/repositories/history-repository";
import type {
  ClientStats,
  Contact,
  ContactDetail,
  ContactInput,
  ContactListItem,
  ContactPerson,
  ContactPersonInput,
  ContactTag,
  ContactType,
  ProviderProfile,
} from "@/lib/types/core";

type ContactRow = typeof contacts.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    type: row.type,
    kind: row.kind,
    name: row.name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    location: row.location,
    acquisitionChannel: row.acquisitionChannel,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPerson(row: typeof contactPeople.$inferSelect): ContactPerson {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    email: row.email,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
  };
}

function toProviderProfile(row: typeof providerProfiles.$inferSelect): ProviderProfile {
  return {
    subtype: row.subtype,
    status: row.status,
    mainSpecialty: row.mainSpecialty,
    department: row.department,
    seniority: row.seniority,
    priceLevel: row.priceLevel,
    availability: row.availability,
    comments: row.comments,
    rating: row.rating,
    startDate: row.startDate,
    staffId: row.staffId,
  };
}

const CONTACT_TRACKED_FIELDS = [
  "kind",
  "name",
  "phone",
  "email",
  "website",
  "location",
  "acquisitionChannel",
  "notes",
] as const;

export async function listContacts(
  options: { type?: ContactType; search?: string } = {}
): Promise<ContactListItem[]> {
  const rows = await db.query.contacts.findMany({
    where: and(
      isNull(contacts.deletedAt),
      options.type ? eq(contacts.type, options.type) : undefined,
      options.search ? sql`${contacts.name} ilike ${"%" + options.search.trim() + "%"}` : undefined
    ),
    orderBy: asc(contacts.name),
    with: {
      people: { orderBy: [desc(contactPeople.isPrimary), asc(contactPeople.sortOrder)] },
      tags: { orderBy: asc(contactTags.sortOrder) },
      providerProfile: true,
    },
  });
  return rows.map((r) => ({
    ...toContact(r),
    primaryPerson: r.people[0] ? toPerson(r.people[0]) : null,
    tags: r.tags.map((t) => ({ kind: t.kind as ContactTag["kind"], value: t.value })),
    providerProfile: r.providerProfile ? toProviderProfile(r.providerProfile) : null,
  }));
}

export async function getContact(id: string): Promise<ContactDetail | null> {
  const row = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, id), isNull(contacts.deletedAt)),
    with: {
      people: { orderBy: [desc(contactPeople.isPrimary), asc(contactPeople.sortOrder)] },
      tags: { orderBy: asc(contactTags.sortOrder) },
      providerProfile: true,
    },
  });
  if (!row) return null;

  let stats: ClientStats | null = null;
  let projectRows: ContactDetail["projects"] = [];
  if (row.type === "cliente") {
    const [s] = await db.select().from(clientStats).where(eq(clientStats.clientId, id));
    stats = {
      totalProjects: Number(s?.totalProjects ?? 0),
      activeProjects: Number(s?.activeProjects ?? 0),
      firstWorkDate: s?.firstWorkDate ?? null,
      totalContractedMxn: String(s?.totalContractedMxn ?? "0"),
    };
    projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        startDate: projects.startDate,
      })
      .from(projects)
      .where(and(eq(projects.clientId, id), isNull(projects.deletedAt)))
      .orderBy(desc(projects.startDate), asc(projects.name));
  }

  return {
    ...toContact(row),
    people: row.people.map(toPerson),
    tags: row.tags.map((t) => ({ kind: t.kind as ContactTag["kind"], value: t.value })),
    providerProfile: row.providerProfile ? toProviderProfile(row.providerProfile) : null,
    stats,
    projects: projectRows,
  };
}

function toValues(input: Omit<ContactInput, "people" | "tags" | "providerProfile">) {
  return {
    type: input.type,
    kind: input.kind ?? "empresa",
    name: input.name.trim(),
    phone: clean(input.phone),
    email: clean(input.email)?.toLowerCase() ?? null,
    website: clean(input.website),
    location: clean(input.location),
    acquisitionChannel: clean(input.acquisitionChannel),
    notes: clean(input.notes),
  };
}

export async function createContact(input: ContactInput, actorId: string): Promise<ContactDetail> {
  const [row] = await db.insert(contacts).values(toValues(input)).returning();
  await recordChanges({
    entity: "contact",
    entityId: row.id,
    actorId,
    before: { name: null },
    after: { name: row.name },
    fields: ["name"],
  });
  if (input.people) await setContactPeople(row.id, input.people);
  if (input.tags) await setContactTags(row.id, input.tags);
  if (input.providerProfile && row.type === "proveedor") {
    await upsertProviderProfile(row.id, input.providerProfile);
  }
  return (await getContact(row.id))!;
}

export async function updateContact(
  id: string,
  patch: Partial<ContactInput>,
  actorId: string
): Promise<ContactDetail> {
  const [before] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .limit(1);
  if (!before) throw new Error("CONTACT_NOT_FOUND");

  // The type is fixed at creation: projects and provider profiles depend on it.
  const merged = toValues({
    type: before.type,
    kind: patch.kind ?? before.kind,
    name: patch.name ?? before.name,
    phone: patch.phone === undefined ? before.phone : patch.phone,
    email: patch.email === undefined ? before.email : patch.email,
    website: patch.website === undefined ? before.website : patch.website,
    location: patch.location === undefined ? before.location : patch.location,
    acquisitionChannel:
      patch.acquisitionChannel === undefined ? before.acquisitionChannel : patch.acquisitionChannel,
    notes: patch.notes === undefined ? before.notes : patch.notes,
  });
  const [after] = await db.update(contacts).set(merged).where(eq(contacts.id, id)).returning();
  await recordChanges({
    entity: "contact",
    entityId: id,
    actorId,
    before,
    after,
    fields: CONTACT_TRACKED_FIELDS,
  });

  if (patch.people) await setContactPeople(id, patch.people);
  if (patch.tags) await setContactTags(id, patch.tags);
  if (patch.providerProfile && before.type === "proveedor") {
    await upsertProviderProfile(id, patch.providerProfile);
  }
  return (await getContact(id))!;
}

export async function softDeleteContact(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .returning();
  if (!row) throw new Error("CONTACT_NOT_FOUND");
  await recordChanges({
    entity: "contact",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
  });
}

/**
 * Replace the people at a contact. Rows with a known id are updated in place
 * so their id survives; the rest are inserted; missing ones are removed.
 * At most one person is primary; if none is flagged the first one is.
 */
export async function setContactPeople(
  contactId: string,
  people: ContactPersonInput[]
): Promise<ContactPerson[]> {
  const wanted = people.filter((p) => p.name.trim());
  const primaryIndex = Math.max(0, wanted.findIndex((p) => p.isPrimary));

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: contactPeople.id })
      .from(contactPeople)
      .where(eq(contactPeople.contactId, contactId));
    const existingIds = new Set(existing.map((e) => e.id));
    const keepIds = new Set(wanted.map((p) => p.id).filter((id): id is string => Boolean(id)));

    for (const e of existing) {
      if (!keepIds.has(e.id)) await tx.delete(contactPeople).where(eq(contactPeople.id, e.id));
    }
    // Clear primaries first so the partial unique never trips mid-update.
    await tx
      .update(contactPeople)
      .set({ isPrimary: false })
      .where(eq(contactPeople.contactId, contactId));

    for (const [i, p] of wanted.entries()) {
      const values = {
        contactId,
        name: p.name.trim(),
        role: clean(p.role),
        phone: clean(p.phone),
        email: clean(p.email)?.toLowerCase() ?? null,
        isPrimary: wanted.length > 0 && i === primaryIndex,
        sortOrder: i,
      };
      if (p.id && existingIds.has(p.id)) {
        await tx.update(contactPeople).set(values).where(eq(contactPeople.id, p.id));
      } else {
        await tx.insert(contactPeople).values(values);
      }
    }
  });

  const rows = await db
    .select()
    .from(contactPeople)
    .where(eq(contactPeople.contactId, contactId))
    .orderBy(asc(contactPeople.sortOrder));
  return rows.map(toPerson);
}

export async function setContactTags(contactId: string, tags: ContactTag[]): Promise<void> {
  const seen = new Set<string>();
  const rows = tags
    .map((t) => ({ kind: t.kind, value: t.value.trim() }))
    .filter((t) => t.value && !seen.has(`${t.kind}|${t.value.toLowerCase()}`) && seen.add(`${t.kind}|${t.value.toLowerCase()}`));
  await db.transaction(async (tx) => {
    await tx.delete(contactTags).where(eq(contactTags.contactId, contactId));
    if (rows.length > 0) {
      await tx
        .insert(contactTags)
        .values(rows.map((t, i) => ({ contactId, kind: t.kind, value: t.value, sortOrder: i })));
    }
  });
}

/** Only valid on a `proveedor` contact; the database rejects the rest. */
export async function upsertProviderProfile(
  contactId: string,
  profile: ProviderProfile
): Promise<ProviderProfile> {
  const values = {
    subtype: profile.subtype,
    status: profile.status ?? null,
    mainSpecialty: clean(profile.mainSpecialty),
    department: clean(profile.department),
    seniority: clean(profile.seniority),
    priceLevel: clean(profile.priceLevel),
    availability: clean(profile.availability),
    comments: clean(profile.comments),
    rating: profile.rating ?? null,
    startDate: clean(profile.startDate),
    staffId: profile.staffId ?? null,
  };
  const [row] = await db
    .insert(providerProfiles)
    .values({ contactId, ...values })
    .onConflictDoUpdate({ target: providerProfiles.contactId, set: values })
    .returning();
  return toProviderProfile(row);
}

export async function listClientStats(): Promise<Map<string, ClientStats>> {
  const rows = await db.select().from(clientStats);
  return new Map(
    rows.map((s) => [
      s.clientId,
      {
        totalProjects: Number(s.totalProjects),
        activeProjects: Number(s.activeProjects),
        firstWorkDate: s.firstWorkDate,
        totalContractedMxn: String(s.totalContractedMxn),
      },
    ])
  );
}
