#!/usr/bin/env node
/**
 * Fails a `next build` whose log shows errors, database connections or
 * deprecations (#930). The build itself still exits 0 when a page logs a
 * `Dynamic server usage` stack, an `ECONNREFUSED` against Postgres during
 * prerender or a deprecated convention, so CI and the Docker build check the
 * log instead.
 *
 *   npm run build 2>&1 | tee next-build.log
 *   node scripts/check-build-log.mjs next-build.log
 *
 * Prints every offending line (with its line number) and exits 1 when there
 * is one, 0 when the log is clean, 2 on bad usage or an invalid allow-list.
 *
 * Known, accepted notices live in `scripts/build-log-allowlist.json`, one
 * entry per notice: `match` (a substring of the line), `reason` (one line)
 * and `issue` (the issue that accepted it). Keep it as small as possible; a
 * PR that adds a new notice adds its entry with a reason.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Substrings that fail the build log (#930). */
export const BUILD_LOG_PATTERNS = [
  "Error:",
  "ECONNREFUSED",
  "Dynamic server usage",
  "could not resolve",
  "could not read",
  "deprecated",
  "⚠",
];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ALLOWLIST_PATH = resolve(SCRIPT_DIR, "build-log-allowlist.json");

// ANSI colour / cursor sequences (`next build` colours its output).
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Validates the parsed allow-list; throws with the reason when an entry is incomplete. */
export function parseAllowList(json) {
  if (!Array.isArray(json)) throw new Error("the allow-list must be a JSON array");
  return json.map((entry, index) => {
    for (const key of ["match", "reason", "issue"]) {
      if (typeof entry?.[key] !== "string" || entry[key].trim() === "") {
        throw new Error(`allow-list entry ${index} needs a non-empty "${key}"`);
      }
    }
    return { match: entry.match, reason: entry.reason, issue: entry.issue };
  });
}

export function loadAllowList(path = DEFAULT_ALLOWLIST_PATH) {
  return parseAllowList(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * The offending lines of a build log: each line (ANSI codes removed) that
 * contains one of `BUILD_LOG_PATTERNS` and no allow-list `match`.
 */
export function findBuildLogProblems(text, allowList = []) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.replace(ANSI, "");
    const pattern = BUILD_LOG_PATTERNS.find((p) => line.includes(p));
    if (!pattern) return;
    if (allowList.some((entry) => line.includes(entry.match))) return;
    problems.push({ line: index + 1, pattern, text: line.trim() });
  });
  return problems;
}

/** CLI: `node scripts/check-build-log.mjs <log> [--allowlist <file>]`. Returns the exit code. */
export function main(argv) {
  const args = [...argv];
  let allowListPath = DEFAULT_ALLOWLIST_PATH;
  const flag = args.indexOf("--allowlist");
  if (flag !== -1) {
    allowListPath = args[flag + 1];
    args.splice(flag, 2);
  }
  if (args.length !== 1 || !allowListPath) {
    console.error("usage: node scripts/check-build-log.mjs <build log> [--allowlist <file>]");
    return 2;
  }

  let allowList;
  try {
    allowList = loadAllowList(allowListPath);
  } catch (error) {
    console.error(`check-build-log: invalid allow-list ${allowListPath}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  let text;
  try {
    text = readFileSync(args[0], "utf8");
  } catch (error) {
    console.error(`check-build-log: cannot read ${args[0]}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const problems = findBuildLogProblems(text, allowList);
  if (problems.length === 0) {
    console.log("check-build-log: the build log is clean.");
    return 0;
  }
  console.error(`check-build-log: ${problems.length} line(s) of the build log need attention:`);
  for (const problem of problems) console.error(`  ${args[0]}:${problem.line} [${problem.pattern}] ${problem.text}`);
  console.error(
    "Fix the cause (no DB reads during prerender, no deprecated conventions), or, for a notice that is" +
      " accepted, add it to scripts/build-log-allowlist.json with a reason and the issue.",
  );
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
