// @vitest-environment node
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
  subitemBoardIds,
  type BoardFile,
  type Manifest,
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
        default:
          throw new Error(`unexpected query ${op}`);
      }
    }
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) };
  };
  const client = createMondayClient({ token: TOKEN, fetch: fn, sleep: async () => {} });
  return { client, calls };
}

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
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = <T>(...parts: string[]) => JSON.parse(readFileSync(join(out, ...parts), "utf8")) as T;
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
