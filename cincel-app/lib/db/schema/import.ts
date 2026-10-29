import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { core, stamps } from "./_schema";
import { staff } from "./people";
import { projects } from "./projects";
import { tasks } from "./tasks";

/**
 * One-time imports from other tools (monday migration, BE §8). Provenance
 * lives here, never in `monday_id` columns on core tables.
 */
export const importBatchStatus = core.enum("import_batch_status", [
  "applying",
  "applied",
  "rolled_back",
]);

/** One `apply` run of one export folder. */
export const importBatches = core.table(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull().default("monday"),
    accountId: text("account_id").notNull(),
    accountSlug: text("account_slug"),
    accountName: text("account_name"),
    exportedByEmail: text("exported_by_email"),
    exportedAt: timestamp("exported_at", { withTimezone: true }).notNull(),
    exportPath: text("export_path").notNull(),
    apiVersion: text("api_version").notNull().default("2026-07"),
    mapping: jsonb("mapping").notNull(),
    stats: jsonb("stats").notNull().default(sql`'{}'::jsonb`),
    status: importBatchStatus("status").notNull().default("applying"),
    appliedById: uuid("applied_by_id")
      .notNull()
      .references(() => staff.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("idx_import_batches_account_status").on(t.accountId, t.status)]
);

/**
 * One row per Cincel row an import created: provenance, untranslated data and
 * the `updated_at` snapshot the rollback change check compares against.
 *
 * `entity`: contact | contact_person | provider_profile | project |
 * project_schedule | task | checklist_item | task_support | task_dependency |
 * history_event | schedule_task | task_link | project_link | drive_file.
 * `external_id`: the source id; task_support uses "<itemId>:<userId>", groups
 * "<boardId>:<groupId>". `row_id`: the Cincel row id; task_support stores the
 * task id (the staff id goes in `data.staffId`).
 */
export const importRefs = core.table(
  "import_refs",
  {
    source: text("source").notNull(),
    entity: text("entity").notNull(),
    externalId: text("external_id").notNull(),
    rowId: uuid("row_id").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "restrict" }),
    data: jsonb("data"),
    rowUpdatedAt: timestamp("row_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.entity, t.externalId] }),
    index("idx_import_refs_row").on(t.entity, t.rowId),
    index("idx_import_refs_batch").on(t.batchId),
  ]
);

/** Files waiting for, or done with, the Drive upload (apply phase B). */
export const importFiles = core.table(
  "import_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "restrict" }),
    assetId: text("asset_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    // Null: the file is linked from the project, not a task.
    taskId: uuid("task_id").references(() => tasks.id),
    groupName: text("group_name"),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: text("sha256").notNull(),
    localPath: text("local_path").notNull(),
    // Null: upload pending.
    driveFileId: text("drive_file_id"),
    error: text("error"),
    ...stamps,
  },
  (t) => [uniqueIndex("import_files_batch_asset_uq").on(t.batchId, t.assetId)]
);

export type ImportBatchStatus = (typeof importBatchStatus.enumValues)[number];
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
export type ImportRef = typeof importRefs.$inferSelect;
export type NewImportRef = typeof importRefs.$inferInsert;
export type ImportFile = typeof importFiles.$inferSelect;
export type NewImportFile = typeof importFiles.$inferInsert;
