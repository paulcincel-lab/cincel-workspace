// @vitest-environment node
/**
 * "Reacomodar importación" on a Madrid 22 fixture (project flow BE §11, §16):
 * a project imported before the project flow (every task on the board's
 * tramo, no fase) with groups Presale, Diseño, Proyecto Ejecutivo,
 * Administrativo and Obra, 210 tasks in all.
 *
 * Covers the default targets plus `Obra=tramo:construccion` (tramos Presale →
 * Diseño → Construcción, current Construcción, 210 tasks before and after, no
 * deletions), a re-apply that changes nothing, a rollback of the batch after
 * the remap, the CLI dry run and EXPORT_MISSING / NOT_IMPORTED.
 *
 * Needs TEST_DATABASE_URL pointing at a migrated database; each test runs in
 * a transaction that is rolled back.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";

import * as schema from "@/lib/db/schema";
import type { ImportDb } from "@/lib/import/refs";
import type { MondayDb, MondayDbHandle } from "@/scripts/monday/db";
import {
  applyRemap,
  createRemapCommand,
  currentRemapInput,
  EXPORT_MISSING_TEXT,
  loadRemapState,
  planRemap,
} from "@/scripts/monday/remap";
import { deleteBatchRows, findRollbackBlockers } from "@/scripts/monday/rollback";
import type { CliIo } from "@/scripts/monday/run";

const ADMIN = "71000000-0000-4000-8000-000000000001";
const ADMIN_EMAIL = "admin.remap@example.com";
const WORKER = "71000000-0000-4000-8000-000000000002";
const BOARD = "7700001";
const PROJECT_NAME = "Madrid 22 (remap test)";
const ACCOUNT = "remap-test-767";

const GROUP_SIZES = { g_pre: 30, g_dis: 90, g_eje: 40, g_adm: 10, g_obra: 40 } as const;
type GroupId = keyof typeof GROUP_SIZES;

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { cli, out: () => out.join(""), err: () => err.join("") };
}

describe.skipIf(!url)("remap on the Madrid 22 fixture (test DB)", { timeout: 60_000 }, () => {
  // It finds or creates the default tramos by key: one catalog-changing file at a time (tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const dirs: string[] = [];

  afterAll(() => client.end({ timeout: 5 }));
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function flow(tx: Tx, key: string, name: string, sortOrder: number) {
    const [found] = await tx
      .select()
      .from(schema.workflows)
      .where(and(eq(schema.workflows.key, key), isNull(schema.workflows.deletedAt)))
      .limit(1);
    if (found) {
      if (!found.active) await tx.update(schema.workflows).set({ active: true }).where(eq(schema.workflows.id, found.id));
      return found;
    }
    const [row] = await tx.insert(schema.workflows).values({ key, name, sortOrder }).returning();
    return row;
  }

  async function phase(tx: Tx, workflowId: string, key: string, name: string, sortOrder: number) {
    const [found] = await tx
      .select()
      .from(schema.workflowPhases)
      .where(and(eq(schema.workflowPhases.workflowId, workflowId), eq(schema.workflowPhases.key, key)))
      .limit(1);
    if (found) return found;
    const [row] = await tx.insert(schema.workflowPhases).values({ workflowId, key, name, sortOrder }).returning();
    return row;
  }

  interface Fixture {
    tx: Tx;
    mdb: MondayDb;
    projectId: string;
    batchId: string;
    dir: string;
    presale: string;
    diseno: string;
    construccion: string;
    ejecutivo: string;
    groupOf: Map<string, GroupId>;
    handle: MondayDbHandle;
  }

  /** Seeds the catalog, staff, the imported project with 210 tasks, its batch, refs and export folder. */
  async function withMadrid22(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const presale = await flow(tx, "presale", "Presale", 0);
        const diseno = await flow(tx, "diseno", "Diseño", 1);
        const construccion = await flow(tx, "construccion", "Construcción", 2);
        await phase(tx, presale.id, "cobro", "Cobro", 4);
        const ejecutivo = await phase(tx, diseno.id, "ejecutivo", "Ejecutivo", 2);
        await phase(tx, construccion.id, "residencia", "Residencia", 0);

        await tx.insert(schema.staff).values([
          { id: ADMIN, name: "Admin Remap", email: ADMIN_EMAIL, role: "Administrador" },
          { id: WORKER, name: "Colaborador Remap", email: "colaborador.remap@example.com", role: null },
        ]);

        const groups: { id: GroupId; title: string }[] = [
          { id: "g_pre", title: presale.name },
          { id: "g_dis", title: diseno.name },
          { id: "g_eje", title: `Proyecto ${ejecutivo.name}` },
          { id: "g_adm", title: "Administrativo" },
          { id: "g_obra", title: "Obra" },
        ];
        const items: { id: string; name: string; groupId: GroupId }[] = [];
        let n = 0;
        for (const g of groups) {
          for (let i = 0; i < GROUP_SIZES[g.id]; i++) {
            n++;
            items.push({ id: `88${String(n).padStart(5, "0")}`, name: `Tarea ${String(n).padStart(3, "0")}`, groupId: g.id });
          }
        }

        // The stored export.
        const dir = mkdtempSync(join(tmpdir(), "monday-remap-"));
        dirs.push(dir);
        writeFileSync(
          join(dir, "manifest.json"),
          JSON.stringify({
            account: { id: ACCOUNT, slug: "cincel", name: "Cincel" },
            exported_at: "2026-10-20T12:00:00.000Z",
            api_version: "2026-07",
            token_user: { id: "1", name: "Ana", email: "ana@cincel.mx" },
            boards: [{ id: BOARD }],
            call_count: 1,
            errors: [],
          }),
        );
        writeFileSync(join(dir, "users.json"), "[]");
        const bd = join(dir, "boards", BOARD);
        mkdirSync(bd, { recursive: true });
        writeFileSync(
          join(bd, "board.json"),
          JSON.stringify({
            id: BOARD,
            name: "Madrid 22",
            workspace_id: null,
            hierarchy_type: null,
            columns: [{ id: "name", title: "Name", type: "name", settings: {} }],
            groups: groups.map((g, i) => ({ ...g, position: String(i + 1) })),
            subitem_columns: [],
          }),
        );
        writeFileSync(
          join(bd, "items.ndjson"),
          items
            .map((i) => JSON.stringify({ id: i.id, name: i.name, state: "active", group: { id: i.groupId }, column_values: [], subitems: [] }))
            .join("\n"),
        );
        writeFileSync(join(bd, ".done"), "");

        // The batch, as apply wrote it before the project flow: v1 mapping, board workflow Diseño.
        const [batch] = await tx
          .insert(schema.importBatches)
          .values({
            accountId: ACCOUNT,
            exportedAt: new Date("2026-10-20T12:00:00.000Z"),
            exportPath: dir,
            mapping: {
              version: 1,
              boards: [
                {
                  mondayBoardId: BOARD,
                  name: "Madrid 22",
                  strategy: "board_as_project",
                  workflowId: diseno.id,
                  groupTargets: {},
                  columns: { name: "title" },
                  statusMaps: {},
                },
              ],
              people: {},
              options: { includeUpdates: false, includeFiles: false },
            },
            status: "applied",
            appliedById: ADMIN,
          })
          .returning();
        const [project] = await tx
          .insert(schema.projects)
          .values({ name: PROJECT_NAME, currentWorkflowId: diseno.id })
          .returning();
        await tx.insert(schema.projectStages).values({ projectId: project.id, workflowId: diseno.id, startedById: ADMIN });
        await tx.insert(schema.importRefs).values({
          source: "monday",
          entity: "project",
          externalId: BOARD,
          rowId: project.id,
          batchId: batch.id,
          data: {
            source: { boardId: BOARD, boardName: "Madrid 22", groupId: null, groupTitle: null },
            columns: {},
            stageWorkflowId: diseno.id,
          },
          rowUpdatedAt: project.updatedAt,
        });

        const groupOf = new Map<string, GroupId>();
        const rows = await tx
          .insert(schema.tasks)
          .values(
            items.map((i, idx) => ({
              projectId: project.id,
              kind: "usuario" as const,
              workflowId: diseno.id,
              title: i.name,
              createdById: ADMIN,
              managerId: i.groupId === "g_adm" ? WORKER : null,
              sortOrder: idx + 1,
            })),
          )
          .returning();
        await tx.insert(schema.importRefs).values(
          rows.map((r, idx) => {
            const item = items[idx];
            groupOf.set(r.id, item.groupId);
            const title = groups.find((g) => g.id === item.groupId)!.title;
            return {
              source: "monday",
              entity: "task",
              externalId: item.id,
              rowId: r.id,
              batchId: batch.id,
              data: { source: { boardId: BOARD, boardName: "Madrid 22", groupId: item.groupId, groupTitle: title }, columns: {} },
              rowUpdatedAt: r.updatedAt,
            };
          }),
        );
        // One admin-group task has a non-admin support row from the import.
        const adminTask = rows[items.findIndex((i) => i.groupId === "g_adm")];
        const [support] = await tx.insert(schema.taskSupport).values({ taskId: adminTask.id, staffId: WORKER }).returning();
        await tx.insert(schema.importRefs).values({
          source: "monday",
          entity: "task_support",
          externalId: `${items[rows.indexOf(adminTask)].id}:99`,
          rowId: adminTask.id,
          batchId: batch.id,
          data: { staffId: WORKER },
          rowUpdatedAt: support.updatedAt,
        });

        const mdb = tx as unknown as MondayDb;
        await fn({
          tx,
          mdb,
          projectId: project.id,
          batchId: batch.id,
          dir,
          presale: presale.id,
          diseno: diseno.id,
          construccion: construccion.id,
          ejecutivo: ejecutivo.id,
          groupOf,
          handle: { db: mdb, sql: client, close: async () => {} } as unknown as MondayDbHandle,
        });
        throw new Rollback();
        // Repeatable read: the history counts read whole tables while other DB test files commit rows.
      }, { isolationLevel: "repeatable read" })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  /** The default targets plus "Obra=tramo:construccion" (BE §11.2); the CLI test parses the same flag. */
  async function madridInput(f: Fixture) {
    const state = await loadRemapState(f.mdb, f.projectId);
    const input = currentRemapInput(state);
    input[0].groupTargets.g_obra = { kind: "tramo", workflowId: f.construccion };
    return { state, input };
  }

  async function liveTasks(f: Fixture) {
    return f.tx
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, f.projectId), isNull(schema.tasks.deletedAt)));
  }

  async function historyCount(f: Fixture) {
    const [row] = (await f.tx.execute(sql`select count(*)::int as n from core.history_events`)) as unknown as { n: number }[];
    return row.n;
  }

  it("loads the boards with the default targets", async () => {
    await withMadrid22(async (f) => {
      const state = await loadRemapState(f.mdb, f.projectId);
      expect(state.project).toEqual({ id: f.projectId, name: PROJECT_NAME });
      expect(state.boards).toHaveLength(1);
      const [board] = state.boards;
      expect(board.source?.groups.map((g) => g.id)).toEqual(["g_pre", "g_dis", "g_eje", "g_adm", "g_obra"]);
      expect(board.workflowId).toBe(f.diseno);
      expect(board.groupTargets).toEqual({
        g_pre: { kind: "tramo", workflowId: f.presale },
        g_dis: { kind: "tramo", workflowId: f.diseno },
        g_eje: { kind: "phase", phaseId: f.ejecutivo },
        g_adm: { kind: "admin" },
        g_obra: { kind: "tramo", workflowId: f.diseno },
      });
    });
  });

  it("re-sorts Madrid 22 onto Presale → Diseño → Construcción with 210 tasks before and after", async () => {
    await withMadrid22(async (f) => {
      expect(await liveTasks(f)).toHaveLength(210);
      const { input } = await madridInput(f);

      const { preview, changes } = await planRemap(f.mdb, f.projectId, input);
      expect(preview.tasks).toBe(210);
      expect(preview.changes).toMatchObject({ admin: 10, otherProject: 0, unchanged: 90, tramo: 30 + 40 + 10 });
      expect(changes).toHaveLength(120);
      expect(preview.samples).toHaveLength(10);
      expect(preview.issues.find((i) => i.code === ("ADMIN_ASSIGNEE_CLEARED" as typeof i.code))).toBeTruthy();
      expect(preview.issues.some((i) => i.blocking)).toBe(false);

      expect(await applyRemap(f.mdb, f.projectId, input, ADMIN)).toEqual({ updated: 120 });

      const after = await liveTasks(f);
      expect(after).toHaveLength(210);
      const [{ n: all }] = (await f.tx.execute(
        sql`select count(*)::int as n from core.tasks where project_id = ${f.projectId}`,
      )) as unknown as { n: number }[];
      expect(all).toBe(210);
      const by = (g: GroupId) => after.filter((t) => f.groupOf.get(t.id) === g);
      expect(by("g_pre").every((t) => t.workflowId === f.presale && t.kind === "usuario")).toBe(true);
      expect(by("g_dis").every((t) => t.workflowId === f.diseno && t.phaseId === null)).toBe(true);
      expect(by("g_eje").every((t) => t.workflowId === f.diseno && t.phaseId === f.ejecutivo)).toBe(true);
      expect(by("g_obra").every((t) => t.workflowId === f.construccion)).toBe(true);
      expect(
        by("g_adm").every((t) => t.kind === "admin" && t.workflowId === null && t.phaseId === null && t.managerId === null),
      ).toBe(true);
      const support = await f.tx.select().from(schema.taskSupport).where(eq(schema.taskSupport.staffId, WORKER));
      expect(support).toHaveLength(0);

      const stages = await f.tx.select().from(schema.projectStages).where(eq(schema.projectStages.projectId, f.projectId));
      expect(new Set(stages.map((s) => s.workflowId))).toEqual(new Set([f.presale, f.diseno, f.construccion]));
      const [project] = await f.tx.select().from(schema.projects).where(eq(schema.projects.id, f.projectId));
      expect(project.currentWorkflowId).toBe(f.construccion);

      const comments = await f.tx
        .select()
        .from(schema.historyEvents)
        .where(and(eq(schema.historyEvents.entityId, f.projectId), eq(schema.historyEvents.kind, "comentario")));
      expect(comments.map((c) => c.comment)).toEqual(["Reacomodar importación: 120 tareas."]);
    });
  });

  it("re-applying the same targets changes nothing", async () => {
    await withMadrid22(async (f) => {
      const { input } = await madridInput(f);
      await applyRemap(f.mdb, f.projectId, input, ADMIN);
      const before = await liveTasks(f);
      const history = await historyCount(f);

      // From the saved targets, as the sheet and the CLI load them next time.
      const again = currentRemapInput(await loadRemapState(f.mdb, f.projectId));
      expect(again).toEqual(input);
      const { preview, changes } = await planRemap(f.mdb, f.projectId, again);
      expect(changes).toEqual([]);
      expect(preview.changes.unchanged).toBe(210);
      expect(await applyRemap(f.mdb, f.projectId, again, ADMIN)).toEqual({ updated: 0 });

      const after = await liveTasks(f);
      const key = (t: (typeof after)[number]) =>
        [t.id, t.projectId, t.kind, t.workflowId, t.phaseId, t.spaceId, t.templateId, t.updatedAt.toISOString()].join("|");
      expect(after.map(key).sort()).toEqual(before.map(key).sort());
      expect(await historyCount(f)).toBe(history);
    });
  });

  it("the batch still rolls back after a remap", async () => {
    await withMadrid22(async (f) => {
      const { input } = await madridInput(f);
      await applyRemap(f.mdb, f.projectId, input, ADMIN);

      const tx = f.tx as unknown as ImportDb;
      expect(await findRollbackBlockers(tx, f.batchId)).toEqual([]);
      await deleteBatchRows(tx, f.batchId);
      const [{ n: projects }] = (await f.tx.execute(
        sql`select count(*)::int as n from core.projects where id = ${f.projectId}`,
      )) as unknown as { n: number }[];
      expect(projects).toBe(0);
      const [{ n: tasks }] = (await f.tx.execute(
        sql`select count(*)::int as n from core.tasks where project_id = ${f.projectId}`,
      )) as unknown as { n: number }[];
      expect(tasks).toBe(0);
      const [{ n: history }] = (await f.tx.execute(
        sql`select count(*)::int as n from core.history_events where entity_id = ${f.projectId}`,
      )) as unknown as { n: number }[];
      expect(history).toBe(0);
    });
  });

  it("an edit after the remap still blocks the rollback", async () => {
    await withMadrid22(async (f) => {
      const { input } = await madridInput(f);
      await applyRemap(f.mdb, f.projectId, input, ADMIN);
      const [task] = await liveTasks(f);
      await f.tx.update(schema.tasks).set({ title: "Editada" }).where(eq(schema.tasks.id, task.id));
      const blockers = await findRollbackBlockers(f.tx as unknown as ImportDb, f.batchId);
      expect(blockers.map((b) => [b.kind, b.id])).toEqual([["edited", task.id]]);
    });
  });

  it("CLI: the dry run prints counts and writes nothing; --apply without --by is refused", async () => {
    await withMadrid22(async (f) => {
      const before = await historyCount(f);
      const c = io();
      const remap = createRemapCommand({ openDb: () => f.handle });
      const code = await remap(["--projects", PROJECT_NAME, "--target", "Obra=tramo:construccion"], c.cli);
      expect(c.err()).toBe("");
      expect(code).toBe(0);
      expect(c.out()).toContain(`## ${PROJECT_NAME}`);
      expect(c.out()).toContain("Tasks: 210 before, 210 after");
      expect(c.out()).toContain("admin 10");
      expect(c.out()).toContain("Dry run: nothing written.");
      expect(await historyCount(f)).toBe(before);

      const refused = io();
      expect(await remap(["--projects", PROJECT_NAME, "--apply"], refused.cli)).toBe(1);
      expect(refused.err()).toContain("--apply requires --by");

      const applied = io();
      expect(
        await remap(["--projects", PROJECT_NAME, "--target", "Obra=tramo:construccion", "--apply", "--by", ADMIN_EMAIL], applied.cli),
      ).toBe(0);
      expect(applied.out()).toContain(`${PROJECT_NAME}: 120 tasks updated.`);
    });
  });

  it("EXPORT_MISSING when the stored export is gone; NOT_IMPORTED for a project made in Cincel", async () => {
    await withMadrid22(async (f) => {
      rmSync(f.dir, { recursive: true, force: true });
      await expect(loadRemapState(f.mdb, f.projectId)).rejects.toThrow("EXPORT_MISSING");
      await expect(planRemap(f.mdb, f.projectId, [])).rejects.toThrow("EXPORT_MISSING");
      const c = io();
      expect(await createRemapCommand({ openDb: () => f.handle })(["--projects", PROJECT_NAME], c.cli)).toBe(1);
      expect(c.err()).toContain("EXPORT_MISSING");
      expect(c.err()).toContain(EXPORT_MISSING_TEXT);

      const [own] = await f.tx.insert(schema.projects).values({ name: "Proyecto propio remap" }).returning();
      await expect(loadRemapState(f.mdb, own.id)).rejects.toThrow("NOT_IMPORTED");
    });
  });

  it("a board missing from the export is reported with source null and left as is", async () => {
    await withMadrid22(async (f) => {
      rmSync(join(f.dir, "boards", BOARD), { recursive: true, force: true });
      const state = await loadRemapState(f.mdb, f.projectId);
      expect(state.boards.map((b) => b.source)).toEqual([null]);
      expect(currentRemapInput(state)).toEqual([]);
      const { preview } = await planRemap(f.mdb, f.projectId, [
        { boardId: BOARD, workflowId: f.construccion, groupTargets: {} },
      ]);
      expect(preview.changes.unchanged).toBe(210);
    });
  });

  it("espacio and ignore targets", async () => {
    await withMadrid22(async (f) => {
      const { input } = await madridInput(f);
      input[0].groupTargets.g_obra = { kind: "space" };
      input[0].groupTargets.g_pre = { kind: "ignore" };
      expect(await applyRemap(f.mdb, f.projectId, input, ADMIN)).toEqual({ updated: 40 + 40 + 10 });
      const spaces = await f.tx.select().from(schema.projectSpaces).where(eq(schema.projectSpaces.projectId, f.projectId));
      expect(spaces.map((s) => s.name)).toEqual(["Obra"]);
      const after = await liveTasks(f);
      const obra = after.filter((t) => f.groupOf.get(t.id) === "g_obra");
      expect(obra.every((t) => t.spaceId === spaces[0].id && t.workflowId === f.diseno)).toBe(true);
      const pre = after.filter((t) => f.groupOf.get(t.id) === "g_pre");
      expect(pre.every((t) => t.workflowId === f.diseno)).toBe(true);
    });
  });
});
