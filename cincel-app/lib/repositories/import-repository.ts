import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contacts, importBatches, projects, tasks } from "@/lib/db/schema";
import {
  clientColumnIds,
  importRefBoardId,
  withoutClientColumns,
  type BoardColumnTitles,
  type ColumnTitle,
} from "@/lib/import/client-columns";
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

export type ImportDataOptions = {
  /**
   * Remove the values of monday columns that carry client data (mapped to
   * `client`, `contact_email`, `contact_phone`, or the client relation column)
   * from a project's data: non-administrators (project flow BE §12, B2).
   */
  hideClientColumns?: boolean;
};

/** The monday import data kept for a row, or `null` when it was not imported. */
export async function getImportData(
  entity: ImportDataEntity,
  rowId: string,
  options: ImportDataOptions = {},
): Promise<ImportData | null> {
  const ref = await findImportRefByRow(db, "monday", entity, rowId);
  const data = ref ? toImportData(ref) : null;
  if (!ref || !data || !options.hideClientColumns || entity !== "project") return data;

  const boardId = importRefBoardId(ref.data);
  if (!boardId) return data;
  const [batch] = await db
    .select({ mapping: importBatches.mapping, exportPath: importBatches.exportPath })
    .from(importBatches)
    .where(eq(importBatches.id, ref.batchId))
    .limit(1);
  const ids = batch ? clientColumnIds(batch.mapping, boardId) : [];
  if (ids.length === 0) return data;
  const defs = batch ? await readBoardColumnTitles(batch.exportPath, boardId) : {};
  return withoutClientColumns(data, ids, defs);
}

/**
 * Column titles of a board from its export (`boards/<id>/board.json`), so
 * title-keyed values can be matched to column ids. Empty when the export
 * folder is no longer readable; id-keyed values are still removed then.
 */
async function readBoardColumnTitles(exportPath: string, boardId: string): Promise<BoardColumnTitles> {
  if (!/^[0-9A-Za-z_-]+$/.test(boardId)) return {};
  try {
    const board = JSON.parse(await readFile(join(exportPath, "boards", boardId, "board.json"), "utf8")) as {
      columns?: unknown;
      subitem_columns?: unknown;
    };
    return { columns: titlesOf(board.columns), subitemColumns: titlesOf(board.subitem_columns) };
  } catch {
    return {};
  }
}

function titlesOf(value: unknown): ColumnTitle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) =>
    c && typeof c === "object" && typeof c.id === "string" && typeof c.title === "string"
      ? [{ id: c.id, title: c.title }]
      : [],
  );
}
