// @vitest-environment node
/**
 * No window events carry app state (plan §5.0, zustand.md §3): no
 * `window.dispatchEvent(new (Custom)?Event("cincel:…"))` in components/ or
 * lib/, literal or through a constant. The allow-list holds today's
 * offenders; the owning phase removes its entry when it moves the event to
 * a store or the query cache (1b, 2, 8). An entry that no longer offends
 * fails too, so the list only shrinks.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { checkSource } from "../../scripts/check-data-patterns.mjs";

const ROOT = join(__dirname, "../..");

/** file → owner phase. */
const ALLOW_LIST: Record<string, string> = {
  "lib/time-tracking/today-events.ts": "2 #936 (today status → qk.me.today)",
  "components/biblioteca/use-recent-documents.ts": "8 #942 (notifyRecentDocumentsChanged → useRecentDocs)",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "__snapshots__" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function offenders(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const dir of ["components", "lib"]) {
    for (const file of sources(join(ROOT, dir))) {
      const hits = (checkSource(file, readFileSync(file, "utf8")) as { line: number; pattern: string }[]).filter((v) =>
        v.pattern.startsWith("window.dispatchEvent("),
      );
      if (hits.length) found.set(relative(ROOT, file), hits.map((v) => `${v.line} ${v.pattern}`));
    }
  }
  return found;
}

describe("no cincel: window events", () => {
  const found = offenders();

  it("only the allow-listed files dispatch a cincel: window event", () => {
    expect([...found.keys()].filter((file) => !(file in ALLOW_LIST))).toEqual([]);
  });

  it("every allow-list entry still offends (remove it once its phase lands)", () => {
    expect(Object.keys(ALLOW_LIST).filter((file) => !found.has(file))).toEqual([]);
  });
});
