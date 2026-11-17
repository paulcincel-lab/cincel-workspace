import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { workflows } from "./workflows";

/**
 * Flows: a catalog of etapa sequences with their readiness gates as data
 * (#1035). Exactly one flow is the default; projects without a flow follow it.
 */
export const flows = core.table(
  "flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    ...stamps,
  },
  (t) => [
    unique("flows_key_uq").on(t.key),
    // At most one default flow.
    uniqueIndex("flows_single_default_uq")
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * The etapas of a flow, ordered. The optional gate says when the etapa is
 * ready: fase `gate_phase_key` (a `workflow_phases.key`) of etapa
 * `after_workflow_id` is done.
 */
export const flowTramos = core.table(
  "flow_tramos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    afterWorkflowId: uuid("after_workflow_id").references(() => workflows.id, {
      onDelete: "restrict",
    }),
    gatePhaseKey: text("gate_phase_key"),
    ...stamps,
  },
  (t) => [
    unique("flow_tramos_flow_workflow_uq").on(t.flowId, t.workflowId),
    index("idx_flow_tramos_flow_order").on(t.flowId, t.sortOrder),
    index("idx_flow_tramos_workflow_id").on(t.workflowId),
    index("idx_flow_tramos_after_workflow_id").on(t.afterWorkflowId),
  ],
);

export type Flow = typeof flows.$inferSelect;
export type NewFlow = typeof flows.$inferInsert;
export type FlowTramo = typeof flowTramos.$inferSelect;
export type NewFlowTramo = typeof flowTramos.$inferInsert;
