// @vitest-environment node
/**
 * A second flow (Diseño → Construcción style) assigned to a project, against a
 * real Postgres: the project follows it, and "Listos para iniciar" reads its
 * gate. Runs only when TEST_DATABASE_URL points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";

import * as schema from "@/lib/db/schema";

const url = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("second flow assigned to a project (test DB)", async () => {
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const client = postgres(url ?? "", { max: 4 });
  const db = drizzle(client, { schema });
  const { flows, flowTramos, projects, projectStages, workflowPhases, workflows } = schema;
  const { getFlowForProject } = await import("./flows");
  const { etapaBoard } = await import("./readiness");

  const wf = { design: "", build: "" };
  let flowId = "";
  let ownProject = "";
  let defaultProject = "";

  beforeAll(async () => {
    const [d, b] = await db
      .insert(workflows)
      .values([
        { key: `f2_design_${run}`, name: `Diseño ${run}`, sortOrder: 9101 },
        { key: `f2_build_${run}`, name: `Construcción ${run}`, sortOrder: 9102 },
      ])
      .returning({ id: workflows.id });
    wf.design = d.id;
    wf.build = b.id;
    await db.insert(workflowPhases).values({ workflowId: wf.design, name: "Ejecutivo", key: "ejecutivo", sortOrder: 0 });
    const [flow] = await db
      .insert(flows)
      .values({ key: `second_${run}`, name: `Segundo ${run}` })
      .returning({ id: flows.id });
    flowId = flow.id;
    await db.insert(flowTramos).values([
      { flowId, workflowId: wf.design, sortOrder: 0 },
      { flowId, workflowId: wf.build, sortOrder: 1, afterWorkflowId: wf.design, gatePhaseKey: "ejecutivo" },
    ]);
    const [own, other] = await db
      .insert(projects)
      .values([
        { name: `Segundo flujo ${run} A`, flowId },
        { name: `Segundo flujo ${run} B` },
      ])
      .returning({ id: projects.id });
    ownProject = own.id;
    defaultProject = other.id;
    await db.insert(projectStages).values({ projectId: ownProject, workflowId: wf.design });
  });

  afterAll(async () => {
    await db.delete(projects).where(inArray(projects.id, [ownProject, defaultProject]));
    await db.delete(flows).where(eq(flows.id, flowId));
    await db.delete(workflowPhases).where(inArray(workflowPhases.workflowId, [wf.design, wf.build]));
    await db.delete(workflows).where(inArray(workflows.id, [wf.design, wf.build]));
    await client.end();
  });

  it("gives the project its own flow, in order, with the gate", async () => {
    const flow = await getFlowForProject(db, ownProject);
    expect(flow?.flowId).toBe(flowId);
    expect(flow?.tramos.map((t) => t.workflowId)).toEqual([wf.design, wf.build]);
    expect(flow?.tramos[1].gate).toEqual({ afterWorkflowId: wf.design, phaseKey: "ejecutivo" });
  });

  it("lists the project as ready for the second etapa once the gate fase has no tasks, and only it", async () => {
    const board = await etapaBoard(db, wf.build, { staffId: randomUUID(), isAdmin: true });
    expect(board.ready.map((p) => p.project.id)).toEqual([ownProject]);
    expect(board.upcoming).toEqual([]);
  });
});
