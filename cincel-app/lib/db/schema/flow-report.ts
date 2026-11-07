import { sql } from "drizzle-orm";
import { index, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { core } from "./_schema";

/**
 * What the project flow data migration changed or couldn't place (BE §3.12,
 * §4.4), printed by `npm run flow:report`. No FK on `entity_id`: the report
 * outlives the rows it describes (áreas are dropped in release B).
 */
export const projectFlowMigrationReport = core.table(
  "project_flow_migration_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** One of PROJECT_FLOW_REPORT_KINDS (lib/project-flow/catalog.ts). */
    kind: text("kind").notNull(),
    /** task | template | project | area | area_member | area_workflow | group_mapping | status */
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    value: text("value"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_flow_migration_report_uq").on(
      t.kind,
      t.entity,
      sql`coalesce(${t.entityId}::text, '')`,
      sql`coalesce(${t.value}, '')`
    ),
    index("idx_project_flow_migration_report_kind").on(t.kind),
  ]
);
