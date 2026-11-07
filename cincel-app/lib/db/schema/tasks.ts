import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, core, soft, stamps, taskKind, taskPriority, taskStatus } from "./_schema";
import { staff } from "./people";
import { projects, projectSpaces, tramoStartBatches } from "./projects";
import { workflowPhases, workflows, workflowTaskTemplates } from "./workflows";

/**
 * Admin-defined task statuses: statuses of their own, next to the four
 * built-in ones — not variants of them. `closes` marks a status that closes
 * the task (like Completado) for overdue and open counts; `countsAsCompleted`
 * marks closed work that counts as done for metrics, readiness and progress
 * (Cancelado closes but doesn't count). BE §3.6.
 */
export const taskStatuses = core.table(
  "task_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    closes: boolean("closes").notNull().default(false),
    countsAsCompleted: boolean("counts_as_completed").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [
    check("task_statuses_counts_check", sql`not ${t.countsAsCompleted} or ${t.closes}`),
    uniqueIndex("task_statuses_name_lower_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ]
);

/**
 * Workflow task, user task or admin task; always on a project (Part C.4,
 * rules 2–5; project flow BE §3.5). A task's fase belongs to its tramo and its
 * espacio to its project (composite FKs).
 */
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
    /** @deprecated Free-text fase; replaced by `phaseId`. Dropped in release B (0025). */
    phase: text("phase"),
    /** Fase of the task's tramo (`tasks_phase_fk`); null = "Sin fase · revisar". */
    phaseId: uuid("phase_id"),
    /** Optional espacio of the task's project (`tasks_space_fk`). */
    spaceId: uuid("space_id"),
    /** When the task last closed (status completado or a closing custom status); null while open. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Marks system-made tasks, e.g. 'assign_client' for "Asignar cliente y origen". */
    systemKey: text("system_key"),
    /** The "Iniciar tramo" batch that created the task (undo). */
    startBatchId: uuid("start_batch_id").references(() => tramoStartBatches.id, { onDelete: "set null" }),
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
    // Child task. One level of nesting: a task with a parent can't be a
    // parent (checked in the actions and the import, not here).
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
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
    // A task's fase belongs to the task's tramo.
    foreignKey({
      name: "tasks_phase_fk",
      columns: [t.phaseId, t.workflowId],
      foreignColumns: [workflowPhases.id, workflowPhases.workflowId],
    }).onDelete("restrict"),
    // A task's espacio belongs to the task's project. `restrict`, not `set null`:
    // on a composite FK `set null` would null project_id too (BE §3.5).
    foreignKey({
      name: "tasks_space_fk",
      columns: [t.spaceId, t.projectId],
      foreignColumns: [projectSpaces.id, projectSpaces.projectId],
    }).onDelete("restrict"),
    // MATCH SIMPLE skips a composite FK when any column is null: a fase without a tramo would slip through.
    check("tasks_phase_needs_workflow_check", sql`${t.phaseId} is null or ${t.workflowId} is not null`),
    // Rule 4: a workflow task, a user task or an admin task. Compares kind::text:
    // 0023 adds 'admin' in the same transaction, and Postgres refuses to use a
    // new enum value before commit (a text comparison isn't a use).
    check(
      "tasks_kind_check",
      sql`(${t.kind}::text = 'workflow' and ${t.templateId} is not null and ${t.workflowId} is not null) or (${t.kind}::text = 'usuario' and ${t.templateId} is null) or (${t.kind}::text = 'admin' and ${t.templateId} is null and ${t.workflowId} is null and ${t.phaseId} is null and ${t.spaceId} is null)`
    ),
    // Created NOT VALID in 0023 and validated in 0024 step 8, after the backfill.
    check("tasks_closed_at_check", sql`${t.closedAt} is null or ${t.status} = 'completado'`),
    uniqueIndex("tasks_project_system_key_uq")
      .on(t.projectId, t.systemKey)
      .where(sql`${t.systemKey} is not null and ${t.deletedAt} is null`),
    index("idx_tasks_phase_id").on(t.phaseId),
    index("idx_tasks_space_id").on(t.spaceId),
    index("idx_tasks_start_batch_id").on(t.startBatchId),
    // Index predicates must be IMMUTABLE, so kind::text (enum_out is STABLE) is not allowed
    // here, and 'admin' can't be referenced before 0023 commits. The other two values are
    // existing labels and enum comparison is immutable, so this is the same as kind = 'admin'.
    index("idx_tasks_kind")
      .on(t.kind)
      .where(sql`${t.kind} not in ('workflow', 'usuario') and ${t.deletedAt} is null`),
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
    index("idx_tasks_parent_task_id").on(t.parentTaskId),
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

export const dependencyKind = core.enum("dependency_kind", ["finish_to_start"]);
export type DependencyKind = (typeof dependencyKind.enumValues)[number];

/** `task_id` waits on `depends_on_task_id`. */
export const taskDependencies = core.table(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: dependencyKind("kind").notNull().default("finish_to_start"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("task_dependencies_pair_uq").on(t.taskId, t.dependsOnTaskId),
    index("idx_task_dependencies_depends_on").on(t.dependsOnTaskId),
    check("task_dependencies_not_self", sql`${t.taskId} <> ${t.dependsOnTaskId}`),
  ]
);

export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  template: one(workflowTaskTemplates, {
    fields: [tasks.templateId],
    references: [workflowTaskTemplates.id],
  }),
  workflow: one(workflows, { fields: [tasks.workflowId], references: [workflows.id] }),
  phaseRow: one(workflowPhases, { fields: [tasks.phaseId], references: [workflowPhases.id] }),
  space: one(projectSpaces, { fields: [tasks.spaceId], references: [projectSpaces.id] }),
  startBatch: one(tramoStartBatches, { fields: [tasks.startBatchId], references: [tramoStartBatches.id] }),
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
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "task_parent",
  }),
  children: many(tasks, { relationName: "task_parent" }),
  dependencies: many(taskDependencies, { relationName: "task_dependency_task" }),
  dependents: many(taskDependencies, { relationName: "task_dependency_depends_on" }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "task_dependency_task",
  }),
  dependsOn: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: "task_dependency_depends_on",
  }),
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
