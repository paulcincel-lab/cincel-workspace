/**
 * Guard: the Drizzle migrator only applies journal entries whose `when` is
 * newer than the last applied one, so an out-of-order entry is skipped for good
 * on databases that already ran a later migration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const JOURNAL = join(__dirname, "..", "..", "..", "lib", "db", "migrations", "meta", "_journal.json");

interface Entry {
  idx: number;
  when: number;
  tag: string;
}

// Historic out-of-order entry: 0027 was skipped on databases that already had
// 0026. Its column is re-applied idempotently by 0041_reapply_email_signature.
const KNOWN_OUT_OF_ORDER = new Set(["0027_profile_email_signature"]);

describe("migration journal order", () => {
  const entries = (JSON.parse(readFileSync(JOURNAL, "utf8")) as { entries: Entry[] }).entries;

  it("numbers idx and tag prefixes sequentially", () => {
    entries.forEach((e, i) => {
      expect(e.idx, e.tag).toBe(i);
      expect(e.tag.slice(0, 4), e.tag).toBe(String(i).padStart(4, "0"));
    });
  });

  it("has strictly increasing `when` values", () => {
    const bad = entries
      .filter((e, i) => i > 0 && e.when <= entries[i - 1].when && !KNOWN_OUT_OF_ORDER.has(e.tag))
      .map((e) => e.tag);
    expect(bad).toEqual([]);
  });

  it("keeps the 0041 re-apply of the skipped 0027 migration", () => {
    expect(entries.some((e) => e.tag.startsWith("0041_"))).toBe(true);
  });
});
