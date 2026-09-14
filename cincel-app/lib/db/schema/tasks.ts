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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, soft, stamps, taskKind, taskPriority, taskStatus } from "./_schema";
import { staff } from "./people";
import { projects } from "./projects";
import { workflows, workflowTaskTemplates } from "./workflows";

/** Workflow task or user task; always on a project (Part C.4, rules 2–5). */
export const tasks = core.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: taskKind("kind").notNull(),
    templateId: uuid("template_id"),
    // `restrict`, not `set null`: nulling it would violate tasks_kind_check on
    // workflow tasks. Workflows are soft-deleted anyway.
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "restrict" }),
    phase: text("phase"),
    title: text("title").notNull(),
    notes: text("notes"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => staff.id),
    managerId: uuid("manager_id").references(() => staff.id, { onDelete: "set null" }),
    status: taskStatus("status").notNull().default("pendiente"),
    priority: taskPriority("priority").notNull().default("media"),
    // No ordering check between the three dates, by design.
    commitmentDate: date("commitment_date"),
    reviewDate: date("review_date"),
    deliveryDate: date("delivery_date"),
    archived: boolean("archived").notNull().default(false),
    ...stamps,
    ...soft,
  },
  (t) => [
    // Rule 2: a task stamped from template T always has T's workflow.
    foreignKey({
      name: "tasks_template_fk",
      columns: [t.templateId, t.workflowId],
      foreignColumns: [workflowTaskTemplates.id, workflowTaskTemplates.workflowId],
    }).onDelete("restrict"),
    // Rule 4: either a workflow task or a user task.
    check(
      "tasks_kind_check",
      sql`(${t.kind} = 'workflow' and ${t.templateId} is not null and ${t.workflowId} is not null) or (${t.kind} = 'usuario' and ${t.templateId} is null)`
    ),
    // Rule 3: a template is applied at most once per project (live rows).
    uniqueIndex("tasks_project_template_uq")
      .on(t.projectId, t.templateId)
      .where(sql`${t.templateId} is not null and ${t.deletedAt} is null`),
    index("idx_tasks_project_id").on(t.projectId),
    index("idx_tasks_manager_id").on(t.managerId),
    index("idx_tasks_created_by_id").on(t.createdById),
    index("idx_tasks_workflow_id").on(t.workflowId),
    index("idx_tasks_status").on(t.status),
    index("idx_tasks_commitment_date").on(t.commitmentDate),
    index("idx_tasks_review_date").on(t.reviewDate),
    index("idx_tasks_delivery_date").on(t.deliveryDate),
    index("idx_tasks_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
    // The hot set: live, unarchived tasks by status and commitment.
    index("idx_tasks_hot")
      .on(t.status, t.commitmentDate)
      .where(sql`${t.deletedAt} is null and ${t.archived} = false`),
  ]
);

/** Supporting staff on a task. */
export const taskSupport = core.table(
  "task_support",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.staffId] }),
    index("idx_task_support_staff_id").on(t.staffId),
  ]
);

export const taskChecklistItems = core.table(
  "task_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [index("idx_task_checklist_items_task_id").on(t.taskId)]
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  template: one(workflowTaskTemplates, {
    fields: [tasks.templateId],
    references: [workflowTaskTemplates.id],
  }),
  workflow: one(workflows, { fields: [tasks.workflowId], references: [workflows.id] }),
  createdBy: one(staff, {
    fields: [tasks.createdById],
    references: [staff.id],
    relationName: "task_creator",
  }),
  manager: one(staff, {
    fields: [tasks.managerId],
    references: [staff.id],
    relationName: "task_manager",
  }),
  support: many(taskSupport),
  checklist: many(taskChecklistItems),
}));

export const taskSupportRelations = relations(taskSupport, ({ one }) => ({
  task: one(tasks, { fields: [taskSupport.taskId], references: [tasks.id] }),
  staff: one(staff, { fields: [taskSupport.staffId], references: [staff.id] }),
}));

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  task: one(tasks, { fields: [taskChecklistItems.taskId], references: [tasks.id] }),
}));
