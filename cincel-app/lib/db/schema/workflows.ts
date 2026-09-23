import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, soft, stamps, taskPriority } from "./_schema";
import { areas } from "./people";

/** Presale, Diseño, Construcción, ... (Part C.3). Decoración was retired (migration 0010). */
export const workflows = core.table(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
    ...soft,
  },
  (t) => [uniqueIndex("workflows_key_uq").on(t.key).where(sql`${t.deletedAt} is null`)]
);

/** One predefined task in a workflow, ordered. */
export const workflowTaskTemplates = core.table(
  "workflow_task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    phase: text("phase"),
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
    // Only active templates compete for a title, so a retired one can be replaced.
    uniqueIndex("workflow_task_templates_title_lower_uq")
      .on(t.workflowId, sql`lower(${t.title})`)
      .where(sql`${t.active} = true`),
    index("idx_workflow_task_templates_order").on(t.workflowId, t.sortOrder),
  ]
);

/** Which workflows an area owns. */
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

export const workflowsRelations = relations(workflows, ({ many }) => ({
  templates: many(workflowTaskTemplates),
  areas: many(areaWorkflows),
}));

export const workflowTaskTemplatesRelations = relations(workflowTaskTemplates, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowTaskTemplates.workflowId],
    references: [workflows.id],
  }),
}));

export const areaWorkflowsRelations = relations(areaWorkflows, ({ one }) => ({
  area: one(areas, { fields: [areaWorkflows.areaId], references: [areas.id] }),
  workflow: one(workflows, { fields: [areaWorkflows.workflowId], references: [workflows.id] }),
}));
