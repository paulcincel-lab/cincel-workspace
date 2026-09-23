import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, soft, stamps, staffKind } from "./_schema";

/** Internal person: employee, freelance or servicio social (Part C.1). */
export const staff = core.table(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: staffKind("kind").notNull().default("empleado"),
    name: text("name").notNull(),
    lastName: text("last_name"),
    phone: text("phone"),
    email: text("email"),
    role: text("role"),
    capacity: integer("capacity").notNull().default(0),
    availability: text("availability"),
    active: boolean("active").notNull().default(true),
    // Manual order in Equipo (#452); null = not placed yet, listed after the placed ones by name.
    sortOrder: integer("sort_order"),
    ...stamps,
    ...soft,
  },
  (t) => [
    check("staff_capacity_check", sql`${t.capacity} >= 0`),
    uniqueIndex("staff_name_lower_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("staff_email_lower_uq")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null and ${t.email} is not null`),
    index("idx_staff_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("idx_staff_active").on(t.active),
  ]
);

/** HR / PII, 1:1 with staff. Intended for employees; not enforced by the DB. */
export const staffProfiles = core.table(
  "staff_profiles",
  {
    staffId: uuid("staff_id")
      .primaryKey()
      .references(() => staff.id, { onDelete: "cascade" }),
    personalEmail: text("personal_email"),
    homePhone: text("home_phone"),
    nationality: text("nationality"),
    address: text("address"),
    maritalStatus: text("marital_status"),
    birthDate: date("birth_date"),
    curp: text("curp"),
    rfc: text("rfc"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactRelation: text("emergency_contact_relation"),
    emergencyContactPhone: text("emergency_contact_phone"),
    emergencyContactAddress: text("emergency_contact_address"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("staff_profiles_curp_uq").on(t.curp).where(sql`${t.curp} is not null`),
    uniqueIndex("staff_profiles_rfc_uq").on(t.rfc).where(sql`${t.rfc} is not null`),
  ]
);

/** Company departments. */
export const areas = core.table(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    leadId: uuid("lead_id").references(() => staff.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [
    uniqueIndex("areas_name_lower_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ]
);

/** staff ↔ area, many-to-many. */
export const areaMembers = core.table(
  "area_members",
  {
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    role: text("role"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.areaId, t.staffId] }),
    index("idx_area_members_staff_id").on(t.staffId),
  ]
);

export const staffRelations = relations(staff, ({ one, many }) => ({
  profile: one(staffProfiles, { fields: [staff.id], references: [staffProfiles.staffId] }),
  areaMemberships: many(areaMembers),
}));

export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  staff: one(staff, { fields: [staffProfiles.staffId], references: [staff.id] }),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  lead: one(staff, { fields: [areas.leadId], references: [staff.id] }),
  members: many(areaMembers),
}));

export const areaMembersRelations = relations(areaMembers, ({ one }) => ({
  area: one(areas, { fields: [areaMembers.areaId], references: [areas.id] }),
  staff: one(staff, { fields: [areaMembers.staffId], references: [staff.id] }),
}));
