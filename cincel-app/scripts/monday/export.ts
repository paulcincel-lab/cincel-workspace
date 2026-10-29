/**
 * `npm run monday -- export --out exports/<client> [--boards 123,456]`
 * (docs/specs/monday-migration/backend.md §4).
 *
 * Writes the export folder (§4.1):
 *
 *   manifest.json          account, exported_at, api_version, token_user, boards[], call_count, errors[]
 *   users.json             [{id, name, email, status, kind}]
 *   workspaces.json
 *   boards/<board_id>/
 *     board.json           {id, name, workspace_id, hierarchy_type, columns, groups, subitem_columns}
 *     items.ndjson         one item per line in API order, subitems nested to 5 levels
 *     updates.ndjson       one update per line ({item_id, ...update}), replies nested
 *     .done                written last; a re-run skips boards that have it
 *   files/
 *     index.json           asset_id → {name, size, sha256, path, board_id, item_id | update_id}
 *     <asset_id>/<original-name>
 *
 * Before anything is written, the call estimate (§4.3) is printed and the run
 * only starts after a "y" answer. A run that stops part way (killed, daily
 * limit, network) is resumed by running the same command again: boards with
 * `.done` are skipped, an unfinished board starts over.
 *
 * Updates are read 100 items per call; an item that returned a full page of
 * 100 is asked for again alone, page by page, until a page comes back short.
 * Assets are downloaded right after their `public_url` is fetched (it
 * expires); a download that still fails after 3 retries is recorded in
 * `manifest.errors[]` and the board still completes. `--no-updates` and
 * `--no-files` skip those stages.
 *
 * The token is never printed or written: only the client holds it.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import {
  createMondayClient,
  MONDAY_API_VERSION,
  MondayDailyLimitError,
  paginateItems,
  type MondayClient,
} from "./client";
import {
  AssetsDocument,
  BoardsDocument,
  FirstPageDocument,
  MeDocument,
  NextPageDocument,
  SubitemColumnsDocument,
  UpdatesDocument,
  UsersDocument,
  WorkspacesDocument,
  type MondayBoard,
  type MondayItem,
  type MondayUpdate,
  type MondayUser,
  type WorkspacesQuery,
} from "./queries";
import type { CliIo, CommandHandler } from "./run";
import { resolveMondayToken } from "./token";

/** Items per page: 200 on classic boards, 50 on multi-level boards (subitem trees cost more). */
export const PAGE_SIZE_CLASSIC = 200;
export const PAGE_SIZE_MULTI_LEVEL = 50;

const BOARDS_PER_PAGE = 100;
const USERS_PER_PAGE = 1000;
const WORKSPACES_PER_PAGE = 100;
const SUBITEM_BOARDS_PER_CALL = 100;
const UPDATES_ITEMS_PER_CALL = 100;
/** Updates per item per page; monday's maximum. */
export const UPDATES_PER_PAGE = 100;
const ASSETS_PER_CALL = 50;
/** A failed download is retried this many times before it is recorded as an error. */
export const DOWNLOAD_RETRIES = 3;

export const DONE_FILE = ".done";
export const FILES_DIR = "files";
export const FILES_INDEX = "index.json";

export interface ExportOptions {
  /** Output folder, e.g. exports/acme. */
  out: string;
  /** Only these board ids; every visible board when omitted. */
  boards?: string[];
  /** --no-updates turns this off. */
  updates: boolean;
  /** --no-files turns this off. */
  files: boolean;
}

export interface ExportDeps {
  client: MondayClient;
  io: CliIo;
  /** Asks a yes/no question; true only for an explicit yes. */
  confirm: (question: string) => Promise<boolean>;
  now?: () => Date;
  /** Downloads an asset's public_url; plain fetch by default (no token is sent). */
  download?: (url: string) => Promise<Uint8Array>;
  /** Waits between download retries. */
  sleep?: (ms: number) => Promise<void>;
}

/** One entry of files/index.json. */
export interface FileIndexEntry {
  name: string;
  size: number;
  sha256: string;
  /** Relative to the export folder, e.g. files/77/plano.pdf. */
  path: string;
  board_id: string;
  item_id?: string;
  update_id?: string;
}

export type FileIndex = Record<string, FileIndexEntry>;

/** A line of updates.ndjson. */
export type UpdateLine = { item_id: string } & MondayUpdate;

export interface ManifestBoard {
  id: string;
  name: string;
  items_count: number | null;
  done: boolean;
}

export interface ManifestError {
  at: string;
  board_id?: string;
  message: string;
}

export interface Manifest {
  account: { id: string; slug: string; name: string };
  exported_at: string;
  api_version: string;
  token_user: { id: string; name: string; email: string };
  boards: ManifestBoard[];
  call_count: number;
  errors: ManifestError[];
}

export interface BoardFile {
  id: string;
  name: string;
  workspace_id: string | null;
  hierarchy_type: string | null;
  columns: ColumnDef[];
  groups: { id: string; title: string; position: string }[];
  subitem_columns: ColumnDef[];
}

export interface ColumnDef {
  id: string;
  title: string;
  type: string;
  settings: unknown;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export type ParsedExportArgs = { ok: true; options: ExportOptions } | { ok: false; error: string };

export function parseExportArgs(args: string[]): ParsedExportArgs {
  let out: string | undefined;
  let boards: string[] | undefined;
  let updates = true;
  let files = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? args[++i];
      if (v === undefined || (inline === undefined && v.startsWith("--"))) {
        throw new Error(`${flag} needs a value`);
      }
      return v;
    };
    try {
      switch (flag) {
        case "--out":
          out = value();
          break;
        case "--boards": {
          const ids = value()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const bad = ids.filter((id) => !/^\d+$/.test(id));
          if (ids.length === 0 || bad.length > 0) {
            return { ok: false, error: `--boards takes comma-separated board ids (got "${bad.join(",") || "nothing"}")` };
          }
          boards = [...new Set(ids)];
          break;
        }
        case "--no-updates":
          updates = false;
          break;
        case "--no-files":
          files = false;
          break;
        default:
          return { ok: false, error: `unknown option "${arg}"` };
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  if (!out) return { ok: false, error: "--out is required (e.g. --out exports/acme)" };
  return { ok: true, options: { out, boards, updates, files } };
}

// ---------------------------------------------------------------------------
// Call estimate (§4.3)
// ---------------------------------------------------------------------------

export interface EstimateInput {
  /** Every visible board (the board list is paged over all of them). */
  totalBoards: number;
  /** The boards this run still has to export, with their page size. */
  boards: { items_count: number | null; pageSize: number }[];
  /** Number of subitem boards whose columns are fetched. */
  subitemBoards: number;
  /** Users in the account when known; the first page is counted otherwise. */
  users?: number;
  /** Assets when known; files are counted as items come in otherwise. */
  assets?: number;
  updates: boolean;
  files: boolean;
}

export interface Estimate {
  boards: number;
  items: number;
  updates: number;
  files: number;
  users: number;
  other: number;
  total: number;
}

/**
 * `ceil(boards/100) + ceil(items/200) + ceil(items/100) [updates] +
 * ceil(assets/50) [files] + ceil(users/1000)`, with items paged per board at
 * that board's page size (every board costs at least one call).
 */
export function estimateCalls(input: EstimateInput): Estimate {
  const boards = Math.max(1, Math.ceil(input.totalBoards / BOARDS_PER_PAGE));
  const items = input.boards.reduce(
    (sum, b) => sum + Math.max(1, Math.ceil((b.items_count ?? 0) / b.pageSize)),
    0,
  );
  const itemTotal = input.boards.reduce((sum, b) => sum + (b.items_count ?? 0), 0);
  const updates = input.updates ? Math.ceil(itemTotal / UPDATES_ITEMS_PER_CALL) : 0;
  const files = input.files ? Math.ceil((input.assets ?? 0) / ASSETS_PER_CALL) : 0;
  const users = Math.max(1, Math.ceil((input.users ?? 0) / USERS_PER_PAGE));
  // me (1), workspaces (1 page), subitem board columns.
  const other = 2 + Math.ceil(input.subitemBoards / SUBITEM_BOARDS_PER_CALL);
  return { boards, items, updates, files, users, other, total: boards + items + updates + files + users + other };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function pageSizeFor(board: Pick<MondayBoard, "hierarchy_type">): number {
  return board.hierarchy_type === "multi_level" ? PAGE_SIZE_MULTI_LEVEL : PAGE_SIZE_CLASSIC;
}

function toColumns(columns: MondayBoard["columns"]): ColumnDef[] {
  return (columns ?? [])
    .filter((c): c is NonNullable<typeof c> => c != null)
    .map((c) => ({ id: c.id, title: c.title, type: c.type, settings: c.settings ?? null }));
}

function parseSettings(settings: unknown): Record<string, unknown> | null {
  if (typeof settings === "string") {
    try {
      const parsed: unknown = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return settings && typeof settings === "object" ? (settings as Record<string, unknown>) : null;
}

/** Ids of the subitems boards a board's `subtasks` column points to. */
export function subitemBoardIds(board: Pick<MondayBoard, "columns">): string[] {
  const ids: string[] = [];
  for (const c of board.columns ?? []) {
    if (!c || c.type !== "subtasks") continue;
    const s = parseSettings(c.settings);
    const raw = s?.boardIds ?? s?.board_ids;
    if (Array.isArray(raw)) for (const id of raw) ids.push(String(id));
  }
  return [...new Set(ids)];
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function fetchAllBoards(client: MondayClient): Promise<MondayBoard[]> {
  const boards: MondayBoard[] = [];
  for (let page = 1; ; page++) {
    const data = await client.request(BoardsDocument, { page });
    const rows = (data.boards ?? []).filter((b): b is MondayBoard => b != null);
    boards.push(...rows);
    if (rows.length < BOARDS_PER_PAGE) break;
  }
  // Subitems boards, documents and custom objects are not boards of items to export.
  return boards.filter((b) => b.type == null || b.type === "board");
}

async function fetchAllUsers(client: MondayClient): Promise<MondayUser[]> {
  const users: MondayUser[] = [];
  for (let page = 1; ; page++) {
    const data = await client.request(UsersDocument, { page });
    const rows = data.users ?? [];
    users.push(...rows);
    if (rows.length < USERS_PER_PAGE) break;
  }
  return users;
}

type Workspace = NonNullable<NonNullable<WorkspacesQuery["workspaces"]>[number]>;

async function fetchAllWorkspaces(client: MondayClient): Promise<Workspace[]> {
  const workspaces: Workspace[] = [];
  for (let page = 1; ; page++) {
    const data = await client.request(WorkspacesDocument, { page });
    const rows = (data.workspaces ?? []).filter((w): w is Workspace => w != null);
    workspaces.push(...rows);
    if (rows.length < WORKSPACES_PER_PAGE) break;
  }
  return workspaces;
}

async function fetchSubitemColumns(client: MondayClient, ids: string[]): Promise<Map<string, ColumnDef[]>> {
  const byBoard = new Map<string, ColumnDef[]>();
  for (const part of chunk(ids, SUBITEM_BOARDS_PER_CALL)) {
    const data = await client.request(SubitemColumnsDocument, { ids: part });
    for (const b of data.boards ?? []) {
      if (b) byBoard.set(b.id, toColumns(b.columns));
    }
  }
  return byBoard;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Every item id in a tree, parents before their subitems. */
export function itemIds(items: MondayItem[]): string[] {
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { id?: string; subitems?: unknown[] | null };
    if (n.id) ids.push(n.id);
    for (const child of n.subitems ?? []) walk(child);
  };
  for (const item of items) walk(item);
  return ids;
}

type AssetRef = { item_id: string } | { update_id: string };

function addAssetRefs(refs: Map<string, AssetRef>, assets: unknown, ref: AssetRef) {
  if (!Array.isArray(assets)) return;
  for (const a of assets as ({ id?: string } | null)[]) {
    if (a?.id && !refs.has(a.id)) refs.set(a.id, ref);
  }
}

/** Assets referenced by items (and their subitems), keyed by asset id. */
function itemAssetRefs(items: MondayItem[], refs: Map<string, AssetRef>) {
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { id: string; assets?: unknown; subitems?: unknown[] | null };
    addAssetRefs(refs, n.assets, { item_id: n.id });
    for (const child of n.subitems ?? []) walk(child);
  };
  for (const item of items) walk(item);
}

/**
 * Updates of the given items: page 1 for 100 items per call, then every item
 * that returned a full page is asked for alone with the next page until a
 * page comes back short. Returns the updates per item id, in API order.
 */
export async function fetchUpdates(client: MondayClient, ids: string[]): Promise<Map<string, MondayUpdate[]>> {
  const byItem = new Map<string, MondayUpdate[]>();
  const full: string[] = [];
  for (const part of chunk(ids, UPDATES_ITEMS_PER_CALL)) {
    const data = await client.request(UpdatesDocument, { ids: part, page: 1 });
    for (const item of data.items ?? []) {
      if (!item) continue;
      const updates = item.updates ?? [];
      byItem.set(item.id, [...(byItem.get(item.id) ?? []), ...updates]);
      if (updates.length >= UPDATES_PER_PAGE) full.push(item.id);
    }
  }
  for (const id of full) {
    for (let page = 2; ; page++) {
      const data = await client.request(UpdatesDocument, { ids: [id], page });
      const updates = data.items?.find((i) => i?.id === id)?.updates ?? [];
      byItem.get(id)!.push(...updates);
      if (updates.length < UPDATES_PER_PAGE) break;
    }
  }
  return byItem;
}

/** A file name safe to use inside files/<asset_id>/. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? fallback : cleaned;
}

async function defaultDownload(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Runs one export into `options.out`; returns the exit code. */
export async function runExport(options: ExportOptions, deps: ExportDeps): Promise<number> {
  const { client, io } = deps;
  const now = deps.now ?? (() => new Date());
  const out = resolve(options.out);
  const manifestPath = join(out, "manifest.json");
  const callsBefore = client.callCount;

  const me = (await client.request(MeDocument, {})).me;
  if (!me) throw new Error("monday: the token has no user (me is null)");
  const account = { id: me.account.id, slug: me.account.slug, name: me.account.name };

  const previous = await readJson<Manifest>(manifestPath);
  if (previous && previous.account.id !== account.id) {
    io.stderr(
      `monday: ${options.out} holds an export of account ${previous.account.slug} (${previous.account.id}), ` +
        `but the token belongs to ${account.slug} (${account.id}). Use another --out folder.\n`,
    );
    return 1;
  }

  const visible = await fetchAllBoards(client);
  let selected = visible;
  if (options.boards) {
    const byId = new Map(visible.map((b) => [b.id, b]));
    const missing = options.boards.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      io.stderr(`monday: board(s) not found or not visible to this token: ${missing.join(", ")}\n`);
      return 1;
    }
    selected = options.boards.map((id) => byId.get(id)!);
  }

  const isDone = (id: string) => existsSync(join(out, "boards", id, DONE_FILE));
  const pending = selected.filter((b) => !isDone(b.id));
  const subitemIds = [...new Set(pending.flatMap((b) => subitemBoardIds(b)))];

  // Assets are only known once items are read, so files add to this as they come in.
  const estimate = estimateCalls({
    totalBoards: visible.length,
    boards: pending.map((b) => ({ items_count: b.items_count ?? null, pageSize: pageSizeFor(b) })),
    subitemBoards: subitemIds.length,
    updates: options.updates,
    files: options.files,
  });

  io.stdout(
    `Account: ${account.name} (${account.slug}), token user ${me.name}\n` +
      `Boards visible to this token: ${visible.length}` +
      (options.boards ? `, selected: ${selected.length}` : "") +
      `, already done: ${selected.length - pending.length}, to export: ${pending.length}\n` +
      `Estimated monday API calls: ~${estimate.total} ` +
      `(boards ${estimate.boards}, items ${estimate.items}, ` +
      (options.updates ? `updates ${estimate.updates}, ` : "") +
      `users ${estimate.users}, other ${estimate.other}` +
      (options.files ? ", plus 1 per 50 files" : "") +
      ")\n" +
      (options.updates ? "" : "Updates are skipped (--no-updates).\n") +
      (options.files ? "" : "Files are skipped (--no-files).\n"),
  );

  if (!(await deps.confirm("Start the export? [y/N] "))) {
    io.stdout("Export cancelled; nothing was written.\n");
    return 1;
  }

  await mkdir(join(out, "boards"), { recursive: true });

  const exportedAt = now().toISOString();
  const errors: ManifestError[] = [...(previous?.errors ?? [])].filter(
    (e) => !e.board_id || !pending.some((b) => b.id === e.board_id),
  );
  const boardEntries = new Map<string, ManifestBoard>();
  for (const b of previous?.boards ?? []) boardEntries.set(b.id, b);
  for (const b of selected) {
    boardEntries.set(b.id, { id: b.id, name: b.name, items_count: b.items_count ?? null, done: isDone(b.id) });
  }
  const order = new Map(visible.map((b, i) => [b.id, i]));
  const manifest = (): Manifest => ({
    account,
    exported_at: exportedAt,
    api_version: MONDAY_API_VERSION,
    token_user: { id: me.id, name: me.name, email: me.email },
    boards: [...boardEntries.values()].sort(
      (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    ),
    call_count: (previous?.call_count ?? 0) + (client.callCount - callsBefore),
    errors,
  });
  const saveManifest = () => writeJson(manifestPath, manifest());

  const download = deps.download ?? defaultDownload;
  const sleep = deps.sleep ?? defaultSleep;
  const filesDir = join(out, FILES_DIR);
  const indexPath = join(filesDir, FILES_INDEX);
  const fileIndex: FileIndex = (await readJson<FileIndex>(indexPath)) ?? {};

  /** Downloads one asset, retrying DOWNLOAD_RETRIES times; returns the bytes or the last error. */
  const downloadWithRetries = async (
    url: string,
  ): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> => {
    let last = "";
    for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      try {
        return { ok: true, bytes: await download(url) };
      } catch (err) {
        last = errorMessage(err);
      }
    }
    return { ok: false, error: last };
  };

  /** Fetches public_urls 50 at a time and downloads each one right away. */
  const exportFiles = async (boardId: string, refs: Map<string, AssetRef>): Promise<{ saved: number; failed: number }> => {
    let saved = 0;
    let failed = 0;
    const fail = (id: string, message: string) => {
      failed++;
      errors.push({ at: now().toISOString(), board_id: boardId, message: `asset ${id}: ${message}` });
    };
    // An asset saved by an earlier, interrupted run of this board is not downloaded again.
    const todo = [...refs.keys()].filter((id) => !(fileIndex[id] && existsSync(join(out, fileIndex[id].path))));
    for (const part of chunk(todo, ASSETS_PER_CALL)) {
      const data = await client.request(AssetsDocument, { ids: part });
      const byId = new Map((data.assets ?? []).filter((a) => a != null).map((a) => [a.id, a]));
      for (const id of part) {
        const asset = byId.get(id);
        if (!asset?.public_url) {
          fail(id, "monday returned no public_url");
          continue;
        }
        const result = await downloadWithRetries(asset.public_url);
        if (!result.ok) {
          fail(id, `download failed after ${DOWNLOAD_RETRIES} retries: ${result.error}`);
          continue;
        }
        const rel = `${FILES_DIR}/${id}/${safeFileName(asset.name, id)}`;
        const target = join(out, rel);
        await mkdir(join(filesDir, id), { recursive: true });
        await writeFile(`${target}.part`, result.bytes);
        await rename(`${target}.part`, target);
        fileIndex[id] = {
          name: asset.name,
          size: result.bytes.byteLength,
          sha256: createHash("sha256").update(result.bytes).digest("hex"),
          path: rel,
          board_id: boardId,
          ...refs.get(id)!,
        };
        saved++;
      }
      await writeJson(indexPath, fileIndex);
    }
    return { saved, failed };
  };

  let currentBoard: string | undefined;
  try {
    await saveManifest();

    await writeJson(
      join(out, "users.json"),
      (await fetchAllUsers(client)).map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, kind: u.kind })),
    );
    await writeJson(join(out, "workspaces.json"), await fetchAllWorkspaces(client));

    const subitemColumns = await fetchSubitemColumns(client, subitemIds);

    for (const board of pending) {
      currentBoard = board.id;
      const dir = join(out, "boards", board.id);
      await mkdir(dir, { recursive: true });

      const columns = toColumns(board.columns);
      const subIds = subitemBoardIds(board);
      // Multi-level boards keep their subitems on the board itself, with the same columns.
      const subColumns =
        subIds.length > 0
          ? subIds.flatMap((id) => subitemColumns.get(id) ?? [])
          : board.hierarchy_type === "multi_level"
            ? columns
            : [];
      const boardFile: BoardFile = {
        id: board.id,
        name: board.name,
        workspace_id: board.workspace_id ?? null,
        hierarchy_type: board.hierarchy_type ?? null,
        columns,
        groups: (board.groups ?? [])
          .filter((g): g is NonNullable<typeof g> => g != null)
          .map((g) => ({ id: g.id, title: g.title, position: g.position })),
        subitem_columns: subColumns,
      };
      await writeJson(join(dir, "board.json"), boardFile);

      const itemsPath = join(dir, "items.ndjson");
      await writeFile(itemsPath, "");
      let count = 0;
      let ids: string[] = [];
      let assetRefs = new Map<string, AssetRef>();
      await paginateItems<MondayItem>(client, {
        boardId: board.id,
        pageSize: pageSizeFor(board),
        firstPageQuery: FirstPageDocument,
        nextPageQuery: NextPageDocument,
        onPage: async (items) => {
          if (items.length === 0) return;
          await appendFile(itemsPath, items.map((item) => `${JSON.stringify(item)}\n`).join(""));
          count += items.length;
          ids.push(...itemIds(items));
          itemAssetRefs(items, assetRefs);
        },
        onRestart: async ({ restart }) => {
          io.stderr(`monday: board ${board.id}: cursor expired, starting the board again (restart ${restart})\n`);
          await writeFile(itemsPath, "");
          count = 0;
          ids = [];
          assetRefs = new Map();
        },
        onPageSizeChange: ({ from, to }) => {
          io.stderr(`monday: board ${board.id}: query too complex, page size ${from} → ${to}\n`);
        },
      });

      const updatesPath = join(dir, "updates.ndjson");
      let updateCount = 0;
      if (options.updates) {
        const byItem = await fetchUpdates(client, ids);
        const lines: string[] = [];
        for (const id of ids) {
          for (const update of byItem.get(id) ?? []) {
            const line: UpdateLine = { item_id: id, ...update };
            lines.push(`${JSON.stringify(line)}\n`);
            addAssetRefs(assetRefs, update.assets, { update_id: update.id });
            for (const reply of update.replies ?? []) addAssetRefs(assetRefs, reply.assets, { update_id: reply.id });
          }
        }
        await writeFile(updatesPath, lines.join(""));
        updateCount = lines.length;
      } else {
        await rm(updatesPath, { force: true });
      }

      let files = { saved: 0, failed: 0 };
      if (options.files) files = await exportFiles(board.id, assetRefs);

      await writeJson(join(dir, DONE_FILE), {
        items: count,
        updates: options.updates ? updateCount : null,
        files: options.files ? files.saved : null,
        finished_at: now().toISOString(),
      });
      boardEntries.set(board.id, { ...boardEntries.get(board.id)!, done: true });
      await saveManifest();
      io.stdout(
        `board ${board.id} ${board.name}: ${count} items` +
          (options.updates ? `, ${updateCount} updates` : "") +
          (options.files
            ? `, ${files.saved} files` + (files.failed ? ` (${files.failed} failed, see manifest errors)` : "")
            : "") +
          "\n",
      );
    }
    currentBoard = undefined;
  } catch (err) {
    errors.push({ at: now().toISOString(), ...(currentBoard ? { board_id: currentBoard } : {}), message: errorMessage(err) });
    await saveManifest().catch(() => {});
    if (currentBoard) {
      await rm(join(out, "boards", currentBoard, DONE_FILE), { force: true });
    }
    io.stderr(
      `monday: export stopped${currentBoard ? ` on board ${currentBoard}` : ""}: ${errorMessage(err)}\n` +
        (err instanceof MondayDailyLimitError
          ? "The daily call limit resets at 00:00 UTC. "
          : "") +
        "Run the same command again to resume; finished boards are skipped.\n",
    );
    return 1;
  }

  const done = selected.filter((b) => boardEntries.get(b.id)?.done).length;
  io.stdout(`Export finished: ${done}/${selected.length} boards in ${options.out} (${client.callCount - callsBefore} calls this run).\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

/** Reads one line from stdin; true only for y / yes. */
export function confirmOnStdin(question: string): Promise<boolean> {
  return new Promise((resolveAnswer) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    rl.on("close", () => {
      if (!answered) resolveAnswer(false);
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolveAnswer(/^\s*y(es)?\s*$/i.test(answer));
    });
  });
}

export const exportCommand: CommandHandler = async (args, io) => {
  const parsed = parseExportArgs(args);
  if (!parsed.ok) {
    io.stderr(`monday export: ${parsed.error}\n`);
    return 1;
  }
  const { token } = await resolveMondayToken();
  const client = createMondayClient({
    token,
    onRetry: ({ attempt, delayMs, reason }) =>
      io.stderr(`monday: retry ${attempt} in ${Math.round(delayMs / 1000)}s (${reason})\n`),
  });
  return runExport(parsed.options, { client, io, confirm: confirmOnStdin });
};
