// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixtures from "@/scripts/monday/__fixtures__/export-account.json";
import { createMondayClient, type FetchLike } from "@/scripts/monday/client";
import {
  DONE_FILE,
  estimateCalls,
  parseExportArgs,
  runExport,
  safeFileName,
  subitemBoardIds,
  type BoardFile,
  type FileIndex,
  type Manifest,
  type UpdateLine,
} from "@/scripts/monday/export";
import type { MondayItem } from "@/scripts/monday/queries";

const TOKEN = "secret-token-xyz";

type Body = { query: string; variables: Record<string, unknown> };
type Handler = (body: Body, op: string) => unknown;

function opName(query: string): string {
  return /^\s*query\s+(\w+)/m.exec(query)?.[1] ?? "?";
}

/** Answers each request from the fixture account; `override` can replace any answer. */
function fakeAccount(override?: Handler) {
  const calls: { op: string; variables: Record<string, unknown> }[] = [];
  const fn: FetchLike = async (_url, init) => {
    const body = JSON.parse(init.body) as Body;
    const op = opName(body.query);
    calls.push({ op, variables: body.variables });
    let reply = override?.(body, op);
    if (reply === undefined) {
      switch (op) {
        case "Me":
          reply = fixtures.me;
          break;
        case "Boards":
          reply = fixtures.boards;
          break;
        case "SubitemColumns":
          reply = fixtures.subitemColumns;
          break;
        case "Users":
          reply = fixtures.users;
          break;
        case "Workspaces":
          reply = fixtures.workspaces;
          break;
        case "FirstPage":
          reply = (body.variables.board as string[])[0] === "101" ? fixtures.classicFirstPage : fixtures.multiLevelFirstPage;
          break;
        case "NextPage":
          reply = fixtures.classicNextPage;
          break;
        case "Updates":
          reply = updatesReply(body.variables, (id) => (fixtures.updates as Record<string, unknown[]>)[id] ?? []);
          break;
        case "Assets":
          reply = {
            data: {
              assets: (body.variables.ids as string[])
                .map((id) => (fixtures.assets as Record<string, unknown>)[id])
                .filter(Boolean),
            },
          };
          break;
        default:
          throw new Error(`unexpected query ${op}`);
      }
    }
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) };
  };
  const client = createMondayClient({ token: TOKEN, fetch: fn, sleep: async () => {} });
  return { client, calls };
}

/** Answers an Updates query from a per-item list of updates, 100 per page. */
function updatesReply(variables: Record<string, unknown>, updatesOf: (id: string) => unknown[]) {
  const page = variables.page as number;
  return {
    data: {
      items: (variables.ids as string[]).map((id) => ({
        id,
        updates: updatesOf(id).slice((page - 1) * 100, page * 100),
      })),
    },
  };
}

const bytesFor = (url: string) => new TextEncoder().encode(`content of ${url}`);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function captureIo() {
  let out = "";
  let err = "";
  return {
    io: { stdout: (t: string) => void (out += t), stderr: (t: string) => void (err += t) },
    out: () => out,
    err: () => err,
  };
}

let dir: string;
let out: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "monday-export-"));
  out = join(dir, "acme");
  // The default downloader uses global fetch; no test reaches the network.
  vi.stubGlobal("fetch", async (url: string) => new Response(bytesFor(url)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const read = <T>(...parts: string[]) => JSON.parse(readFileSync(join(out, ...parts), "utf8")) as T;
const readUpdates = (board: string) =>
  readFileSync(join(out, "boards", board, "updates.ndjson"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as UpdateLine);
const readItems = (board: string) =>
  readFileSync(join(out, "boards", board, "items.ndjson"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as MondayItem);
const yes = async () => true;
const options = (extra: Partial<Parameters<typeof runExport>[0]> = {}) => ({
  out,
  updates: true,
  files: true,
  ...extra,
});

function allFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

describe("monday export", () => {
  it("writes the §4.1 layout", async () => {
    const { client } = fakeAccount();
    const c = captureIo();
    const now = () => new Date("2026-10-29T12:00:00Z");

    expect(await runExport(options(), { client, io: c.io, confirm: yes, now })).toBe(0);

    const manifest = read<Manifest>("manifest.json");
    expect(manifest).toMatchObject({
      account: { id: "555", slug: "acme", name: "Acme" },
      exported_at: "2026-10-29T12:00:00.000Z",
      api_version: "2026-07",
      token_user: { id: "9", name: "Ana Admin", email: "ana@acme.mx" },
      boards: [
        { id: "101", name: "Proyectos", items_count: 3, done: true },
        { id: "202", name: "Casas", items_count: 1, done: true },
      ],
      errors: [],
    });
    expect(manifest.call_count).toBe(client.callCount);

    expect(read("users.json")).toEqual([
      { id: "9", name: "Ana Admin", email: "ana@acme.mx", status: "ACTIVE", kind: "admin" },
      { id: "10", name: "Beto", email: "beto@acme.mx", status: "INACTIVE", kind: "member" },
    ]);
    expect(read("workspaces.json")).toEqual(fixtures.workspaces.data.workspaces);

    const board = read<BoardFile>("boards", "101", "board.json");
    expect(board).toMatchObject({ id: "101", name: "Proyectos", workspace_id: null, hierarchy_type: "classic" });
    expect(board.columns.map((col) => col.id)).toEqual(["name", "status", "subitems"]);
    expect(board.groups).toEqual([
      { id: "topics", title: "Diseño", position: "65536" },
      { id: "group_b", title: "Obra", position: "131072" },
    ]);
    expect(board.subitem_columns.map((col) => col.id)).toEqual(["name", "date0"]);

    // Items in API order across pages, subitems nested, asset refs kept.
    const items = readItems("101");
    expect(items.map((i) => i.id)).toEqual(["1001", "1002", "1003"]);
    expect(items[0].subitems?.[0]?.id).toBe("1101");
    expect(items[0].assets).toEqual([{ id: "77", name: "plano.pdf", file_extension: ".pdf", file_size: 1234 }]);

    for (const id of ["101", "202"]) expect(existsSync(join(out, "boards", id, DONE_FILE))).toBe(true);
    // The subitems board is not exported as a board of its own.
    expect(existsSync(join(out, "boards", "901"))).toBe(false);
  });

  it("keeps subitems nested to 5 levels on a multi-level board", async () => {
    const { client, calls } = fakeAccount();
    await runExport(options(), { client, io: captureIo().io, confirm: yes });

    const [root] = readItems("202");
    const path: string[] = [];
    let node: MondayItem | undefined = root;
    let level = 0;
    while (node) {
      path.push(`${level}:${node.id}`);
      node = (node as { subitems?: MondayItem[] }).subitems?.[0];
      level++;
    }
    expect(path).toEqual(["0:2000", "1:2010", "2:2020", "3:2030", "4:2040", "5:2050"]);

    const board = read<BoardFile>("boards", "202", "board.json");
    expect(board.hierarchy_type).toBe("multi_level");
    expect(board.subitem_columns).toEqual(board.columns);

    const pages = calls.filter((c) => c.op === "FirstPage");
    expect(pages).toEqual([
      { op: "FirstPage", variables: { board: ["101"], limit: 200 } },
      { op: "FirstPage", variables: { board: ["202"], limit: 50 } },
    ]);
  });

  it("aborts on N before writing anything or reading items", async () => {
    const { client, calls } = fakeAccount();
    const c = captureIo();
    const confirm = vi.fn(async () => false);

    expect(await runExport(options(), { client, io: c.io, confirm })).toBe(1);

    expect(confirm).toHaveBeenCalledWith("Start the export? [y/N] ");
    expect(c.out()).toMatch(/Estimated monday API calls: ~\d+/);
    expect(c.out()).toContain("Export cancelled");
    expect(existsSync(out)).toBe(false);
    expect(calls.map((x) => x.op)).toEqual(["Me", "Boards"]);
  });

  it("resumes after a run stopped mid-way, skipping .done boards", async () => {
    // First run: board 101 finishes, then the daily limit hits board 202.
    const first = fakeAccount((body, op) =>
      op === "FirstPage" && (body.variables.board as string[])[0] === "202" ? fixtures.dailyLimit : undefined,
    );
    const c1 = captureIo();
    expect(await runExport(options(), { client: first.client, io: c1.io, confirm: yes })).toBe(1);
    expect(c1.err()).toContain("Run the same command again to resume");

    expect(existsSync(join(out, "boards", "101", DONE_FILE))).toBe(true);
    expect(existsSync(join(out, "boards", "202", DONE_FILE))).toBe(false);
    const stopped = read<Manifest>("manifest.json");
    expect(stopped.boards.map((b) => [b.id, b.done])).toEqual([
      ["101", true],
      ["202", false],
    ]);
    expect(stopped.errors).toEqual([expect.objectContaining({ board_id: "202" })]);

    // Second run: board 101 is not read again, board 202 completes.
    const second = fakeAccount();
    expect(await runExport(options(), { client: second.client, io: captureIo().io, confirm: yes })).toBe(0);

    const firstPages = second.calls.filter((c) => c.op === "FirstPage").map((c) => c.variables.board);
    expect(firstPages).toEqual([["202"]]);
    expect(second.calls.some((c) => c.op === "NextPage")).toBe(false);
    expect(readItems("101").map((i) => i.id)).toEqual(["1001", "1002", "1003"]);
    expect(readItems("202").map((i) => i.id)).toEqual(["2000"]);

    const resumed = read<Manifest>("manifest.json");
    expect(resumed.boards.every((b) => b.done)).toBe(true);
    expect(resumed.errors).toEqual([]);
    expect(resumed.call_count).toBe(first.client.callCount + second.client.callCount);
  });

  it("starts an unfinished board over instead of appending to it", async () => {
    // Killed after the first page of board 101 was written: no .done, partial items.ndjson.
    const killed = fakeAccount((_body, op) => {
      if (op === "NextPage") throw new Error("killed");
      return undefined;
    });
    await runExport(options(), { client: killed.client, io: captureIo().io, confirm: yes });
    expect(readItems("101").map((i) => i.id)).toEqual(["1001", "1002"]);

    const again = fakeAccount();
    expect(await runExport(options(), { client: again.client, io: captureIo().io, confirm: yes })).toBe(0);
    expect(readItems("101").map((i) => i.id)).toEqual(["1001", "1002", "1003"]);
  });

  it("drops what a board wrote when its cursor expires and it restarts", async () => {
    let nextPages = 0;
    const { client } = fakeAccount((_body, op) => {
      if (op === "NextPage" && nextPages++ === 0) return fixtures.cursorExpired;
      return undefined;
    });
    const c = captureIo();
    expect(await runExport(options({ boards: ["101"] }), { client, io: c.io, confirm: yes })).toBe(0);
    expect(c.err()).toContain("cursor expired");
    expect(readItems("101").map((i) => i.id)).toEqual(["1001", "1002", "1003"]);
  });

  it("exports only --boards and keeps other boards' manifest entries", async () => {
    const first = fakeAccount();
    await runExport(options({ boards: ["202"] }), { client: first.client, io: captureIo().io, confirm: yes });
    expect(existsSync(join(out, "boards", "101"))).toBe(false);
    expect(read<Manifest>("manifest.json").boards.map((b) => b.id)).toEqual(["202"]);
    expect(first.calls.some((c) => c.op === "SubitemColumns")).toBe(false);

    const second = fakeAccount();
    await runExport(options({ boards: ["101"] }), { client: second.client, io: captureIo().io, confirm: yes });
    expect(read<Manifest>("manifest.json").boards.map((b) => [b.id, b.done])).toEqual([
      ["101", true],
      ["202", true],
    ]);
  });

  it("refuses --boards ids the token can't see", async () => {
    const { client } = fakeAccount();
    const c = captureIo();
    const confirm = vi.fn(yes);
    expect(await runExport(options({ boards: ["101", "999"] }), { client, io: c.io, confirm })).toBe(1);
    expect(c.err()).toContain("999");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("refuses an output folder that holds another account's export", async () => {
    await runExport(options(), { client: fakeAccount().client, io: captureIo().io, confirm: yes });
    const other = fakeAccount((_b, op) =>
      op === "Me" ? { data: { me: { ...fixtures.me.data.me, account: { id: "1", slug: "other", name: "Other" } } } } : undefined,
    );
    const c = captureIo();
    expect(await runExport(options(), { client: other.client, io: c.io, confirm: yes })).toBe(1);
    expect(c.err()).toContain("another --out folder");
  });

  it("never writes or prints the token", async () => {
    const { client } = fakeAccount();
    const c = captureIo();
    await runExport(options(), { client, io: c.io, confirm: yes });
    expect(c.out() + c.err()).not.toContain(TOKEN);
    for (const file of allFiles(out)) expect(readFileSync(file, "utf8"), file).not.toContain(TOKEN);
  });
});

describe("monday export: updates and files", () => {
  it("writes updates.ndjson with replies nested, for items and subitems", async () => {
    const { client, calls } = fakeAccount();
    expect(await runExport(options(), { client, io: captureIo().io, confirm: yes })).toBe(0);

    const updates = readUpdates("101");
    expect(updates.map((u) => [u.item_id, u.id])).toEqual([
      ["1001", "u1"],
      ["1101", "u2"],
    ]);
    expect(updates[0].replies?.[0]).toMatchObject({ id: "r1", body: "<p>Gracias</p>" });
    expect(readUpdates("202")).toEqual([]);

    // Board 101's items and subitems in one call; nothing returned a full page.
    const first = calls.find((c) => c.op === "Updates")!;
    expect(first.variables).toEqual({ ids: ["1001", "1101", "1002", "1003"], page: 1 });
  });

  it("keeps all 150 updates of an item by paging it alone past 100", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `m${i}`,
      body: `<p>${i}</p>`,
      text_body: String(i),
      created_at: "2026-02-01T10:00:00Z",
      creator_id: "9",
      replies: [],
      assets: [],
    }));
    const { client, calls } = fakeAccount((body, op) =>
      op === "Updates" ? updatesReply(body.variables, (id) => (id === "1002" ? many : [])) : undefined,
    );
    expect(await runExport(options({ boards: ["101"] }), { client, io: captureIo().io, confirm: yes })).toBe(0);

    const updates = readUpdates("101").filter((u) => u.item_id === "1002");
    expect(updates.map((u) => u.id)).toEqual(many.map((u) => u.id));
    expect(calls.filter((c) => c.op === "Updates").map((c) => c.variables)).toEqual([
      { ids: ["1001", "1101", "1002", "1003"], page: 1 },
      { ids: ["1002"], page: 2 },
    ]);
  });

  it("downloads item, update and reply assets with their sha256 in files/index.json", async () => {
    const { client, calls } = fakeAccount();
    expect(await runExport(options(), { client, io: captureIo().io, confirm: yes })).toBe(0);

    const index = read<FileIndex>("files", "index.json");
    const url = (id: string) => (fixtures.assets as Record<string, { public_url: string }>)[id].public_url;
    expect(index).toEqual({
      "77": {
        name: "plano.pdf",
        size: bytesFor(url("77")).byteLength,
        sha256: sha256(bytesFor(url("77"))),
        path: "files/77/plano.pdf",
        board_id: "101",
        item_id: "1001",
      },
      "88": expect.objectContaining({ path: "files/88/medidas.xlsx", update_id: "u1", sha256: sha256(bytesFor(url("88"))) }),
      "89": expect.objectContaining({ path: "files/89/foto.jpg", update_id: "r1" }),
    });
    for (const [id, entry] of Object.entries(index)) {
      expect(sha256(readFileSync(join(out, entry.path))), id).toBe(entry.sha256);
    }
    expect(calls.filter((c) => c.op === "Assets").map((c) => c.variables)).toEqual([{ ids: ["77", "88", "89"] }]);
    expect(read<Manifest>("manifest.json").errors).toEqual([]);
  });

  it("records a download that fails after 3 retries in manifest.errors and still finishes the board", async () => {
    const { client } = fakeAccount();
    const attempts = new Map<string, number>();
    const download = vi.fn(async (u: string) => {
      attempts.set(u, (attempts.get(u) ?? 0) + 1);
      if (u.includes("/88")) throw new Error("HTTP 403");
      // 89 fails twice, then works.
      if (u.includes("/89") && attempts.get(u)! <= 2) throw new Error("ECONNRESET");
      return bytesFor(u);
    });
    const sleep = vi.fn(async () => {});
    const c = captureIo();

    expect(await runExport(options({ boards: ["101"] }), { client, io: c.io, confirm: yes, download, sleep })).toBe(0);

    expect(attempts.get("https://files.monday.test/88?sig=b")).toBe(4);
    expect(attempts.get("https://files.monday.test/89?sig=c")).toBe(3);
    const manifest = read<Manifest>("manifest.json");
    expect(manifest.errors).toEqual([
      { at: expect.any(String), board_id: "101", message: "asset 88: download failed after 3 retries: HTTP 403" },
    ]);
    expect(manifest.boards).toEqual([expect.objectContaining({ id: "101", done: true })]);
    expect(existsSync(join(out, "boards", "101", DONE_FILE))).toBe(true);
    expect(Object.keys(read<FileIndex>("files", "index.json")).sort()).toEqual(["77", "89"]);
    expect(c.out()).toContain("1 failed");
  });

  it("--no-updates and --no-files skip those stages", async () => {
    const { client, calls } = fakeAccount();
    const download = vi.fn(async (u: string) => bytesFor(u));
    const c = captureIo();
    expect(
      await runExport(options({ updates: false, files: false }), { client, io: c.io, confirm: yes, download }),
    ).toBe(0);

    expect(calls.some((x) => x.op === "Updates" || x.op === "Assets")).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(existsSync(join(out, "boards", "101", "updates.ndjson"))).toBe(false);
    expect(existsSync(join(out, "files"))).toBe(false);
    expect(c.out()).toContain("--no-updates");
    expect(c.out()).toContain("--no-files");

    // Files only: update assets aren't known, so only item assets are downloaded.
    rmSync(out, { recursive: true, force: true });
    const second = fakeAccount();
    await runExport(options({ updates: false }), { client: second.client, io: captureIo().io, confirm: yes, download });
    expect(second.calls.some((x) => x.op === "Updates")).toBe(false);
    expect(Object.keys(read<FileIndex>("files", "index.json"))).toEqual(["77"]);

    // Updates only.
    rmSync(out, { recursive: true, force: true });
    const third = fakeAccount();
    download.mockClear();
    await runExport(options({ files: false }), { client: third.client, io: captureIo().io, confirm: yes, download });
    expect(third.calls.some((x) => x.op === "Assets")).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(readUpdates("101")).toHaveLength(2);
  });

  it("a re-run downloads nothing again for finished boards", async () => {
    // First run: board 101 (which has all the files) finishes, board 202 hits the daily limit.
    const first = fakeAccount((body, op) =>
      op === "FirstPage" && (body.variables.board as string[])[0] === "202" ? fixtures.dailyLimit : undefined,
    );
    const download = vi.fn(async (u: string) => bytesFor(u));
    expect(await runExport(options(), { client: first.client, io: captureIo().io, confirm: yes, download })).toBe(1);
    expect(download).toHaveBeenCalledTimes(3);

    download.mockClear();
    const second = fakeAccount();
    expect(await runExport(options(), { client: second.client, io: captureIo().io, confirm: yes, download })).toBe(0);
    expect(download).not.toHaveBeenCalled();
    expect(second.calls.some((c) => c.op === "Assets")).toBe(false);
    expect(second.calls.filter((c) => c.op === "Updates").map((c) => c.variables)).toEqual([
      { ids: ["2000", "2010", "2020", "2030", "2040", "2050"], page: 1 },
    ]);
    expect(Object.keys(read<FileIndex>("files", "index.json")).sort()).toEqual(["77", "88", "89"]);
  });

  it("doesn't download files again that an unfinished run of the same board already saved", async () => {
    // A run that saved board 101's files but stopped before writing .done.
    const download = vi.fn(async (u: string) => bytesFor(u));
    const first = fakeAccount();
    await runExport(options({ boards: ["101"] }), { client: first.client, io: captureIo().io, confirm: yes, download });
    rmSync(join(out, "boards", "101", DONE_FILE));

    download.mockClear();
    const second = fakeAccount();
    expect(
      await runExport(options({ boards: ["101"] }), { client: second.client, io: captureIo().io, confirm: yes, download }),
    ).toBe(0);
    expect(download).not.toHaveBeenCalled();
    expect(second.calls.some((c) => c.op === "Assets")).toBe(false);
  });
});

describe("safeFileName", () => {
  it("keeps the name inside the asset folder", () => {
    expect(safeFileName("plano final.pdf", "77")).toBe("plano final.pdf");
    expect(safeFileName("../../etc/passwd", "77")).toBe(".._.._etc_passwd");
    expect(safeFileName("a\\b.txt", "77")).toBe("a_b.txt");
    expect(safeFileName("..", "77")).toBe("77");
    expect(safeFileName("  ", "77")).toBe("77");
  });
});

describe("parseExportArgs", () => {
  it("parses --out, --boards and the opt-out flags", () => {
    expect(parseExportArgs(["--out", "exports/acme", "--boards", "123, 456,123", "--no-files", "--no-updates"])).toEqual({
      ok: true,
      options: { out: "exports/acme", boards: ["123", "456"], files: false, updates: false },
    });
    expect(parseExportArgs(["--out=exports/acme"])).toEqual({
      ok: true,
      options: { out: "exports/acme", boards: undefined, files: true, updates: true },
    });
  });

  it.each([
    [[], "--out is required"],
    [["--out"], "--out needs a value"],
    [["--out", "x", "--boards", "abc"], "--boards takes"],
    [["--out", "x", "--verbose"], 'unknown option "--verbose"'],
  ])("rejects %j", (args, message) => {
    const parsed = parseExportArgs(args);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(message);
  });
});

describe("estimateCalls", () => {
  it("follows the §4.3 formula (40 boards, 24,000 items, 2,000 files ≈ 400 calls)", () => {
    const e = estimateCalls({
      totalBoards: 40,
      boards: [{ items_count: 24_000, pageSize: 200 }],
      subitemBoards: 0,
      assets: 2_000,
      users: 300,
      updates: true,
      files: true,
    });
    expect(e).toMatchObject({ boards: 1, items: 120, updates: 240, files: 40, users: 1 });
    expect(e.total).toBeGreaterThanOrEqual(400);
    expect(e.total).toBeLessThan(410);
  });

  it("pages each board at its own size and counts empty boards once", () => {
    const e = estimateCalls({
      totalBoards: 2,
      boards: [
        { items_count: 120, pageSize: 50 },
        { items_count: 0, pageSize: 200 },
      ],
      subitemBoards: 1,
      updates: false,
      files: false,
    });
    expect(e).toMatchObject({ items: 4, updates: 0, files: 0, users: 1, other: 3 });
  });
});

describe("subitemBoardIds", () => {
  it("reads boardIds from subtasks columns, as an object or a JSON string", () => {
    expect(
      subitemBoardIds({
        columns: [
          { id: "s", title: "Subelementos", type: "subtasks", settings: { boardIds: [901] } },
          { id: "t", title: "Sub", type: "subtasks", settings: JSON.stringify({ boardIds: ["902", 901] }) },
          { id: "x", title: "Texto", type: "text", settings: { boardIds: [1] } },
        ],
      }),
    ).toEqual(["901", "902"]);
  });
});
