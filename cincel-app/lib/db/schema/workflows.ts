import { relations, sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, soft, stamps, taskPriority } from "./_schema";

/**
 * When a tramo starts by itself (project flow, BE §3.2): `on_create` (first
 * tramo, on project create), `on_ready` (later tramos, when the gate fase is
 * done) or `manual`. The first/later rule is enforced in `setWorkflowAutoStart`.
 */
export const workflowAutoStart = core.enum("workflow_auto_start", ["on_create", "on_ready", "manual"]);

/** Tramos: Presale, Diseño, Construcción (Part C.3; ADR 0003). Decoración was retired (migration 0010). */
export const workflows = core.table(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    autoStart: workflowAutoStart("auto_start").notNull().default("manual"),
    ...stamps,
    ...soft,
  },
  (t) => [uniqueIndex("workflows_key_uq").on(t.key).where(sql`${t.deletedAt} is null`)]
);

/**
 * Fases: the ordered catalog of a tramo (BE §3.3). Never deleted; deactivating
 * hides a fase from selects and keeps it on tasks.
 */
export const workflowPhases = core.table(
  "workflow_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    /** Stable code for fases the code refers to (readiness gates, seed). Never shown; survives renames. */
    key: text("key"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
  },
  (t) => [
    // Target of the composite FKs (tasks, templates): a fase always belongs to the row's tramo.
    unique("workflow_phases_id_workflow_uq").on(t.id, t.workflowId),
    uniqueIndex("workflow_phases_name_lower_uq").on(t.workflowId, sql`lower(${t.name})`),
    uniqueIndex("workflow_phases_key_uq").on(t.workflowId, t.key).where(sql`${t.key} is not null`),
    // Covers the workflow_id FK.
    index("idx_workflow_phases_workflow_order").on(t.workflowId, t.sortOrder),
  ]
);

/** One predefined task in a tramo, ordered, in one of its fases. */
export const workflowTaskTemplates = core.table(
  "workflow_task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    /** @deprecated Free-text fase; replaced by `phaseId`. Dropped in release B (0025). */
    phase: text("phase"),
    /** Nullable until release B (0025) sets it NOT NULL. */
    phaseId: uuid("phase_id"),
    title: text("title").notNull(),
    notes: text("notes"),
    defaultPriority: taskPriority("default_priority").notNull().default("media"),
    // Days from project start_date.
    commitmentOffsetDays: integer("commitment_offset_days"),
    reviewOffsetDays: integer("review_offset_days"),
    deliveryOffsetDays: integer("delivery_offset_days"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
  },
  (t) => [
    // Lets tasks FK to (template, workflow) — rule 2.
    unique("workflow_task_templates_id_workflow_uq").on(t.id, t.workflowId),
    // A template's fase belongs to the template's tramo.
    foreignKey({
      name: "workflow_task_templates_phase_fk",
      columns: [t.phaseId, t.workflowId],
      foreignColumns: [workflowPhases.id, workflowPhases.workflowId],
    }).onDelete("restrict"),
    // Only active templates compete for a title, per fase: the seed has the
    // same title in two fases of one tramo ("Fachadas y alzados", "Garantías").
    uniqueIndex("workflow_task_templates_title_lower_uq")
      .on(t.workflowId, t.phaseId, sql`lower(${t.title})`)
      .where(sql`${t.active} = true`),
    index("idx_workflow_task_templates_order").on(t.workflowId, t.sortOrder),
    index("idx_workflow_task_templates_phase_id").on(t.phaseId),
  ]
);

export const workflowsRelations = relations(workflows, ({ many }) => ({
  templates: many(workflowTaskTemplates),
  phases: many(workflowPhases),
}));

export const workflowPhasesRelations = relations(workflowPhases, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowPhases.workflowId], references: [workflows.id] }),
  templates: many(workflowTaskTemplates),
}));

export const workflowTaskTemplatesRelations = relations(workflowTaskTemplates, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowTaskTemplates.workflowId],
    references: [workflows.id],
  }),
  phaseRow: one(workflowPhases, {
    fields: [workflowTaskTemplates.phaseId],
    references: [workflowPhases.id],
  }),
}));
