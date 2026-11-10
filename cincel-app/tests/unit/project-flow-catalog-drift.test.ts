// @vitest-environment node
/**
 * Catalog drift guard (BE §5.2, §16): `DEFAULT_CATALOG` (scripts/default-catalog.mjs)
 * and migration 0024 must carry the same fases and templates, the catalog has
 * 10/29/12 templates, and every `legacyTitle` is the old TS template
 * description at the same position (frozen in fixtures/project-flow-catalog.ts).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "@/scripts/default-catalog.mjs";

import { EXPECTED_CATALOG, LEGACY_TS_TEMPLATES } from "./fixtures/project-flow-catalog";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "lib/db/migrations");

type CatalogTemplate = {
  workflowKey: string;
  phaseKey: string;
  phaseName: string;
  title: string;
  legacyTitle: string | undefined;
};
type CatalogPhase = { workflowKey: string; key: string; name: string };
type FlatCatalog = { phases: CatalogPhase[]; templates: CatalogTemplate[] };

type Loose = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const list = (v: unknown): Loose[] => (Array.isArray(v) ? (v as Loose[]) : []);

function workflowKeyOf(row: Loose): string | undefined {
  return str(row.workflowKey) ?? str(row.tramoKey) ?? str(row.tramo) ?? str(row.workflow);
}

/**
 * Flattens `DEFAULT_CATALOG` into fase and template rows. Accepts the nested
 * form (tramos → phases → templates, as an array or keyed by workflow key) and
 * the flat form (`{ phases, templates }` with workflow and fase keys per row).
 */
function flattenCatalog(catalog: unknown): FlatCatalog {
  const phases: CatalogPhase[] = [];
  const templates: CatalogTemplate[] = [];

  const addNested = (workflowKey: string, phaseRows: Loose[]) => {
    for (const p of phaseRows) {
      const key = str(p.key) ?? str(p.phaseKey) ?? "";
      const name = str(p.name) ?? "";
      phases.push({ workflowKey, key, name });
      for (const t of list(p.templates)) {
        templates.push({
          workflowKey,
          phaseKey: key,
          phaseName: name,
          title: str(t.title) ?? "",
          legacyTitle: str(t.legacyTitle),
        });
      }
    }
  };

  // A flat array of template rows, each naming its tramo and fase.
  if (Array.isArray(catalog) && (catalog as Loose[]).every((r) => typeof r.title === "string")) {
    for (const t of catalog as Loose[]) {
      const workflowKey = workflowKeyOf(t) ?? "";
      const phaseKey = str(t.phaseKey) ?? "";
      const phaseName = str(t.phaseName) ?? str(t.phase) ?? "";
      if (!phases.some((p) => p.workflowKey === workflowKey && p.key === phaseKey)) {
        phases.push({ workflowKey, key: phaseKey, name: phaseName });
      }
      templates.push({ workflowKey, phaseKey, phaseName, title: str(t.title) ?? "", legacyTitle: str(t.legacyTitle) });
    }
    return { phases, templates };
  }

  if (Array.isArray(catalog)) {
    for (const tramo of catalog as Loose[]) {
      const workflowKey = workflowKeyOf(tramo) ?? str(tramo.key);
      if (!workflowKey || !Array.isArray(tramo.phases)) throw new Error("DEFAULT_CATALOG: unknown tramo shape");
      addNested(workflowKey, list(tramo.phases));
    }
    return { phases, templates };
  }

  const obj = (catalog ?? {}) as Loose;
  if (Array.isArray(obj.phases) && Array.isArray(obj.templates)) {
    for (const p of list(obj.phases)) {
      phases.push({ workflowKey: workflowKeyOf(p) ?? "", key: str(p.key) ?? "", name: str(p.name) ?? "" });
    }
    for (const t of list(obj.templates)) {
      const workflowKey = workflowKeyOf(t) ?? "";
      const phaseKey = str(t.phaseKey) ?? str(t.phase) ?? "";
      const phase = phases.find((p) => p.workflowKey === workflowKey && p.key === phaseKey);
      templates.push({
        workflowKey,
        phaseKey,
        phaseName: phase?.name ?? "",
        title: str(t.title) ?? "",
        legacyTitle: str(t.legacyTitle),
      });
    }
    return { phases, templates };
  }

  for (const [workflowKey, value] of Object.entries(obj)) {
    const phaseRows = Array.isArray(value) ? (value as Loose[]) : list((value as Loose)?.phases);
    addNested(workflowKey, phaseRows);
  }
  if (phases.length === 0) throw new Error("DEFAULT_CATALOG: unknown shape");
  return { phases, templates };
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Catalog values the SQL text doesn't contain as a quoted literal. */
function missingFromSql(catalog: FlatCatalog, sqlText: string): string[] {
  const missing: string[] = [];
  const need = (label: string, value: string | undefined) => {
    if (value && !sqlText.includes(sqlLiteral(value))) missing.push(`${label}: ${value}`);
  };
  for (const p of catalog.phases) {
    need(`fase key ${p.workflowKey}`, p.key);
    need(`fase ${p.workflowKey}`, p.name);
  }
  for (const t of catalog.templates) {
    need(`template ${t.workflowKey}·${t.phaseKey}`, t.title);
    need(`legacyTitle ${t.workflowKey}·${t.phaseKey}`, t.legacyTitle);
  }
  return missing;
}

function readBackfillSql(): string {
  const file = readdirSync(MIGRATIONS).find((f) => /^0024_.*\.sql$/.test(f));
  if (!file) throw new Error("migration 0024 not found in lib/db/migrations");
  return readFileSync(resolve(MIGRATIONS, file), "utf8");
}

const flat = flattenCatalog(DEFAULT_CATALOG);
const byTramo = (key: string) => flat.templates.filter((t) => t.workflowKey === key);

describe("DEFAULT_CATALOG", () => {
  it("has 14 fases and 10/29/12 templates", () => {
    expect(flat.phases).toHaveLength(14);
    expect(byTramo("presale")).toHaveLength(10);
    expect(byTramo("diseno")).toHaveLength(29);
    expect(byTramo("construccion")).toHaveLength(12);
    expect(flat.templates).toHaveLength(51);
  });

  it("matches the BE §5.1 fases and §5.2 titles in seed order", () => {
    for (const tramo of EXPECTED_CATALOG) {
      expect(
        flat.phases.filter((p) => p.workflowKey === tramo.workflowKey).map((p) => [p.key, p.name]),
        tramo.workflowKey
      ).toEqual(tramo.phases.map((p) => [p.key, p.name]));
      expect(
        byTramo(tramo.workflowKey).map((t) => [t.phaseKey, t.title]),
        tramo.workflowKey
      ).toEqual(tramo.phases.flatMap((p) => p.titles.map((title) => [p.key, title])));
    }
  });

  it("gives every template a legacyTitle equal to the TS description at the same position", () => {
    for (const [workflowKey, legacy] of Object.entries(LEGACY_TS_TEMPLATES)) {
      const rows = byTramo(workflowKey);
      expect(rows.map((t) => t.legacyTitle), workflowKey).toEqual(legacy.map((l) => l.description));
    }
  });

  it("keeps the TS fase of each template (accent-insensitive)", () => {
    const key = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const [workflowKey, legacy] of Object.entries(LEGACY_TS_TEMPLATES)) {
      const rows = byTramo(workflowKey);
      expect(rows.map((t) => key(t.phaseName)), workflowKey).toEqual(legacy.map((l) => key(l.phase)));
    }
  });
});

describe("0024 mirrors DEFAULT_CATALOG", () => {
  const sqlText = readBackfillSql();

  it("contains every fase, template title and legacyTitle", () => {
    expect(missingFromSql(flat, sqlText)).toEqual([]);
  });

  it("fails when a catalog row is missing from the SQL", () => {
    const victim = flat.templates.find((t) => t.title === "Reporte Estado Actual");
    expect(victim).toBeDefined();
    const altered = sqlText.split(sqlLiteral(victim!.title)).join("'Otro título'");
    expect(missingFromSql(flat, altered)).toContain(`template presale·presentacion: Reporte Estado Actual`);
  });

  it("fails when the catalog gains a row the SQL doesn't have", () => {
    const extra: FlatCatalog = {
      phases: flat.phases,
      templates: [
        ...flat.templates,
        { workflowKey: "diseno", phaseKey: "paisajismo", phaseName: "Paisajismo", title: "Riego", legacyTitle: "Riego" },
      ],
    };
    expect(missingFromSql(extra, sqlText)).toContain("template diseno·paisajismo: Riego");
  });
});

