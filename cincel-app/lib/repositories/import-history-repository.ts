/**
 * Read side of the monday import history (Ajustes › Importar de monday,
 * redesign FE §3.8): the latest `import_batches` rows with who applied them.
 * Read only; the wizard and the CLI keep writing batches as before.
 */
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { importBatches, staff } from "@/lib/db/schema";
import type { MondayImportBatchRow } from "@/lib/monday-import/history";

/** How many batches the history lists. */
export const MONDAY_IMPORT_HISTORY_LIMIT = 20;

/** monday batches, newest first. */
export async function listMondayImportBatches(limit = MONDAY_IMPORT_HISTORY_LIMIT): Promise<MondayImportBatchRow[]> {
  const rows = await db
    .select({
      id: importBatches.id,
      status: importBatches.status,
      accountName: importBatches.accountName,
      accountSlug: importBatches.accountSlug,
      appliedAt: importBatches.appliedAt,
      rolledBackAt: importBatches.rolledBackAt,
      appliedByName: staff.name,
      mapping: importBatches.mapping,
      stats: importBatches.stats,
    })
    .from(importBatches)
    .leftJoin(staff, eq(staff.id, importBatches.appliedById))
    .where(eq(importBatches.source, "monday"))
    .orderBy(desc(importBatches.appliedAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows;
}
