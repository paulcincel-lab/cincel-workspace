// @vitest-environment node
/**
 * scripts/default-catalog.mjs (BE §5). The catalog shape cases always run; the
 * database cases run only when TEST_DATABASE_URL points at a migrated database,
 * each inside a transaction that is rolled back.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { disenoTemplate } from "@/lib/templates/diseno";
import { operativasTemplate } from "@/lib/templates/operativas";
import { presaleTemplate } from "@/lib/templates/presale";
import {
  DEFAULT_CATALOG,
  DEFAULT_FLOW_STATUSES,
  DEFAULT_POSITIONS,
  ensureDefaultCatalog,
} from "@/scripts/default-catalog.mjs";
import { DEFAULT_WORKFLOWS, ensureDefaultWorkflows } from "@/scripts/default-workflows.mjs";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

const tramo = (key: string) => DEFAULT_CATALOG.find((c) => c.workflowKey === key)!;
const templateCount = (key: string) => tramo(key).phases.reduce((n, p) => n + p.templates.length, 0);
const allTemplates = DEFAULT_CATALOG.flatMap((c) => c.phases.flatMap((p) => p.templates));

describe("DEFAULT_CATALOG", () => {
  it("covers the three default workflows in order", () => {
    expect(DEFAULT_CATALOG.map((c) => c.workflowKey)).toEqual(DEFAULT_WORKFLOWS.map((w) => w.key));
  });

  it("has the 14 fases of §5.1 in order", () => {
    expect(DEFAULT_CATALOG.map((c) => [c.workflowKey, c.phases.map((p) => p.key)])).toEqual([
      ["presale", ["inicial", "presentacion", "con_cliente", "minutas", "cobro"]],
      [
        "diseno",
        [
          "anteproyecto",
          "proyecto_arquitectonico",
          "ejecutivo",
          "proyecto_estructural",
          "proyecto_sustentable",
          "paisajismo",
          "minutas",
        ],
      ],
      ["construccion", ["residencia", "postventa"]],
    ]);
    expect(tramo("diseno").phases.find((p) => p.key === "proyecto_arquitectonico")?.name).toBe(
      "Proyecto Arquitectónico"
    );
  });

  it("has 51 templates: 10 / 29 / 12, with the per-fase counts of §5.2", () => {
    expect(allTemplates).toHaveLength(51);
    expect([templateCount("presale"), templateCount("diseno"), templateCount("construccion")]).toEqual([10, 29, 12]);
    expect(DEFAULT_CATALOG.map((c) => c.phases.map((p) => p.templates.length))).toEqual([
      [1, 6, 1, 1, 1],
      [4, 4, 14, 2, 3, 1, 1],
      [10, 2],
    ]);
  });

  it("has no duplicate fase key or name, nor template title within a fase", () => {
    for (const c of DEFAULT_CATALOG) {
      expect(new Set(c.phases.map((p) => p.key)).size).toBe(c.phases.length);
      expect(new Set(c.phases.map((p) => p.name.toLowerCase())).size).toBe(c.phases.length);
      for (const p of c.phases) {
        expect(new Set(p.templates.map((t) => t.title.toLowerCase())).size).toBe(p.templates.length);
      }
    }
  });

  it("keeps every legacyTitle equal to the old TS template, in the same order and fase", () => {
    const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const legacy = (key: string) =>
      tramo(key).phases.flatMap((p) => p.templates.map((t) => [strip(p.name), t.legacyTitle]));
    const ts = (rows: Array<{ phase: string; description: string }>) =>
      rows.map((r) => [strip(r.phase), r.description]);
    expect(legacy("presale")).toEqual(ts(presaleTemplate));
    expect(legacy("diseno")).toEqual(ts(disenoTemplate));
    expect(legacy("construccion")).toEqual(ts(operativasTemplate));
  });

  it("fixes the spelling of the TS titles (RD-1)", () => {
    const titles = allTemplates.map((t) => t.title);
    for (const fixed of [
      "Reporte Estado Actual",
      "Imágenes de Referencia",
      "Plano de distribución",
      "Volumetría",
      "Planos Arquitectónicos",
      "Supervisión de trabajos",
      "Cálculos Simulaciones",
      "Atención a calidad y detalles finos",
      "Bitácoras y Minutas",
    ]) {
      expect(titles).toContain(fixed);
    }
    expect(titles).not.toContain("Resporte Estado Actual");
  });
});

describe("DEFAULT_POSITIONS", () => {
  it("lists the six puestos of §5.3", () => {
    expect(DEFAULT_POSITIONS.map((p) => p.name)).toEqual([
      "Arquitecto proyectista",
      "Proyectista ejecutivo",
      "Dibujante",
      "Comercial",
      "Residente de obra",
      "Administración",
    ]);
  });

  it("only names fases that exist in the catalog", () => {
    for (const p of DEFAULT_POSITIONS) {
      expect(p.phases.length).toBeGreaterThan(0);
      for (const ref of p.phases) {
        expect(tramo(ref.workflowKey).phases.map((f) => f.key)).toContain(ref.phaseKey);
      }
    }
  });
});

describe.skipIf(!url)("ensureDefaultCatalog (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  async function inTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  }

  /** Empties the catalog tables and creates the default workflows (all rolled back). */
  async function freshInstall(tx: postgres.TransactionSql) {
    await tx`delete from core.tasks where workflow_id is not null`;
    await tx`delete from core.tramo_start_batches`;
    await tx`delete from core.workflow_task_templates`;
    await tx`delete from core.position_phases`;
    await tx`delete from core.workflow_phases`;
    await tx`delete from core.workspace_group_mappings where position_id is not null`;
    await tx`delete from core.staff_positions`;
    await tx`delete from core.positions`;
    await tx`delete from core.workflows`;
    const names = DEFAULT_FLOW_STATUSES.map((s) => s.name.toLowerCase());
    await tx`update core.tasks set custom_status_id = null
      where custom_status_id in (select id from core.task_statuses where lower(name) in ${tx(names)})`;
    await tx`delete from core.task_statuses where lower(name) in ${tx(names)}`;
    await ensureDefaultWorkflows(tx);
  }

  async function counts(tx: postgres.TransactionSql) {
    const [row] = await tx`
      select
        (select count(*)::int from core.workflow_phases) as phases,
        (select count(*)::int from core.workflow_task_templates) as templates,
        (select count(*)::int from core.positions) as positions,
        (select count(*)::int from core.position_phases) as position_phases,
        (select count(*)::int from core.task_statuses) as statuses`;
    return row;
  }

  it("seeds 14 fases, 51 templates, the puestos and the flow statuses on a fresh install", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      const changes = await ensureDefaultCatalog(tx);
      const candidates = DEFAULT_POSITIONS.reduce((n, p) => n + p.phases.length, 0);
      expect(changes).toEqual({
        phases: 14,
        templates: 51,
        positions: 6,
        positionPhases: candidates,
        statuses: 2,
      });

      const phases = await tx`
        select w.key as workflow, p.key, p.name, p.sort_order
        from core.workflow_phases p join core.workflows w on w.id = p.workflow_id
        where w.key = 'diseno' order by p.sort_order`;
      expect(phases.map((p) => p.key)).toEqual(tramo("diseno").phases.map((p) => p.key));

      const templates = await tx`
        select t.title, t.sort_order, t.default_priority, p.key as phase
        from core.workflow_task_templates t
        join core.workflow_phases p on p.id = t.phase_id
        join core.workflows w on w.id = t.workflow_id
        where w.key = 'presale' order by t.sort_order`;
      expect(templates.map((t) => [t.sort_order, t.phase, t.title])).toEqual(
        tramo("presale").phases.flatMap((p) => p.templates.map((t) => [p.key, t.title])).map((r, i) => [i, ...r])
      );
      expect(new Set(templates.map((t) => t.default_priority))).toEqual(new Set(["media"]));

      const [comercial] = await tx`
        select array_agg(ph.key order by ph.sort_order) as keys
        from core.positions pos
        join core.position_phases pp on pp.position_id = pos.id
        join core.workflow_phases ph on ph.id = pp.phase_id
        where pos.name = 'Comercial'`;
      expect(comercial.keys).toEqual(["inicial", "presentacion", "con_cliente", "minutas"]);

      const statuses = await tx`
        select name, closes, counts_as_completed from core.task_statuses
        where name in ('Cancelado', 'En espera') and deleted_at is null order by name`;
      expect(statuses.map((s) => [s.name, s.closes, s.counts_as_completed])).toEqual([
        ["Cancelado", true, false],
        ["En espera", false, false],
      ]);

      const [presale] = await tx`select auto_start from core.workflows where key = 'presale'`;
      expect(presale.auto_start).toBe("on_create");
    });
  });

  it("makes no changes the second time", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      await ensureDefaultCatalog(tx);
      const before = await counts(tx);
      expect(await ensureDefaultCatalog(tx)).toEqual({
        phases: 0,
        templates: 0,
        positions: 0,
        positionPhases: 0,
        statuses: 0,
      });
      expect(await counts(tx)).toEqual(before);
    });
  });

  it("does not revive or duplicate soft-deleted puestos and statuses", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      await ensureDefaultCatalog(tx);
      await tx`update core.positions set deleted_at = now() where name = 'Dibujante'`;
      await tx`update core.task_statuses set deleted_at = now() where name = 'En espera'`;
      const before = await counts(tx);

      expect(await ensureDefaultCatalog(tx)).toEqual({
        phases: 0,
        templates: 0,
        positions: 0,
        positionPhases: 0,
        statuses: 0,
      });
      expect(await counts(tx)).toEqual(before);
      const [{ live }] = await tx`
        select count(*)::int as live from core.positions where name = 'Dibujante' and deleted_at is null`;
      expect(live).toBe(0);
      const [{ espera }] = await tx`
        select count(*)::int as espera from core.task_statuses where name = 'En espera' and deleted_at is null`;
      expect(espera).toBe(0);
    });
  });

  it("does not re-seed a status deleted before the fases were seeded", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      await tx`insert into core.task_statuses (name, closes, deleted_at) values ('En espera', false, now())`;
      const changes = await ensureDefaultCatalog(tx);
      expect(changes.statuses).toBe(1);
      const [{ count }] = await tx`
        select count(*)::int as count from core.task_statuses where name = 'En espera' and deleted_at is null`;
      expect(count).toBe(0);
    });
  });

  it("leaves a workflow that already has fases alone, and seeds the others", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      const [presale] = await tx`select id from core.workflows where key = 'presale'`;
      await tx`insert into core.workflow_phases (workflow_id, key, name) values (${presale.id}, 'propia', 'Propia')`;
      const changes = await ensureDefaultCatalog(tx);
      expect(changes.phases).toBe(14 - tramo("presale").phases.length);
      expect(changes.templates).toBe(51 - templateCount("presale"));
      const rows = await tx`select key from core.workflow_phases where workflow_id = ${presale.id}`;
      expect(rows.map((r) => r.key)).toEqual(["propia"]);
    });
  });

  it("fills candidate fases for puestos created before any fase existed (0024 step 14)", async () => {
    await inTx(async (tx) => {
      await freshInstall(tx);
      for (const [i, p] of DEFAULT_POSITIONS.entries()) {
        await tx`insert into core.positions (name, sort_order) values (${p.name}, ${i})`;
      }
      const changes = await ensureDefaultCatalog(tx);
      expect(changes.positions).toBe(0);
      expect(changes.positionPhases).toBe(DEFAULT_POSITIONS.reduce((n, p) => n + p.phases.length, 0));
    });
  });
});
