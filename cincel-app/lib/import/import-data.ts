/**
 * Turns an `import_refs` row into the read-only "Datos de monday" payload
 * (docs/specs/monday-migration/frontend.md §2.3, §3). Pure: no db access.
 *
 * `import_refs.data` is `{ source: { boardId, boardName, groupId, groupTitle },
 * columns, subitems?, start?, milestone?, path?, staffId? }` (backend.md §8).
 * The board and group come from `data.source`; everything else is passed
 * through as `ImportData.data`.
 */
import type { ImportRef } from "../db/schema/import";
import type { ImportData } from "../types/core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** `null` when the ref is not a monday ref or kept no data. */
export function toImportData(
  ref: Pick<ImportRef, "source" | "data" | "createdAt">,
): ImportData | null {
  if (ref.source !== "monday" || !isRecord(ref.data)) return null;
  const { source, ...data } = ref.data;
  const origin = isRecord(source) ? source : {};
  return {
    source: "monday",
    importedAt: ref.createdAt.toISOString(),
    boardName: stringOrNull(origin.boardName),
    groupTitle: stringOrNull(origin.groupTitle),
    data,
  };
}
