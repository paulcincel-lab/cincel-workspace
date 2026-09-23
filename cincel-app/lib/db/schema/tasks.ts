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
import { bytea, core, soft, stamps, taskKind, taskPriority, taskStatus } from "./_schema";
import { staff } from "./people";
import { projects } from "./projects";
import { workflows, workflowTaskTemplates } from "./workflows";

/**
 * Admin-defined task statuses. Each maps to one of the four base statuses,
 * which stays the source of truth for logic and metrics; the custom one is
 * display/selection only.
 */
export const taskStatuses = core.table(
  "task_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseStatus: taskStatus("base_status").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [
    uniqueIndex("task_statuses_name_lower_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ]
);

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
    customStatusId: uuid("custom_status_id").references(() => taskStatuses.id, {
      onDelete: "set null",
    }),
    priority: taskPriority("priority").notNull().default("media"),
    // Manual drag-and-drop order within a project (Actividades). Null means
    // "not manually ordered yet" — those tasks keep sorting by commitmentDate.
    sortOrder: integer("sort_order"),
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
    index("idx_tasks_custom_status_id").on(t.customStatusId),
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

/**
 * Files attached to a task as a comment (#425). Bytes live in Postgres
 * (`bytea`) — the app has no object storage service, and the 10MB cap keeps
 * that acceptable. Never deleted: an attachment is a comment, and comments
 * are append-only history (AGENTS.md — "nunca eliminar historial").
 */
export const taskAttachments = core.table(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => staff.id, { onDelete: "set null" }),
    // Set when the file is a photo evidencing a specific checklist item (#436).
    // `set null` if the item is removed: the photo stays on the task (history
    // is never deleted) and simply shows under the task's general attachments.
    checklistItemId: uuid("checklist_item_id").references(() => taskChecklistItems.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    index("idx_task_attachments_checklist_item_id").on(t.checklistItemId),
    check("task_attachments_mime_check", sql`${t.mimeType} like 'image/%' or ${t.mimeType} = 'text/plain'`),
    check("task_attachments_size_check", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`),
    index("idx_task_attachments_task_id").on(t.taskId),
  ]
);

/**
 * Drive/web links attached to a task, split by whose they are: `interno`
 * (the studio's own files) or `cliente` (files shared by/with the client).
 */
export const taskLinks = core.table(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    createdById: uuid("created_by_id").references(() => staff.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    check("task_links_kind_check", sql`${t.kind} in ('interno', 'cliente')`),
    index("idx_task_links_task_id").on(t.taskId),
  ]
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
  attachments: many(taskAttachments),
  links: many(taskLinks),
}));

export const taskSupportRelations = relations(taskSupport, ({ one }) => ({
  task: one(tasks, { fields: [taskSupport.taskId], references: [tasks.id] }),
  staff: one(staff, { fields: [taskSupport.staffId], references: [staff.id] }),
}));

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  task: one(tasks, { fields: [taskChecklistItems.taskId], references: [tasks.id] }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  uploadedBy: one(staff, { fields: [taskAttachments.uploadedById], references: [staff.id] }),
}));

export const taskLinksRelations = relations(taskLinks, ({ one }) => ({
  task: one(tasks, { fields: [taskLinks.taskId], references: [tasks.id] }),
}));
