/**
 * Converts every task checklist item into a subtask (#1046), see
 * lib/repositories/task-checklist-conversion.ts. Safe to run again: items
 * already converted are skipped.
 *
 * Run with (needs DATABASE_URL):
 *   npm run tasks:convert-checklists -- --dry-run   # counts only, writes nothing
 *   npm run tasks:convert-checklists
 */
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../lib/db/schema";
import {
  convertChecklistToSubtasks,
  type ChecklistConversionReport,
} from "../lib/repositories/task-checklist-conversion";

export function formatConversionReport(report: ChecklistConversionReport, dryRun: boolean): string {
  return [
    dryRun ? "Checklist → subtasks (dry run, nothing written)" : "Checklist → subtasks",
    `  tasks with items:       ${report.tasksScanned}`,
    `  items converted:        ${report.itemsConverted}`,
    `  items moved to parent:  ${report.itemsPromotedToParent}`,
    `  already converted:      ${report.itemsSkipped}`,
    "",
  ].join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const report = await convertChecklistToSubtasks({ dryRun, db: drizzle(client, { schema }) });
    process.stdout.write(formatConversionReport(report, dryRun));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
