/**
 * Client data inside a project's monday import data (project flow BE §12, B2):
 * the values of monday columns mapped to `client`, `contact_email` or
 * `contact_phone`, and the relation column a client is read from, are hidden
 * from non-administrators. Pure: no db or file access.
 *
 * `ImportData.data.columns` is keyed by column title, or `<title>#<columnId>`
 * when two columns share a title (scripts/monday/translate.ts `columnKeys`).
 */
import type { ImportData } from "../types/core";

const CLIENT_TARGETS = new Set(["client", "contact_email", "contact_phone"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relationColumn(ref: unknown): string | null {
  return isRecord(ref) && ref.kind === "relation_column" && typeof ref.columnId === "string"
    ? ref.columnId
    : null;
}

/**
 * The monday board id an import ref came from (`import_refs.data.source.boardId`),
 * or `null`.
 */
export function importRefBoardId(refData: unknown): string | null {
  if (!isRecord(refData) || !isRecord(refData.source)) return null;
  const id = refData.source.boardId;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Column ids of `boardId` in a batch's stored mapping (`import_batches.mapping`)
 * that carry client data. Read leniently: an unknown shape yields no ids.
 */
export function clientColumnIds(mapping: unknown, boardId: string): string[] {
  if (!isRecord(mapping) || !Array.isArray(mapping.boards)) return [];
  const board = mapping.boards.find(
    (b): b is Record<string, unknown> => isRecord(b) && b.mondayBoardId === boardId,
  );
  if (!board) return [];
  const ids = new Set<string>();
  for (const key of ["columns", "subitemColumns"] as const) {
    const columns = board[key];
    if (!isRecord(columns)) continue;
    for (const [id, target] of Object.entries(columns)) {
      if (typeof target === "string" && CLIENT_TARGETS.has(target)) ids.add(id);
    }
  }
  const boardClient = relationColumn(board.client);
  if (boardClient) ids.add(boardClient);
  if (isRecord(board.groupClients)) {
    for (const ref of Object.values(board.groupClients)) {
      const id = relationColumn(ref);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Column definitions as an export's `board.json` keeps them. */
export type ColumnTitle = { id: string; title: string };

/**
 * The `data.columns` keys the given column ids can be stored under: the id
 * itself, `<title>#<id>`, and the plain title when the title is unique in
 * `defs` (the first column with a title keeps the plain title).
 */
export function columnKeysFor(ids: readonly string[], defs: readonly ColumnTitle[] = []): Set<string> {
  const keys = new Set<string>();
  const plainOwner = new Map<string, string>();
  for (const d of defs) if (!plainOwner.has(d.title)) plainOwner.set(d.title, d.id);
  for (const id of ids) {
    keys.add(id);
    for (const d of defs) {
      if (d.id !== id) continue;
      keys.add(`${d.title}#${d.id}`);
      if (plainOwner.get(d.title) === id) keys.add(d.title);
    }
  }
  return keys;
}

/** `true` when `key` is one of `keys`, or ends with `#<id>` of a hidden id. */
function isHidden(key: string, keys: Set<string>, ids: readonly string[]): boolean {
  return keys.has(key) || ids.some((id) => key.endsWith(`#${id}`));
}

/** Column definitions of the board an import ref came from, when the export is readable. */
export type BoardColumnTitles = { columns?: readonly ColumnTitle[]; subitemColumns?: readonly ColumnTitle[] };

/**
 * A copy of `importData` without the client columns: removed from
 * `data.columns` (item columns) and from each checklist subitem's `columns`
 * (subitem columns). Without `defs` only `#<id>` and bare-id keys match.
 */
export function withoutClientColumns(
  importData: ImportData,
  ids: readonly string[],
  defs: BoardColumnTitles = {},
): ImportData {
  if (ids.length === 0) return importData;
  const itemKeys = columnKeysFor(ids, defs.columns);
  const subitemKeys = columnKeysFor(ids, defs.subitemColumns);
  const strip = (columns: unknown, keys: Set<string>): unknown =>
    isRecord(columns)
      ? Object.fromEntries(Object.entries(columns).filter(([key]) => !isHidden(key, keys, ids)))
      : columns;

  const data: Record<string, unknown> = { ...importData.data };
  if ("columns" in data) data.columns = strip(data.columns, itemKeys);
  if (isRecord(data.subitems)) {
    data.subitems = Object.fromEntries(
      Object.entries(data.subitems).map(([id, sub]) => [
        id,
        isRecord(sub) ? { ...sub, columns: strip(sub.columns, subitemKeys) } : sub,
      ]),
    );
  }
  return { ...importData, data };
}
