import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contactType, core, projectStatus, soft, stamps } from "./_schema";
import { contacts } from "./contacts";
import { staff } from "./people";
import { driveFiles } from "./shared";
import { workflows } from "./workflows";

/** Part C.4. A project belongs to a client, and only a client (rule 1). */
export const projects = core.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    name: text("name").notNull(),
    clientId: uuid("client_id").notNull(),
    clientType: contactType("client_type")
      .notNull()
      .generatedAlwaysAs(sql`'cliente'::core.contact_type`),
    status: projectStatus("status").notNull().default("activo"),
    // The primary (most advanced) stage. All active stages — a project can run
    // several in parallel (#435) — live in `project_stages`; this one is kept in
    // sync as the most advanced of them, for everything that needs just one.
    currentWorkflowId: uuid("current_workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    /** Legacy single phase, kept in sync as `phases` joined with ", ". */
    phase: text("phase"),
    /** Project phases (#435) — several can be active at once. */
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
    uniqueIndex("projects_client_name_lower_uq")
      .on(t.clientId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    index("idx_projects_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("idx_projects_client_id").on(t.clientId),
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
export const projectLinks = core.table(
  "project_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title"),
    url: text("url").notNull(),
    driveFileId: uuid("drive_file_id").references(() => driveFiles.id, {
      onDelete: "set null",
    }),
    ...stamps,
  },
  (t) => [unique("project_links_project_kind_uq").on(t.projectId, t.kind)]
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
    .where(sql`${projects.deletedAt} is null`)
    .groupBy(projects.clientId)
);

/** Every stage a project is actively in (#435). */
export const projectStages = core.table(
  "project_stages",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.projectId, t.workflowId] }), index("idx_project_stages_workflow_id").on(t.workflowId)]
);

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
