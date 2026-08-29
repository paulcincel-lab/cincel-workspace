import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { core, timestamps } from "./_schema";
import { clients } from "./clients";
import { teamMembers } from "./team";

export const projects = core.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }).unique(),
    code: text("code").unique(),
    name: text("name").notNull(),
    status: text("status"),
    active: boolean("active").notNull().default(true),
    clientId: uuid("client_id").references(() => clients.id),
    projectType: text("project_type"),
    stage: text("stage"),
    phase: text("phase"),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    managerName: text("manager_name"),
    coordinatorName: text("coordinator_name"),
    progress: integer("progress").notNull().default(0),
    startDate: date("start_date"),
    ...timestamps,
  },
  (t) => [
    check("projects_progress_range", sql`${t.progress} >= 0 and ${t.progress} <= 100`),
    // Closed set from ProjectCreateModal's STAGE_OPTIONS. `phase` stays free —
    // it's workflow-specific and evolves with the templates.
    check(
      "projects_stage_check",
      sql`${t.stage} is null or ${t.stage} in ('Presale', 'Diseño', 'Construcción')`
    ),
    index("idx_projects_name").on(t.name),
    index("idx_projects_stage").on(t.stage),
    index("idx_projects_active").on(t.active),
    index("idx_projects_client_id").on(t.clientId),
    index("idx_projects_deleted_at").on(t.deletedAt),
  ]
);

export const projectDriveLinks = core.table("project_drive_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id),
  administrativoUrl: text("administrativo_url"),
  planosUrl: text("planos_url"),
  rendersUrl: text("renders_url"),
  reportesUrl: text("reportes_url"),
  ...timestamps,
});

export const projectMembers = core.table(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    teamMemberId: uuid("team_member_id").references(() => teamMembers.id),
    memberNameSnapshot: text("member_name_snapshot"),
    ...timestamps,
  },
  (t) => [
    // One row per person per project. team_member_id is NULL for names not in
    // the roster (the common case), and Postgres treats every NULL as distinct
    // in a plain unique — so key on the resolved id OR the name snapshot.
    uniqueIndex("project_members_project_member_uq").on(
      t.projectId,
      sql`coalesce(${t.teamMemberId}::text, ${t.memberNameSnapshot})`
    ),
    index("idx_project_members_project_id").on(t.projectId),
    index("idx_project_members_member_id").on(t.teamMemberId),
  ]
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  driveLinks: one(projectDriveLinks, {
    fields: [projects.id],
    references: [projectDriveLinks.projectId],
  }),
  members: many(projectMembers),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  teamMember: one(teamMembers, {
    fields: [projectMembers.teamMemberId],
    references: [teamMembers.id],
  }),
}));
