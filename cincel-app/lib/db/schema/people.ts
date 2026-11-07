import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, soft, stamps, staffKind } from "./_schema";
import { workflowPhases } from "./workflows";

/** Whether a Workspace group mapping grants a role or a puesto (BE §3.11). */
export const groupMappingKind = core.enum("group_mapping_kind", ["role", "position"]);

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
    // Google staff sign-in (BE §A.3): stable Google account id, matched before email.
    googleSub: text("google_sub"),
    accessCheckedAt: timestamp("access_checked_at", { withTimezone: true }),
    accessRevokedAt: timestamp("access_revoked_at", { withTimezone: true }),
    // One of WORKSPACE_DENIAL_REASONS in lib/types/workspace-access.ts (BE §A.4).
    accessRevokedReason: text("access_revoked_reason"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // First-login wizard (#671, #672) finished or skipped; null = show it on the next sign-in.
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
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
    uniqueIndex("staff_google_sub_uq")
      .on(t.googleSub)
      .where(sql`${t.googleSub} is not null and ${t.deletedAt} is null`),
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

/** Puestos: the firm's job positions (BE §3.10). Separate from the access role (`staff.role`). */
export const positions = core.table(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
    ...soft,
  },
  (t) => [
    uniqueIndex("positions_name_lower_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ]
);

/** staff ↔ puesto, many-to-many. */
export const staffPositions = core.table(
  "staff_positions",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    /** 'manual' | 'workspace' (from a Google group mapping), as area_members.source was. */
    source: text("source").notNull().default("manual"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.staffId, t.positionId] }),
    index("idx_staff_positions_position_id").on(t.positionId),
    check("staff_positions_source_check", sql`${t.source} in ('manual','workspace')`),
  ]
);

/** puesto ↔ candidate fase. Candidates are suggestions only, never enforced. */
export const positionPhases = core.table(
  "position_phases",
  {
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => workflowPhases.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.positionId, t.phaseId] }),
    index("idx_position_phases_phase_id").on(t.phaseId),
  ]
);

/** Admin-configured: which Workspace group means which role or puesto (BE §3.11). */
export const workspaceGroupMappings = core.table(
  "workspace_group_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupEmail: text("group_email").notNull(), // shown in UI
    groupId: text("group_id").notNull(), // from groups.get; survives renames
    kind: groupMappingKind("kind").notNull(),
    role: text("role"), // kind = role: one of OFFICIAL_CINCEL_ROLES
    /** kind = position. `restrict`: a mapped puesto can't be deleted. */
    positionId: uuid("position_id").references(() => positions.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull().default(0), // kind = role: higher wins
    ...stamps,
  },
  (t) => [
    uniqueIndex("workspace_group_mappings_group_uq").on(t.groupId, t.kind),
    index("idx_workspace_group_mappings_position_id").on(t.positionId),
    check(
      "workspace_group_mappings_kind_check",
      sql`(${t.kind}::text = 'role' and ${t.role} is not null and ${t.positionId} is null) or (${t.kind}::text = 'position' and ${t.positionId} is not null and ${t.role} is null)`
    ),
  ]
);

export const staffRelations = relations(staff, ({ one, many }) => ({
  profile: one(staffProfiles, { fields: [staff.id], references: [staffProfiles.staffId] }),
  positions: many(staffPositions),
}));

export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  staff: one(staff, { fields: [staffProfiles.staffId], references: [staff.id] }),
}));

export const workspaceGroupMappingsRelations = relations(workspaceGroupMappings, ({ one }) => ({
  position: one(positions, { fields: [workspaceGroupMappings.positionId], references: [positions.id] }),
}));

export const positionsRelations = relations(positions, ({ many }) => ({
  staff: many(staffPositions),
  phases: many(positionPhases),
}));

export const staffPositionsRelations = relations(staffPositions, ({ one }) => ({
  staff: one(staff, { fields: [staffPositions.staffId], references: [staff.id] }),
  position: one(positions, { fields: [staffPositions.positionId], references: [positions.id] }),
}));

export const positionPhasesRelations = relations(positionPhases, ({ one }) => ({
  position: one(positions, { fields: [positionPhases.positionId], references: [positions.id] }),
  phase: one(workflowPhases, { fields: [positionPhases.phaseId], references: [workflowPhases.id] }),
}));
