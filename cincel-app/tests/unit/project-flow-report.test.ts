// @vitest-environment node
/**
 * scripts/project-flow-report.ts: the markdown formatter, plus loadReport
 * against TEST_DATABASE_URL (a migrated database) inside a rolled-back
 * transaction. The DB case is skipped without it.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { projectFlowMigrationReport } from "@/lib/db/schema/flow-report";
import { PROJECT_FLOW_REPORT_KINDS } from "@/lib/project-flow/catalog";
import {
  EMPTY_REPORT_MESSAGE,
  formatReport,
  loadReport,
  REPORT_KIND_INFO,
  type ReportRow,
} from "@/scripts/project-flow-report";

const row = (r: Partial<ReportRow> & Pick<ReportRow, "kind" | "entity">): ReportRow => ({
  entityId: null,
  value: null,
  detail: null,
  ...r,
});

describe("formatReport", () => {
  it("prints a clear message when the report is empty", () => {
    const out = formatReport([]);
    expect(out).toContain(EMPTY_REPORT_MESSAGE);
    expect(out).not.toContain("## ");
  });

  it("describes every known kind", () => {
    for (const kind of PROJECT_FLOW_REPORT_KINDS) expect(REPORT_KIND_INFO[kind]).toBeDefined();
  });

  it("groups by kind in spec order with counts", () => {
    const out = formatReport([
      row({ kind: "group_mapping_area_removed", entity: "group_mapping", value: "diseno@cincel.mx" }),
      row({ kind: "project_phases", entity: "project", entityId: "11111111-1111-1111-1111-111111111111", value: "Obra" }),
      row({ kind: "task_phase_unmatched", entity: "task", value: "Planos" }),
      row({ kind: "task_phase_unmatched", entity: "task", value: "Renders" }),
      row({ kind: "area", entity: "area", value: "Diseño" }),
    ]);

    const sections = [
      "## `task_phase_unmatched` (2)",
      "## `project_phases` (1)",
      "## `area` (1)",
      "## `group_mapping_area_removed` (1)",
    ];
    const positions = sections.map((s) => out.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(out).toContain("| **Total** | **5** |");
    expect(out).toContain("| project | 11111111-1111-1111-1111-111111111111 | Obra | — |");
    expect(out).toContain("diseno@cincel.mx");
    expect(out).not.toContain(EMPTY_REPORT_MESSAGE);
  });

  it("serializes detail and escapes table cells", () => {
    const out = formatReport([
      row({
        kind: "status_reused",
        entity: "status",
        value: "En espera | pausa",
        detail: { tasksReopened: 2 },
      }),
    ]);
    expect(out).toContain("En espera \\| pausa");
    expect(out).toContain('{"tasksReopened":2}');
  });

  it("keeps unknown kinds at the end", () => {
    const out = formatReport([
      row({ kind: "zz_custom", entity: "task" }),
      row({ kind: "area", entity: "area", value: "Obra" }),
    ]);
    expect(out.indexOf("## `area`")).toBeLessThan(out.indexOf("## `zz_custom`"));
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("loadReport (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  afterAll(() => sql.end());

  it("reads the rows written by the migration report", async () => {
    await db
      .transaction(async (tx) => {
        await tx.delete(projectFlowMigrationReport);
        await tx.insert(projectFlowMigrationReport).values([
          { kind: "area", entity: "area", value: "Diseño", detail: { members: 3 } },
          { kind: "project_phases", entity: "project", value: "Obra", detail: null },
        ]);
        const rows = await loadReport(tx as unknown as typeof db);
        expect(rows.map((r) => r.kind)).toEqual(["area", "project_phases"]);
        expect(rows[0].detail).toEqual({ members: 3 });
        expect(formatReport(rows)).toContain("## `area` (1)");
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
