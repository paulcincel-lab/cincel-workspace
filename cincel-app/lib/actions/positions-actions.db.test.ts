// @vitest-environment node
/**
 * Puestos against a real Postgres (project flow BE §7.2, §8.4, §16): CRUD and
 * `IN_USE`, `setStaffPositions` keeping `workspace` rows, the Google-managed
 * refusal, candidate fases and `listAssignableStaff` suggestions. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 */
import { unwrapActions } from "@/tests/helpers/action-result";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lockTramoCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ access: "Administrador" as string, memberId: "admin" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Admin",
      role: session.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: session.access,
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("puestos (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockTramoCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/positions-repository");
  const staffRepo = await import("@/lib/repositories/staff-repository");
  const actions = await import("@/lib/actions/positions-actions");
  const { setStaffPositionsAction } = unwrapActions(await import("@/lib/actions/staff-actions"));
  const { GOOGLE_MANAGED_REFUSAL } = await import("@/lib/types/workspace-access");

  const positionIds: string[] = [];
  const staffIds: string[] = [];
  const mappingIds: string[] = [];
  let workflowId = "";
  let phaseId = "";
  let otherPhaseId = "";
  let adminId = "";

  async function makePosition(label: string, active = true): Promise<string> {
    const [row] = await db
      .insert(schema.positions)
      .values({ name: `Puesto ${run} ${label}`, active, sortOrder: 900 + positionIds.length })
      .returning({ id: schema.positions.id });
    positionIds.push(row!.id);
    return row!.id;
  }

  async function makeStaff(label: string, options: { googleSub?: string } = {}): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Integrante ${run} ${label}`, googleSub: options.googleSub ?? null })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  /** kind 'position' exists only after migration 0024 renames the enum value, so raw SQL. */
  async function mapGroupToPosition(positionId: string): Promise<string> {
    const rows = await db.execute<{ id: string }>(sql`
      insert into core.workspace_group_mappings (group_email, group_id, kind, position_id)
      values (${`puesto-${run}-${mappingIds.length}@cincel.example`}, ${`group-${run}-${mappingIds.length}`}, 'position', ${positionId})
      returning id
    `);
    const id = (rows as unknown as Array<{ id: string }>)[0]!.id;
    mappingIds.push(id);
    return id;
  }

  async function staffRows(staffId: string) {
    const rows = await db
      .select({ positionId: schema.staffPositions.positionId, source: schema.staffPositions.source })
      .from(schema.staffPositions)
      .where(eq(schema.staffPositions.staffId, staffId));
    return rows.sort((a, b) => a.positionId.localeCompare(b.positionId));
  }

  const sorted = (rows: Array<{ positionId: string; source: string }>) =>
    [...rows].sort((a, b) => a.positionId.localeCompare(b.positionId));

  beforeAll(async () => {
    adminId = await makeStaff("Admin");
    const [workflow] = await db
      .insert(schema.workflows)
      .values({ key: `test-${run}`, name: `Tramo ${run}`, sortOrder: 999 })
      .returning({ id: schema.workflows.id });
    workflowId = workflow!.id;
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId, name: `Fase ${run} A`, sortOrder: 0 },
        { workflowId, name: `Fase ${run} B`, sortOrder: 1 },
      ])
      .returning({ id: schema.workflowPhases.id });
    phaseId = phases[0]!.id;
    otherPhaseId = phases[1]!.id;
  });

  beforeEach(() => {
    session.access = "Administrador";
    session.memberId = adminId;
  });

  afterAll(async () => {
    if (mappingIds.length) {
      await db.delete(schema.workspaceGroupMappings).where(inArray(schema.workspaceGroupMappings.id, mappingIds));
    }
    const created = await db
      .select({ id: schema.positions.id })
      .from(schema.positions)
      .where(sql`${schema.positions.name} like ${`Puesto ${run}%`}`);
    const ids = [...new Set([...positionIds, ...created.map((row) => row.id)])];
    if (ids.length) {
      await db.delete(schema.staffPositions).where(inArray(schema.staffPositions.positionId, ids));
      await db.delete(schema.positionPhases).where(inArray(schema.positionPhases.positionId, ids));
      await db.delete(schema.positions).where(inArray(schema.positions.id, ids));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    if (workflowId) {
      await db.delete(schema.workflowPhases).where(eq(schema.workflowPhases.workflowId, workflowId));
      await db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    }
  });

  describe("CRUD", () => {
    it("creates, lists and renames a puesto; names are unique case-insensitively", async () => {
      const created = await actions.createPositionAction({ name: `Puesto ${run} Nuevo` });
      positionIds.push(created.id);
      expect(created).toMatchObject({ name: `Puesto ${run} Nuevo`, active: true, phases: [], staffCount: 0, googleManaged: false });

      const listed = await actions.fetchPositionsAction();
      expect(listed.map((p) => p.id)).toContain(created.id);

      await expect(actions.createPositionAction({ name: `  puesto ${run} NUEVO ` })).rejects.toThrow(/^NAME_TAKEN/);
      await expect(actions.createPositionAction({ name: "   " })).rejects.toThrow(/^(EMPTY|INVALID)/);

      const renamed = await actions.updatePositionAction(created.id, { name: `Puesto ${run} Renombrado` });
      expect(renamed.name).toBe(`Puesto ${run} Renombrado`);
      await expect(actions.updatePositionAction(randomUUID(), { name: `Puesto ${run} X` })).rejects.toThrow(/^NOT_FOUND/);
    });

    it("refuses writes without positions.canManagePositions", async () => {
      session.access = "Colaborador";
      await expect(actions.createPositionAction({ name: `Puesto ${run} Prohibido` })).rejects.toThrow(/^FORBIDDEN/);
      await expect(actions.reorderPositionsAction(positionIds)).rejects.toThrow(/^FORBIDDEN/);
      // Reads stay open to any staff session.
      await expect(actions.fetchPositionsAction()).resolves.toBeInstanceOf(Array);
    });
  });

  describe("delete", () => {
    it("returns IN_USE while a Google group mapping references the puesto", async () => {
      const id = await makePosition("Mapeado");
      await mapGroupToPosition(id);

      const listed = await actions.fetchPositionsAction();
      expect(listed.find((p) => p.id === id)?.googleManaged).toBe(true);

      await expect(actions.deletePositionAction(id)).rejects.toThrow(/^IN_USE/);
      const [row] = await db.select().from(schema.positions).where(eq(schema.positions.id, id));
      expect(row?.deletedAt).toBeNull();
    });

    it("soft-deletes an unmapped puesto and removes its staff and fase rows", async () => {
      const id = await makePosition("Borrable");
      const member = await makeStaff("Borrable");
      await db.insert(schema.staffPositions).values({ staffId: member, positionId: id, source: "manual" });
      await db.insert(schema.positionPhases).values({ positionId: id, phaseId });

      await actions.deletePositionAction(id);

      const [row] = await db.select().from(schema.positions).where(eq(schema.positions.id, id));
      expect(row?.deletedAt).not.toBeNull();
      expect(await staffRows(member)).toEqual([]);
      const phases = await db.select().from(schema.positionPhases).where(eq(schema.positionPhases.positionId, id));
      expect(phases).toEqual([]);
      expect((await actions.fetchPositionsAction()).some((p) => p.id === id)).toBe(false);
      await expect(actions.deletePositionAction(randomUUID())).rejects.toThrow(/^NOT_FOUND/);
    });
  });

  describe("candidate fases", () => {
    it("setPositionPhases replaces the set; unknown fase ids are NOT_FOUND", async () => {
      const id = await makePosition("Fases");
      const first = await actions.setPositionPhasesAction(id, [phaseId, otherPhaseId]);
      expect(first.phases.map((p) => p.id)).toEqual([phaseId, otherPhaseId]);
      expect(first.phases[0]).toMatchObject({ workflowId, workflowName: `Tramo ${run}` });

      const second = await actions.setPositionPhasesAction(id, [otherPhaseId]);
      expect(second.phases.map((p) => p.id)).toEqual([otherPhaseId]);

      await expect(actions.setPositionPhasesAction(id, [randomUUID()])).rejects.toThrow(/^NOT_FOUND/);
      const kept = await db.select().from(schema.positionPhases).where(eq(schema.positionPhases.positionId, id));
      expect(kept.map((row) => row.phaseId)).toEqual([otherPhaseId]);
    });
  });

  describe("setStaffPositions", () => {
    it("replaces the manual rows only and keeps the workspace rows", async () => {
      const fromGoogle = await makePosition("Workspace");
      const oldManual = await makePosition("Manual viejo");
      const newManual = await makePosition("Manual nuevo");
      const member = await makeStaff("Mixto");
      await db.insert(schema.staffPositions).values([
        { staffId: member, positionId: fromGoogle, source: "workspace" },
        { staffId: member, positionId: oldManual, source: "manual" },
      ]);

      await repo.setStaffPositions(member, [newManual]);

      expect(await staffRows(member)).toEqual(
        sorted([
          { positionId: fromGoogle, source: "workspace" },
          { positionId: newManual, source: "manual" },
        ])
      );

      // Sending the workspace puesto back doesn't turn it into a manual row.
      await repo.setStaffPositions(member, [fromGoogle]);
      expect(await staffRows(member)).toEqual([{ positionId: fromGoogle, source: "workspace" }]);
    });

    it("the action saves the set for a non-Google person", async () => {
      const a = await makePosition("Accion A");
      const b = await makePosition("Accion B");
      const member = await makeStaff("Contraseña");

      await expect(setStaffPositionsAction(member, [a, b])).resolves.toBeUndefined();
      expect(await staffRows(member)).toEqual(
        sorted([
          { positionId: a, source: "manual" },
          { positionId: b, source: "manual" },
        ])
      );

      const detail = await staffRepo.getStaff(member);
      expect(detail?.positions?.map((p) => p.id).sort()).toEqual([a, b].sort());
    });

    it("refuses a change for a Google-managed person when position mappings exist", async () => {
      const mapped = await makePosition("Google");
      const extra = await makePosition("Google extra");
      await mapGroupToPosition(mapped);
      const member = await makeStaff("Google", { googleSub: `sub-${run}` });
      await db.insert(schema.staffPositions).values({ staffId: member, positionId: mapped, source: "workspace" });

      await expect(setStaffPositionsAction(member, [mapped, extra])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
      await expect(setStaffPositionsAction(member, [])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
      expect(await staffRows(member)).toEqual([{ positionId: mapped, source: "workspace" }]);

      // The same set as the workspace rows is not a change.
      await expect(setStaffPositionsAction(member, [mapped])).resolves.toBeUndefined();
      expect(await staffRows(member)).toEqual([{ positionId: mapped, source: "workspace" }]);
    });

    it("refuses without team.canEditCollaborator", async () => {
      const id = await makePosition("Sin permiso");
      const member = await makeStaff("Sin permiso");
      session.access = "Colaborador";
      await expect(setStaffPositionsAction(member, [id])).rejects.toThrow(/^FORBIDDEN/);
      expect(await staffRows(member)).toEqual([]);
    });
  });

  describe("assignable staff and candidates", () => {
    it("listAssignableStaff flags staff whose puestos list a fase of the tramo, suggested first", async () => {
      const matching = await makePosition("Candidato");
      const unrelated = await makePosition("Otro");
      await db.insert(schema.positionPhases).values({ positionId: matching, phaseId });

      // "Z…" sorts after "A…" by name, so only the suggested flag can put it first.
      const suggestedId = await makeStaff("Z sugerido");
      const plainId = await makeStaff("A sin puesto");
      const unrelatedId = await makeStaff("A otro puesto");
      await db.insert(schema.staffPositions).values([
        { staffId: suggestedId, positionId: matching, source: "manual" },
        { staffId: unrelatedId, positionId: unrelated, source: "manual" },
      ]);

      const list = await staffRepo.listAssignableStaff({ workflowId });
      const byId = new Map(list.map((s) => [s.id, s]));
      expect(byId.get(suggestedId)?.suggested).toBe(true);
      expect(byId.get(plainId)?.suggested).toBe(false);
      expect(byId.get(unrelatedId)?.suggested).toBe(false);

      const firstUnsuggested = list.findIndex((s) => !s.suggested);
      expect(list.findIndex((s) => s.id === suggestedId)).toBeLessThan(firstUnsuggested);
      expect(list.slice(firstUnsuggested).every((s) => !s.suggested)).toBe(true);

      // Without a tramo nobody is suggested.
      const all = await staffRepo.listAssignableStaff({ workflowId: null });
      expect(all.find((s) => s.id === suggestedId)?.suggested).toBe(false);
    });

    it("listCandidates returns holders of live, active puestos per fase, with no open tasks counted", async () => {
      const active = await makePosition("Candidatos activo");
      const inactive = await makePosition("Candidatos inactivo", false);
      await db.insert(schema.positionPhases).values([
        { positionId: active, phaseId: otherPhaseId },
        { positionId: inactive, phaseId: otherPhaseId },
      ]);
      const holder = await makeStaff("Candidato activo");
      const inactiveHolder = await makeStaff("Candidato inactivo");
      await db.insert(schema.staffPositions).values([
        { staffId: holder, positionId: active, source: "manual" },
        { staffId: inactiveHolder, positionId: inactive, source: "manual" },
      ]);

      const candidates = await repo.listCandidates(db, [otherPhaseId]);
      const forPhase = candidates.get(otherPhaseId) ?? [];
      const mine = forPhase.filter((c) => c.id === holder || c.id === inactiveHolder);
      expect(mine).toEqual([
        { id: holder, name: `Integrante ${run} Candidato activo`, positions: [`Puesto ${run} Candidatos activo`], openTasks: 0 },
      ]);
    });

    it("staff DTOs list positions and their candidate fases", async () => {
      const id = await makePosition("DTO");
      await db.insert(schema.positionPhases).values({ positionId: id, phaseId });
      const member = await makeStaff("DTO");
      await db.insert(schema.staffPositions).values({ staffId: member, positionId: id, source: "manual" });

      const detail = await staffRepo.getStaff(member);
      expect(detail?.positions).toEqual([{ id, name: `Puesto ${run} DTO` }]);
      expect(detail?.candidatePhases?.map((p) => p.id)).toEqual([phaseId]);

      const listed = (await staffRepo.listStaff()).find((s) => s.id === member);
      expect(listed?.positions?.map((p) => p.id)).toEqual([id]);

      // Sanity: the fixture rows are where the DTO says.
      const rows = await db
        .select()
        .from(schema.staffPositions)
        .where(and(eq(schema.staffPositions.staffId, member), eq(schema.staffPositions.positionId, id)));
      expect(rows).toHaveLength(1);
    });
  });
});
