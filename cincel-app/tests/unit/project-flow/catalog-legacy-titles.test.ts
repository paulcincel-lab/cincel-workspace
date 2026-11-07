// @vitest-environment node
/**
 * Catalog drift guard, `legacyTitle` part (BE §5.2, §16).
 *
 * `__fixtures__/legacy-titles.json` is the frozen list of the old template
 * titles (`phase` + `description`, kept as `legacyTitle`) of Presale (10),
 * Diseño (29) and Construcción (12), in their original order. It replaces the
 * TS template files, so this test reads nothing from them: every
 * `DEFAULT_CATALOG` row carries one of these titles as its `legacyTitle`, per
 * tramo, and the fixture keeps the old spelling that 0024 step 5e links
 * existing tasks by.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/scripts/default-catalog.mjs";

import legacy from "./__fixtures__/legacy-titles.json";

type LegacyRow = { phase: string; legacyTitle: string };
const FIXTURE = legacy as Record<string, LegacyRow[]>;

const TRAMO_KEYS = ["presale", "diseno", "construccion"] as const;
type TramoKey = (typeof TRAMO_KEYS)[number];
const isTramoKey = (v: unknown): v is TramoKey =>
  typeof v === "string" && (TRAMO_KEYS as readonly string[]).includes(v);

type CatalogRow = { tramo: TramoKey | null; title: string; legacyTitle: string };

/**
 * Every template row of the catalog (an object with string `title` and
 * `legacyTitle`) with the tramo it sits under: the nearest enclosing object
 * whose `workflowKey`/`key` is a tramo key, or a property named after one.
 * Reads the shape loosely so the guard doesn't depend on how the catalog nests.
 */
function catalogRows(node: unknown, tramo: TramoKey | null = null): CatalogRow[] {
  if (Array.isArray(node)) return node.flatMap((n) => catalogRows(n, tramo));
  if (node === null || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const own = isTramoKey(obj.workflowKey) ? obj.workflowKey : isTramoKey(obj.key) ? obj.key : tramo;
  if (typeof obj.title === "string" && typeof obj.legacyTitle === "string") {
    return [{ tramo: own, title: obj.title, legacyTitle: obj.legacyTitle }];
  }
  return Object.entries(obj).flatMap(([k, v]) => catalogRows(v, isTramoKey(k) ? k : own));
}

const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));
/** Accent- and case-insensitive, like `flow_name_key`. */
const key = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

describe("frozen legacy title fixture", () => {
  it("holds 10 / 29 / 12 old templates for Presale, Diseño and Construcción", () => {
    expect(Object.keys(FIXTURE).sort()).toEqual([...TRAMO_KEYS].sort());
    expect(FIXTURE.presale).toHaveLength(10);
    expect(FIXTURE.diseno).toHaveLength(29);
    expect(FIXTURE.construccion).toHaveLength(12);
  });

  it("keeps the old spellings 0024 links existing tasks by", () => {
    const all = Object.values(FIXTURE).flat().map((r) => r.legacyTitle);
    for (const title of [
      'Presentación "Quienes somos"',
      "Resporte Estado Actual",
      "Plano de distribicion",
      "Planos Arquitectonicos",
      "Supervicion de trabajos",
      "Garantias",
    ]) {
      expect(all).toContain(title);
    }
  });
});

describe("catalog drift guard: legacyTitle", () => {
  const rows = catalogRows(DEFAULT_CATALOG);

  it("has 51 template rows, each with a legacyTitle", () => {
    expect(rows).toHaveLength(51);
    for (const row of rows) expect(row.legacyTitle.trim(), row.title).not.toBe("");
  });

  it("every legacyTitle equals an old template title of its tramo, and none is missing", () => {
    for (const tramo of TRAMO_KEYS) {
      const fromCatalog = rows.filter((r) => r.tramo === tramo).map((r) => r.legacyTitle);
      const frozen = FIXTURE[tramo].map((r) => r.legacyTitle);
      expect(sorted(fromCatalog), tramo).toEqual(sorted(frozen));
    }
  });

  it("each title is its legacyTitle with the spelling fixed only", () => {
    const fixed = new Map([
      ["resporte estado actual", "reporte estado actual"],
      ["plano de distribicion", "plano de distribucion"],
      ["supervicion de trabajos", "supervision de trabajos"],
    ]);
    for (const row of rows) {
      const old = key(row.legacyTitle);
      expect(key(row.title), row.legacyTitle).toBe(fixed.get(old) ?? old);
    }
  });
});
