import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { core, taskPriority, taskStatus, timestamps, workflowType } from "./_schema";
import { projects } from "./projects";
import { teamMembers } from "./team";

export const activities = core.table(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    projectId: uuid("project_id").references(() => projects.id),
    projectNameSnapshot: text("project_name_snapshot"),
    workflow: workflowType("workflow").notNull(),
    phase: text("phase"),
    description: text("description").notNull(),
    notes: text("notes"),
    managerMemberId: uuid("manager_member_id").references(() => teamMembers.id),
    managerNameSnapshot: text("manager_name_snapshot"),
    status: taskStatus("status").notNull(),
    priority: taskPriority("priority").notNull(),
    commitmentDate: date("commitment_date"),
    reviewDate: date("review_date"),
    deliveryDate: date("delivery_date"),
    archived: boolean("archived").notNull().default(false),
    createdAtLabel: text("created_at_label"),
    updatedAtLabel: text("updated_at_label"),
    createdOn: date("created_on"),
    updatedOn: date("updated_on"),
    ...timestamps,
  },
  (t) => [
    check(
      "activities_review_after_commitment",
      sql`${t.reviewDate} is null or ${t.commitmentDate} is null or ${t.reviewDate} >= ${t.commitmentDate}`
    ),
    check(
      "activities_delivery_after_commitment",
      sql`${t.deliveryDate} is null or ${t.commitmentDate} is null or ${t.deliveryDate} >= ${t.commitmentDate}`
    ),
    index("idx_activities_project_id").on(t.projectId),
    index("idx_activities_workflow").on(t.workflow),
    index("idx_activities_status").on(t.status),
    index("idx_activities_manager_member_id").on(t.managerMemberId),
    index("idx_activities_commitment_date").on(t.commitmentDate),
    index("idx_activities_review_date").on(t.reviewDate),
    index("idx_activities_delivery_date").on(t.deliveryDate),
    index("idx_activities_archived").on(t.archived),
    index("idx_activities_deleted_at").on(t.deletedAt),
  ]
);

export const activitySupportMembers = core.table(
  "activity_support_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id),
    teamMemberId: uuid("team_member_id").references(() => teamMembers.id),
    supportNameSnapshot: text("support_name_snapshot"),
    ...timestamps,
  },
  (t) => [
    unique().on(t.activityId, t.teamMemberId, t.supportNameSnapshot),
    index("idx_activity_support_activity_id").on(t.activityId),
  ]
);

export const activityHistory = core.table(
  "activity_history",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id),
  legacyId: bigint("legacy_id", { mode: "number" }),
  authorMemberId: uuid("author_member_id").references(() => teamMembers.id),
  authorNameSnapshot: text("author_name_snapshot"),
    eventDate: date("event_date"),
    comment: text("comment").notNull(),
    ...timestamps,
  },
  (t) => [index("idx_activity_history_activity_id").on(t.activityId)]
);

export const activityChecklistItems = core.table(
  "activity_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id),
    legacyId: bigint("legacy_id", { mode: "number" }),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("idx_activity_checklist_activity_id").on(t.activityId)]
);

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  project: one(projects, {
    fields: [activities.projectId],
    references: [projects.id],
  }),
  manager: one(teamMembers, {
    fields: [activities.managerMemberId],
    references: [teamMembers.id],
  }),
  supportMembers: many(activitySupportMembers),
  history: many(activityHistory),
  checklistItems: many(activityChecklistItems),
}));

export const activitySupportMembersRelations = relations(
  activitySupportMembers,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activitySupportMembers.activityId],
      references: [activities.id],
    }),
  })
);

export const activityHistoryRelations = relations(activityHistory, ({ one }) => ({
  activity: one(activities, {
    fields: [activityHistory.activityId],
    references: [activities.id],
  }),
}));

export const activityChecklistItemsRelations = relations(
  activityChecklistItems,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityChecklistItems.activityId],
      references: [activities.id],
    }),
  })
);
