// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  dependencyKind,
  driveFolderStatus,
  importBatchStatus,
  importBatches,
  importFiles,
  importRefs,
  projects,
  taskDependencies,
  tasks,
} from "@/lib/db/schema";

const MIGRATIONS = join(__dirname, "../../../lib/db/migrations");

describe("monday migration schema", () => {
  it("re-exports the import tables and enums from the schema index", () => {
    expect(importBatchStatus.enumValues).toEqual(["applying", "applied", "rolled_back"]);
    expect(driveFolderStatus.enumValues).toEqual(["pending", "ready", "failed"]);
    expect(dependencyKind.enumValues).toEqual(["finish_to_start"]);
    for (const table of [importBatches, importRefs, importFiles, taskDependencies]) {
      expect(getTableConfig(table).schema).toBe("core");
    }
  });

  it("keys import_refs on (source, entity, external_id) and keeps row_updated_at", () => {
    const cfg = getTableConfig(importRefs);
    expect(cfg.primaryKeys[0].columns.map((c) => c.name)).toEqual([
      "source",
      "entity",
      "external_id",
    ]);
    expect(cfg.columns.map((c) => c.name)).toContain("row_updated_at");
    expect(cfg.foreignKeys[0].onDelete).toBe("restrict");
  });

  it("adds the Drive columns to projects", () => {
    const cols = getTableConfig(projects).columns;
    const names = cols.map((c) => c.name);
    for (const name of [
      "drive_folder_id",
      "drive_internal_folder_id",
      "drive_client_folder_id",
      "drive_inbound_folder_id",
      "drive_import_folder_id",
      "drive_folder_error",
    ]) {
      expect(names).toContain(name);
    }
    const status = cols.find((c) => c.name === "drive_folder_status");
    expect(status?.notNull).toBe(true);
    expect(status?.default).toBe("pending");
  });

  it("gives tasks a self-referencing parent_task_id with set null", () => {
    const cfg = getTableConfig(tasks);
    const fk = cfg.foreignKeys.find((f) => f.reference().columns[0].name === "parent_task_id");
    expect(fk?.reference().foreignTable).toBe(tasks);
    expect(fk?.onDelete).toBe("set null");
    expect(cfg.indexes.map((i) => i.config.name)).toContain("idx_tasks_parent_task_id");
  });

  it("gives task_dependencies a uuid id, a unique pair and a not-self check", () => {
    const cfg = getTableConfig(taskDependencies);
    expect(cfg.columns.find((c) => c.name === "id")?.primary).toBe(true);
    const pair = cfg.indexes.find((i) => i.config.name === "task_dependencies_pair_uq");
    expect(pair?.config.unique).toBe(true);
    expect(cfg.checks.map((c) => c.name)).toContain("task_dependencies_not_self");
    expect(cfg.foreignKeys.every((f) => f.onDelete === "cascade")).toBe(true);
  });

  it("ships everything in one migration", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    const hits = files.filter((f) =>
      /import_refs|task_dependencies|parent_task_id|drive_folder_status/.test(
        readFileSync(join(MIGRATIONS, f), "utf8")
      )
    );
    expect(hits).toEqual(["0017_monday_migration_schema.sql"]);
  });
});
