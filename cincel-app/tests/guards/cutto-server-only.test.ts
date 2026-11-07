// @vitest-environment node
/**
 * Cutto boundary (redesign BE §11.2, FE §4.9): client code links to Cutto only
 * through lib/integrations/cutto-links.ts and never imports the server-only
 * adapter; the adapter stays a no-op and is off unless CUTTO_API_URL is set.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { actionErrorCode } from "@/lib/errors";
import {
  CUTTO_DISABLED,
  getCuttoApi,
  isCuttoApiConfigured,
  noopCuttoClient,
} from "@/lib/integrations/cutto-api.server";

const ROOT = join(__dirname, "../..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__snapshots__"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const IMPORTS_CUTTO_API = /(?:from\s+|import\s*\(?\s*|require\s*\(\s*)["'][^"']*cutto-api\.server(?:\.ts)?["']/;
const USE_CLIENT = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use client["']/;

const CUTTO_TOOL_NAMES = [
  "create_meeting",
  "start_call",
  "list_meetings",
  "invite_to_meeting",
  "get_meeting_notes",
  "meeting_to_tasks",
  "list_voice_rooms",
  "join_voice_room",
  "list_conversations",
  "read_conversation",
  "summarize_channel",
  "send_message",
  "post_to_project_channel",
  "reply_in_thread",
  "create_project_channel",
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

describe("cutto-api.server.ts stays on the server", () => {
  it("no client component imports it", () => {
    const offenders = files
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return USE_CLIENT.test(src) && IMPORTS_CUTTO_API.test(src);
      })
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("no file under components/ or hooks/ imports it", () => {
    const offenders = files
      .filter((file) => /^(components|hooks)\//.test(relative(ROOT, file)))
      .filter((file) => IMPORTS_CUTTO_API.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("the adapter imports server-only", () => {
    const src = readFileSync(join(ROOT, "lib/integrations/cutto-api.server.ts"), "utf8");
    expect(src).toMatch(/^import\s+["']server-only["'];?$/m);
  });

  it("cutto-links.ts is client-safe", () => {
    const src = readFileSync(join(ROOT, "lib/integrations/cutto-links.ts"), "utf8");
    expect(src).not.toMatch(/["']server-only["']/);
    expect(src).not.toMatch(IMPORTS_CUTTO_API);
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/CUTTO_API_(URL|TOKEN)/);
  });

  it("the guard regexes catch a client import", () => {
    const sample = '"use client";\nimport { getCuttoApi } from "@/lib/integrations/cutto-api.server";\n';
    expect(USE_CLIENT.test(sample)).toBe(true);
    expect(IMPORTS_CUTTO_API.test(sample)).toBe(true);
  });
});

describe("no-op CuttoClient", () => {
  it("is off without CUTTO_API_URL", () => {
    expect(isCuttoApiConfigured({})).toBe(false);
    expect(getCuttoApi({})).toBeNull();
    expect(getCuttoApi({ CUTTO_API_URL: "  " })).toBeNull();
    expect(getCuttoApi({ CUTTO_API_URL: "not a url" })).toBeNull();
  });

  it("returns the no-op client when CUTTO_API_URL is set", () => {
    expect(getCuttoApi({ CUTTO_API_URL: "https://cutto.example.test/api" })).toBe(noopCuttoClient);
  });

  it("has one method per Cutto tool and every method rejects with DISABLED", async () => {
    const methods = Object.values(noopCuttoClient);
    expect(methods).toHaveLength(CUTTO_TOOL_NAMES.length);
    for (const method of methods) {
      const err = await (method as (input: unknown) => Promise<unknown>)({}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(CUTTO_DISABLED);
      expect(actionErrorCode(err)).toBe("DISABLED");
    }
  });
});

describe("Cutto assistant tools", () => {
  it("are registered only behind getCuttoApi()", () => {
    const toolFiles = sourceFiles(join(ROOT, "lib/assistant/tools")).filter((f) => !/\.test\./.test(f));
    const offenders = toolFiles
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        const registersCutto = CUTTO_TOOL_NAMES.some((name) =>
          new RegExp(`name:\\s*["']${name}["']`).test(src),
        );
        return registersCutto && !/getCuttoApi\s*\(/.test(src);
      })
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
