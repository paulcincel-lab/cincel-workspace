import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  contactKind,
  contactType,
  core,
  providerStatus,
  providerSubtype,
  soft,
  stamps,
} from "./_schema";
import { staff } from "./people";

/** Every external party, typed cliente / socio / proveedor (Part C.2). */
export const contacts = core.table(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: contactType("type").notNull(),
    kind: contactKind("kind").notNull().default("empresa"),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    location: text("location"),
    acquisitionChannel: text("acquisition_channel"),
    notes: text("notes"),
    ...stamps,
    ...soft,
  },
  (t) => [
    // Lets projects / provider_profiles FK to a *typed* contact.
    unique("contacts_id_type_uq").on(t.id, t.type),
    uniqueIndex("contacts_type_name_lower_uq")
      .on(t.type, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index("idx_contacts_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("idx_contacts_type").on(t.type),
  ]
);

/** Individuals at a contact. */
export const contactPeople = core.table(
  "contact_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [
    index("idx_contact_people_contact_id").on(t.contactId),
    uniqueIndex("contact_people_primary_uq")
      .on(t.contactId)
      .where(sql`${t.isPrimary} = true`),
  ]
);

/** Categories and skills. */
export const contactTags = core.table(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.kind, t.value] }),
    check("contact_tags_kind_check", sql`${t.kind} in ('categoria', 'habilidad')`),
  ]
);

/** Provider-only attributes, 1:1 with a `proveedor` contact (rule 6). */
export const providerProfiles = core.table(
  "provider_profiles",
  {
    contactId: uuid("contact_id").primaryKey(),
    contactType: contactType("contact_type")
      .notNull()
      .generatedAlwaysAs(sql`'proveedor'::core.contact_type`),
    subtype: providerSubtype("subtype").notNull(),
    status: providerStatus("status"),
    mainSpecialty: text("main_specialty"),
    department: text("department"),
    seniority: text("seniority"),
    priceLevel: text("price_level"),
    availability: text("availability"),
    comments: text("comments"),
    rating: integer("rating"),
    startDate: date("start_date"),
    // Freelance colaborador who also executes tasks.
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    foreignKey({
      name: "provider_profiles_contact_fk",
      columns: [t.contactId, t.contactType],
      foreignColumns: [contacts.id, contacts.type],
    }).onDelete("cascade"),
    check(
      "provider_profiles_rating_check",
      sql`${t.rating} is null or ${t.rating} between 0 and 5`
    ),
    index("idx_provider_profiles_subtype").on(t.subtype),
    index("idx_provider_profiles_status").on(t.status),
    index("idx_provider_profiles_staff_id").on(t.staffId),
  ]
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  people: many(contactPeople),
  tags: many(contactTags),
  providerProfile: one(providerProfiles, {
    fields: [contacts.id],
    references: [providerProfiles.contactId],
  }),
}));

export const contactPeopleRelations = relations(contactPeople, ({ one }) => ({
  contact: one(contacts, { fields: [contactPeople.contactId], references: [contacts.id] }),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
}));

export const providerProfilesRelations = relations(providerProfiles, ({ one }) => ({
  contact: one(contacts, {
    fields: [providerProfiles.contactId],
    references: [contacts.id],
  }),
  staff: one(staff, { fields: [providerProfiles.staffId], references: [staff.id] }),
}));
