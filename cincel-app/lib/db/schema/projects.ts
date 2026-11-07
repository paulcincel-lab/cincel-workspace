import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contactType, core, projectStatus, soft, stamps } from "./_schema";
import { contacts } from "./contacts";
import { staff } from "./people";
import { driveFiles } from "./shared";
import { workflows } from "./workflows";

/** Provisioning state of a project's Drive folder tree. */
export const driveFolderStatus = core.enum("drive_folder_status", ["pending", "ready", "failed"]);
export type DriveFolderStatus = (typeof driveFolderStatus.enumValues)[number];

/**
 * Part C.4. A project's client is optional and admin-only (project flow, ADR
 * 0003); when set it is a contact of type cliente (rule 1, composite FK).
 */
export const projects = core.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    name: text("name").notNull(),
    /** Null until an admin assigns one ("Asignar cliente y origen"). The composite FK is skipped while null. */
    clientId: uuid("client_id"),
    clientType: contactType("client_type")
      .notNull()
      .generatedAlwaysAs(sql`'cliente'::core.contact_type`),
    status: projectStatus("status").notNull().default("activo"),
    /** Who brought the project in, free text (admin only). */
    origin: text("origin"),
    /** Staff member who brought the project in (admin only). */
    originStaffId: uuid("origin_staff_id").references(() => staff.id, { onDelete: "set null" }),
    // The primary (most advanced) stage. All active stages — a project can run
    // several in parallel (#435) — live in `project_stages`; this one is kept in
    // sync as the most advanced of them, for everything that needs just one.
    currentWorkflowId: uuid("current_workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    /** @deprecated Legacy single phase. Dropped in release B (0025); fases derive from tasks. */
    phase: text("phase"),
    /** @deprecated Free-text project phases (#435). Reported by 0024 and dropped in release B (0025). */
    phases: text("phases").array().notNull().default(sql`'{}'::text[]`),
    projectType: text("project_type"),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    managerId: uuid("manager_id").references(() => staff.id, { onDelete: "set null" }),
    coordinatorId: uuid("coordinator_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    progress: integer("progress").notNull().default(0),
    startDate: date("start_date"),
    endDate: date("end_date"),
    // The only money in the model.
    contractAmountMxn: numeric("contract_amount_mxn", { precision: 14, scale: 2 }),
    // The project's folder in the Shared Drive and its subfolders. Shared by
    // the monday import and Staff SSO.
    driveFolderId: text("drive_folder_id"),
    /** "01 Interno" */
    driveInternalFolderId: text("drive_internal_folder_id"),
    /** "02 Cliente" */
    driveClientFolderId: text("drive_client_folder_id"),
    /** "03 Del cliente" */
    driveInboundFolderId: text("drive_inbound_folder_id"),
    /** "01 Interno/Importado de monday" */
    driveImportFolderId: text("drive_import_folder_id"),
    driveFolderStatus: driveFolderStatus("drive_folder_status").notNull().default("pending"),
    driveFolderError: text("drive_folder_error"),
    ...stamps,
    ...soft,
  },
  (t) => [
    foreignKey({
      name: "projects_client_fk",
      columns: [t.clientId, t.clientType],
      foreignColumns: [contacts.id, contacts.type],
    }),
    check("projects_progress_check", sql`${t.progress} between 0 and 100`),
    check(
      "projects_dates_check",
      sql`${t.startDate} is null or ${t.endDate} is null or ${t.endDate} >= ${t.startDate}`
    ),
    uniqueIndex("projects_code_uq")
      .on(t.code)
      .where(sql`${t.deletedAt} is null and ${t.code} is not null`),
    // Replaced by projects_name_lower_uq (firm-wide, live active/paused) in 0024 step 11, after
    // duplicate names are made unique.
    uniqueIndex("projects_client_name_lower_uq")
      .on(t.clientId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index("idx_projects_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("idx_projects_client_id").on(t.clientId),
    index("idx_projects_origin_staff_id").on(t.originStaffId),
    index("idx_projects_manager_id").on(t.managerId),
    index("idx_projects_status").on(t.status),
    index("idx_projects_current_workflow_id").on(t.currentWorkflowId),
  ]
);

/** Staff on a project. */
export const projectMembers = core.table(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    role: text("role"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.staffId] }),
    index("idx_project_members_staff_id").on(t.staffId),
  ]
);

/** Partners and providers on a project. */
export const projectContacts = core.table(
  "project_contacts",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.contactId] }),
    index("idx_project_contacts_contact_id").on(t.contactId),
  ]
);

/** Drive folders by purpose (administrativo, planos, renders, reportes, ...). */
/**
 * Links on a project, like task_links: `kind` says who the folder/file is
 * for — the internal team or the client. A project can have several of each.
 */
export const projectLinks = core.table(
  "project_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    driveFileId: uuid("drive_file_id").references(() => driveFiles.id, {
      onDelete: "set null",
    }),
    ...stamps,
  },
  (t) => [
    check("project_links_kind_check", sql`${t.kind} in ('interno', 'cliente')`),
    index("idx_project_links_project_id").on(t.projectId),
  ]
);

/** Derived client rollups; replaces stored counters (Part B.5). */
export const clientStats = core.view("client_stats").as((qb) =>
  qb
    .select({
      clientId: projects.clientId,
      totalProjects: sql<number>`count(*)::int`.as("total_projects"),
      activeProjects:
        sql<number>`count(*) filter (where ${projects.status} = 'activo')::int`.as(
          "active_projects"
        ),
      firstWorkDate: sql<string | null>`min(${projects.startDate})`.as("first_work_date"),
      totalContractedMxn:
        sql<string>`coalesce(sum(${projects.contractAmountMxn}), 0)`.as(
          "total_contracted_mxn"
        ),
    })
    .from(projects)
    .where(sql`${projects.deletedAt} is null and ${projects.clientId} is not null`)
    .groupBy(projects.clientId)
);

/**
 * Every tramo a project has started (#435; project flow BE §3.7). Only
 * `startTramo` writes rows. `projects.current_workflow_id`, when set, must
 * have a row here (enforced by the repositories).
 */
export const projectStages = core.table(
  "project_stages",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    startedById: uuid("started_by_id").references(() => staff.id, { onDelete: "set null" }),
    /** Set when every live, unarchived task of this tramo on the project is closed; cleared when one reopens or is added. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.workflowId] }),
    index("idx_project_stages_workflow_id").on(t.workflowId),
    index("idx_project_stages_started_by_id").on(t.startedById),
  ]
);

/** Espacios: an optional per-project list (e.g. "Depto 201"). A filter, not history: hard-deleted (BE §3.8). */
export const projectSpaces = core.table(
  "project_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [
    // Target of tasks_space_fk: a task's espacio belongs to the task's project.
    unique("project_spaces_id_project_uq").on(t.id, t.projectId),
    uniqueIndex("project_spaces_name_lower_uq").on(t.projectId, sql`lower(${t.name})`),
    index("idx_project_spaces_project_order").on(t.projectId, t.sortOrder),
  ]
);

/**
 * One "Iniciar tramo" run that created tasks (BE §3.9), for undo. Written only
 * when at least one task was created.
 */
export const tramoStartBatches = core.table(
  "tramo_start_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    startedById: uuid("started_by_id").references(() => staff.id, { onDelete: "set null" }),
    /** 'manual' (sheet) | 'on_create' | 'on_ready' (auto-start). */
    trigger: text("trigger").notNull().default("manual"),
    phaseIds: uuid("phase_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** self | by_phase | none */
    assignmentMode: text("assignment_mode").notNull(),
    createdCount: integer("created_count").notNull().default(0),
    stageCreated: boolean("stage_created").notNull().default(false),
    previousCurrentWorkflowId: uuid("previous_current_workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    currentChanged: boolean("current_changed").notNull().default(false),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneById: uuid("undone_by_id").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("tramo_start_batches_trigger_check", sql`${t.trigger} in ('manual','on_create','on_ready')`),
    check("tramo_start_batches_mode_check", sql`${t.assignmentMode} in ('self','by_phase','none')`),
    index("idx_tramo_start_batches_project_workflow").on(t.projectId, t.workflowId, t.createdAt),
    index("idx_tramo_start_batches_workflow_id").on(t.workflowId),
    index("idx_tramo_start_batches_started_by_id").on(t.startedById),
    index("idx_tramo_start_batches_undone_by_id").on(t.undoneById),
    index("idx_tramo_start_batches_previous_current").on(t.previousCurrentWorkflowId),
  ]
);

export const projectSpacesRelations = relations(projectSpaces, ({ one }) => ({
  project: one(projects, { fields: [projectSpaces.projectId], references: [projects.id] }),
}));

export const tramoStartBatchesRelations = relations(tramoStartBatches, ({ one }) => ({
  project: one(projects, { fields: [tramoStartBatches.projectId], references: [projects.id] }),
  workflow: one(workflows, { fields: [tramoStartBatches.workflowId], references: [workflows.id] }),
}));

export const projectStagesRelations = relations(projectStages, ({ one }) => ({
  project: one(projects, { fields: [projectStages.projectId], references: [projects.id] }),
  workflow: one(workflows, { fields: [projectStages.workflowId], references: [workflows.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(contacts, { fields: [projects.clientId], references: [contacts.id] }),
  currentWorkflow: one(workflows, {
    fields: [projects.currentWorkflowId],
    references: [workflows.id],
  }),
  manager: one(staff, {
    fields: [projects.managerId],
    references: [staff.id],
    relationName: "project_manager",
  }),
  coordinator: one(staff, {
    fields: [projects.coordinatorId],
    references: [staff.id],
    relationName: "project_coordinator",
  }),
  members: many(projectMembers),
  contacts: many(projectContacts),
  links: many(projectLinks),
  stages: many(projectStages),
  spaces: many(projectSpaces),
  originStaff: one(staff, {
    fields: [projects.originStaffId],
    references: [staff.id],
    relationName: "project_origin_staff",
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  staff: one(staff, { fields: [projectMembers.staffId], references: [staff.id] }),
}));

export const projectContactsRelations = relations(projectContacts, ({ one }) => ({
  project: one(projects, { fields: [projectContacts.projectId], references: [projects.id] }),
  contact: one(contacts, { fields: [projectContacts.contactId], references: [contacts.id] }),
}));

export const projectLinksRelations = relations(projectLinks, ({ one }) => ({
  project: one(projects, { fields: [projectLinks.projectId], references: [projects.id] }),
  driveFile: one(driveFiles, { fields: [projectLinks.driveFileId], references: [driveFiles.id] }),
}));
