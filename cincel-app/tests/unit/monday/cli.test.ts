// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createMondayDb } from "@/scripts/monday/db";
import { COMMAND_NAMES, COMMANDS, run, USAGE, type CliIo } from "@/scripts/monday/run";

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { io, out: () => out.join(""), err: () => err.join("") };
}

describe("monday CLI dispatch", () => {
  it.each([[[]], [["help"]], [["--help"]], [["-h"]]])("prints usage for %j", async (argv) => {
    const c = captureIo();
    expect(await run(argv, c.io)).toBe(0);
    expect(c.out()).toBe(USAGE);
  });

  it("rejects an unknown command", async () => {
    const c = captureIo();
    expect(await run(["sync"], c.io)).toBe(1);
    expect(c.err()).toContain('unknown command "sync"');
  });

  it.each(COMMAND_NAMES)("dispatches %s to its handler with the remaining args", async (name) => {
    const handler = vi.fn(async () => 0);
    const commands = Object.fromEntries(
      COMMAND_NAMES.map((n) => [n, n === name ? handler : vi.fn(async () => 99)]),
    ) as unknown as typeof COMMANDS;
    const c = captureIo();
    expect(await run([name, "--export", "exports/acme"], c.io, commands)).toBe(0);
    expect(handler).toHaveBeenCalledWith(["--export", "exports/acme"], c.io);
  });


  it.each([["--token", "abc"], ["--token=abc"]])("refuses a token flag (%s)", async (...flag) => {
    const handler = vi.fn(async () => 0);
    const c = captureIo();
    const commands = { ...COMMANDS, export: handler };
    expect(await run(["export", ...flag], c.io, commands)).toBe(1);
    expect(handler).not.toHaveBeenCalled();
    expect(c.err()).not.toContain("abc");
  });
});

describe("monday CLI db client", () => {
  it("uses its own postgres-js client with a single connection", async () => {
    const handle = createMondayDb("postgres://u:p@127.0.0.1:1/none");
    try {
      expect(handle.sql.options.max).toBe(1);
      expect(handle.db).toBeDefined();
    } finally {
      await handle.close();
    }
  });
});

describe("scripts/monday", () => {
  it("never imports server-only or the app db client", () => {
    const dir = resolve(__dirname, "../../../scripts/monday");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/from\s+["']server-only["']|import\s+["']server-only["']/);
      expect(src, file).not.toMatch(/from\s+["'][^"']*lib\/db\/client["']/);
    }
  });
});
