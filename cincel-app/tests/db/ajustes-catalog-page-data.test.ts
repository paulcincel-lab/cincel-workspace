// @vitest-environment node
/**
 * Ajustes catalog page data (Query Migration 9b, #964; plan §4.8 rules 2–3)
 * against a real Postgres. Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). Every row it creates carries a
 * per-run marker and is deleted afterwards.
 *
 * - Estatus, Puestos, Etapas and Permisos page data as a viewer without the
 *   segment capability (a non-admin) → FORBIDDEN; a guest → FORBIDDEN.
 * - Permisos page data carries no emails and no profile fields.
 * - Puestos page data runs ≤ 5 statements (`countQueries`).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
// The org appearance read (other Ajustes loaders in the same module) opts out of prerendering with `connection()`.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("ajustes catalog page data (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { countQueries } = await import("../helpers/count-queries");
  const actions = await import("@/lib/actions/page-data/ajustes-actions");

  const staffIds: string[] = [];
  const positionIds: string[] = [];
  const email = `ajustes-permisos-${run}@cincel.example`;
  let admin = "";
  let collaborator = "";

  const asAdmin = { id: "", access: "Administrador" as const };
  const asDireccion = { id: "", access: "Dirección" as const };
  const asCollaborator = { id: "", access: "Colaborador" as const };

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Ajustes ${run} Admin`, email: `admin-${email}`, role: "Administrador" },
        { name: `Ajustes ${run} Colab`, lastName: "Pérez", email, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    staffIds.push(...rows.map((row) => row.id));
    [admin, collaborator] = staffIds;
    asAdmin.id = admin;
    asDireccion.id = collaborator;
    asCollaborator.id = collaborator;
    const [position] = await db
      .insert(schema.positions)
      .values({ name: `Puesto ${run}`, sortOrder: 9_999 })
      .returning({ id: schema.positions.id });
    positionIds.push(position!.id);
    await db.insert(schema.staffPositions).values({ staffId: collaborator, positionId: position!.id, source: "manual" });
  });

  afterAll(async () => {
    if (positionIds.length > 0) {
      await db.delete(schema.staffPositions).where(inArray(schema.staffPositions.positionId, positionIds));
      await db.delete(schema.positions).where(inArray(schema.positions.id, positionIds));
    }
    if (staffIds.length > 0) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  const PAGE_DATA: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    ["estatus", () => actions.getAjustesEstatusPageData({})],
    ["puestos", () => actions.getAjustesPuestosPageData({})],
    ["etapas", () => actions.getAjustesEtapasPageData({})],
    ["permisos", () => actions.getAjustesPermisosPageData({})],
  ];

  describe.each(PAGE_DATA)("getAjustes(%s)PageData", (_segment, call) => {
    it("is FORBIDDEN for a guest", async () => {
      await expect(asViewer(null, call)).rejects.toThrow(/^FORBIDDEN/);
    });

    it("is FORBIDDEN for a non-admin (Dirección, Colaborador)", async () => {
      await expect(asViewer(asDireccion, call)).rejects.toThrow(/^FORBIDDEN/);
      await expect(asViewer(asCollaborator, call)).rejects.toThrow(/^FORBIDDEN/);
    });

    it("answers an Administrador", async () => {
      await expect(asViewer(asAdmin, call)).resolves.toBeTypeOf("object");
    });
  });

  it("Permisos page data carries only id, name, lastName, active and access per person (no emails)", async () => {
    const data = await asViewer(asAdmin, () => actions.getAjustesPermisosPageData({}));
    const mine = data.staff.find((person) => person.id === collaborator);
    expect(mine).toEqual({ id: collaborator, name: `Ajustes ${run} Colab`, lastName: "Pérez", active: true, access: "Colaborador" });
    for (const person of data.staff) {
      expect(Object.keys(person).sort()).toEqual(["access", "active", "id", "lastName", "name"]);
    }
    const json = JSON.stringify(data);
    expect(json).not.toContain(email);
    expect(json).not.toContain(`admin-${email}`);
    expect(Object.keys(data).sort()).toEqual(["defaultPermissions", "hasCustom", "permissions", "staff"]);
  });

  it("Puestos page data runs ≤ 5 statements in one wave", async () => {
    const { result, count } = await countQueries(() =>
      asViewer(asAdmin, () => actions.getAjustesPuestosPageData({})),
    );
    expect(count).toBeLessThanOrEqual(5);
    const mine = result.positions.find((position) => position.id === positionIds[0]);
    expect(mine?.staffCount).toBe(1);
    // The fase picker gets the active etapas with their active fases.
    for (const workflow of result.workflows) {
      expect(workflow.active).toBe(true);
      expect(workflow.phases.every((phase) => phase.active && phase.workflowId === workflow.id)).toBe(true);
    }
  });

  it("Puestos lists the same etapas and fases as the full workflows read", async () => {
    const { listWorkflows, listWorkflowPhaseTree } = await import("@/lib/repositories/workflows-repository");
    const [full, tree] = await Promise.all([listWorkflows({}), listWorkflowPhaseTree()]);
    const shape = (rows: typeof full) =>
      rows.map((w) => ({ id: w.id, name: w.name, phases: w.phases.map((p) => [p.id, p.name, p.templateCount]) }));
    expect(shape(tree)).toEqual(shape(full));
  });

  it("Etapas page data includes inactive etapas for an Administrador", async () => {
    const data = await asViewer(asAdmin, () => actions.getAjustesEtapasPageData({}));
    const ids = data.workflows.map((workflow) => workflow.id);
    const rows = await db.select({ id: schema.workflows.id }).from(schema.workflows).where(eq(schema.workflows.active, false));
    for (const row of rows) {
      const [live] = await db
        .select({ deletedAt: schema.workflows.deletedAt })
        .from(schema.workflows)
        .where(eq(schema.workflows.id, row.id));
      if (!live?.deletedAt) expect(ids).toContain(row.id);
    }
  });
});
