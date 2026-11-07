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
import { workflowPhases, workflows } from "./workflows";

/**
 * Whether a Workspace group mapping grants a role or an área (BE §A.3).
 * Project flow: migration 0024 step 13 renames 'area' to 'position' (and swaps
 * `workspace_group_mappings_kind_check`) together with the code switch to
 * puestos, so 0023 leaves the enum and the check untouched (BE §4.1).
 */
export const groupMappingKind = core.enum("group_mapping_kind", ["role", "area"]);

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
    /** Chart token slot 1–5 for the área's color; null = neutral gray. */
    colorSlot: integer("color_slot"),
    ...stamps,
    ...soft,
  },
  (t) => [
    check("areas_color_slot_check", sql`${t.colorSlot} between 1 and 5`),
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
    // "manual" | "workspace": workspace rows come from Google group mappings (BE §A.4).
    source: text("source").notNull().default("manual"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.areaId, t.staffId] }),
    index("idx_area_members_staff_id").on(t.staffId),
  ]
);

/** @deprecated Which workflows an area owns. Dropped in release B (0025); puestos replace áreas. */
export const areaWorkflows = core.table(
  "area_workflows",
  {
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.areaId, t.workflowId] }),
    index("idx_area_workflows_workflow_id").on(t.workflowId),
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

/** Admin-configured: which Workspace group means which role or area (BE §A.3). */
export const workspaceGroupMappings = core.table(
  "workspace_group_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupEmail: text("group_email").notNull(), // shown in UI
    groupId: text("group_id").notNull(), // from groups.get; survives renames
    kind: groupMappingKind("kind").notNull(),
    role: text("role"), // kind = role: one of OFFICIAL_CINCEL_ROLES
    /** @deprecated kind = area; always null once 0024 runs. Dropped in release B (0025). */
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "cascade" }), // kind = area
    /** kind = position (after 0024 renames the enum value). `restrict`: a mapped puesto can't be deleted. */
    positionId: uuid("position_id").references(() => positions.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull().default(0), // kind = role: higher wins
    ...stamps,
  },
  (t) => [
    uniqueIndex("workspace_group_mappings_group_uq").on(t.groupId, t.kind),
    index("idx_workspace_group_mappings_position_id").on(t.positionId),
    check(
      "workspace_group_mappings_kind_check",
      sql`(${t.kind} = 'role' and ${t.role} is not null and ${t.areaId} is null) or (${t.kind} = 'area' and ${t.areaId} is not null and ${t.role} is null)`
    ),
  ]
);

export const staffRelations = relations(staff, ({ one, many }) => ({
  profile: one(staffProfiles, { fields: [staff.id], references: [staffProfiles.staffId] }),
  areaMemberships: many(areaMembers),
  positions: many(staffPositions),
}));

export const staffProfilesRelations = relations(staffProfiles, ({ one }) => ({
  staff: one(staff, { fields: [staffProfiles.staffId], references: [staff.id] }),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  lead: one(staff, { fields: [areas.leadId], references: [staff.id] }),
  members: many(areaMembers),
  workflows: many(areaWorkflows),
}));

export const areaMembersRelations = relations(areaMembers, ({ one }) => ({
  area: one(areas, { fields: [areaMembers.areaId], references: [areas.id] }),
  staff: one(staff, { fields: [areaMembers.staffId], references: [staff.id] }),
}));

export const workspaceGroupMappingsRelations = relations(workspaceGroupMappings, ({ one }) => ({
  area: one(areas, { fields: [workspaceGroupMappings.areaId], references: [areas.id] }),
  position: one(positions, { fields: [workspaceGroupMappings.positionId], references: [positions.id] }),
}));

export const areaWorkflowsRelations = relations(areaWorkflows, ({ one }) => ({
  area: one(areas, { fields: [areaWorkflows.areaId], references: [areas.id] }),
  workflow: one(workflows, { fields: [areaWorkflows.workflowId], references: [workflows.id] }),
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
