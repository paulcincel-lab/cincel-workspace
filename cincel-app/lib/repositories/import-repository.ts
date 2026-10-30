import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contacts, projects, tasks } from "@/lib/db/schema";
import { toImportData } from "@/lib/import/import-data";
import { findImportRefByRow } from "@/lib/import/refs";
import type { ImportData } from "@/lib/types/core";

/** Rows the "Datos de monday" panel is shown on (FE §2.3). */
export type ImportDataEntity = "task" | "project" | "contact";

/** True when the row exists and isn't deleted (archived tasks still count). */
export async function importDataRowExists(
  entity: ImportDataEntity,
  rowId: string,
): Promise<boolean> {
  const table =
    entity === "task" ? tasks : entity === "project" ? projects : contacts;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, rowId), isNull(table.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/** The monday import data kept for a row, or `null` when it was not imported. */
export async function getImportData(
  entity: ImportDataEntity,
  rowId: string,
): Promise<ImportData | null> {
  const ref = await findImportRefByRow(db, "monday", entity, rowId);
  return ref ? toImportData(ref) : null;
}
