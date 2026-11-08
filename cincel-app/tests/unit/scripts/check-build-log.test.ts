// @vitest-environment node
/**
 * `scripts/check-build-log.mjs` (#930): the patterns that fail a build log,
 * the allow-list (each entry needs a reason and an issue), ANSI colours and
 * the CLI exit codes.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  BUILD_LOG_PATTERNS,
  findBuildLogProblems,
  loadAllowList,
  parseAllowList,
} from "../../../scripts/check-build-log.mjs";

const CLEAN_BUILD = [
  "> cincel-app@0.1.0 build",
  "> next build",
  "▲ Next.js 16.2.10 (Turbopack)",
  "✓ Compiled successfully in 47s",
  "✓ Generating static pages using 11 workers (62/62) in 1468ms",
  "ƒ Proxy (Middleware)",
].join("\n");

const dir = mkdtempSync(join(tmpdir(), "check-build-log-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function cli(log: string, allowList?: unknown) {
  const logPath = join(dir, `build-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(logPath, log);
  const args = ["scripts/check-build-log.mjs", logPath];
  if (allowList !== undefined) {
    const allowPath = join(dir, `allow-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(allowPath, JSON.stringify(allowList));
    args.push("--allowlist", allowPath);
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

describe("findBuildLogProblems", () => {
  it("passes a clean build log", () => {
    expect(findBuildLogProblems(CLEAN_BUILD)).toEqual([]);
  });

  it.each([
    ["a DB read during prerender", "Error: connect ECONNREFUSED 127.0.0.1:9", "Error:"],
    ["a refused connection without Error:", "    at TCPConnectWrap.afterConnect [ECONNREFUSED]", "ECONNREFUSED"],
    ["a dynamic API during prerender", "Route /inicio couldn't be rendered statically because it used `cookies`. Dynamic server usage", "Dynamic server usage"],
    ["a module that could not resolve", "Module not found: could not resolve '@/lib/x'", "could not resolve"],
    ["an unreadable setting", "[appearance] could not read the org appearance", "could not read"],
    ["a deprecation", "The \"middleware\" file convention is deprecated. Please use \"proxy\" instead.", "deprecated"],
    ["a Next warning", "⚠ Unsupported metadata themeColor is configured", "⚠"],
  ])("reports %s with its line number", (_name, line, pattern) => {
    const problems = findBuildLogProblems(`${CLEAN_BUILD}\n${line}\n`);
    expect(problems).toEqual([{ line: 7, pattern, text: line.trim() }]);
  });

  it("ignores ANSI colours when matching and reports the plain text", () => {
    const problems = findBuildLogProblems("\u001b[33m\u001b[1m⚠\u001b[22m\u001b[39m Something changed");
    expect(problems).toEqual([{ line: 1, pattern: "⚠", text: "⚠ Something changed" }]);
  });

  it("skips lines that match an allow-list entry", () => {
    const allow = [{ match: "⚠ No build cache found.", reason: "no CI caches", issue: "#930" }];
    const log = `⚠ No build cache found. Please configure build caching for faster rebuilds.\n${CLEAN_BUILD}`;
    expect(findBuildLogProblems(log, allow)).toEqual([]);
  });

  it("checks every pattern the issue lists", () => {
    expect(BUILD_LOG_PATTERNS).toEqual([
      "Error:",
      "ECONNREFUSED",
      "Dynamic server usage",
      "could not resolve",
      "could not read",
      "deprecated",
      "⚠",
    ]);
  });
});

describe("allow-list", () => {
  it("every seeded entry has a match, a reason and an issue", () => {
    const entries = loadAllowList();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.match.trim()).not.toBe("");
      expect(entry.reason.trim()).not.toBe("");
      expect(entry.issue).toMatch(/^#\d+$/);
    }
  });

  it("rejects an entry without a reason", () => {
    expect(() => parseAllowList([{ match: "⚠ x", issue: "#1" }])).toThrow(/reason/);
  });
});

describe("CLI", () => {
  it("exits 0 for a clean log", () => {
    expect(cli(CLEAN_BUILD).status).toBe(0);
  });

  it("exits 1 and prints the offending line for a DB read during prerender", () => {
    const result = cli(`${CLEAN_BUILD}\nError: connect ECONNREFUSED 127.0.0.1:9\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(":7 [Error:] Error: connect ECONNREFUSED 127.0.0.1:9");
  });

  it("exits 2 for an invalid allow-list", () => {
    expect(cli(CLEAN_BUILD, [{ match: "x" }]).status).toBe(2);
  });

  it("exits 2 without a log path", () => {
    expect(spawnSync(process.execPath, ["scripts/check-build-log.mjs"], { encoding: "utf8" }).status).toBe(2);
  });
});
