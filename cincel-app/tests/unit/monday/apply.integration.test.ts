// @vitest-environment node
/**
 * Integration tests for `apply` (docs/specs/monday-migration/backend.md §11,
 * §12 #3, #4, #5, #10, #11): the real `plan` and `apply` commands, phase B
 * included, against a test Postgres with a fake Shared Drive.
 *
 * Needs TEST_DATABASE_URL pointing at a migrated database (CI runs these in
 * the unit test job against a Postgres service). Each case runs in a
 * transaction that is rolled back. Expected counts come from the plan.md the
 * `plan` command writes for the same export, never from literals.
 */
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { FOLDER_MIME_TYPE } from "@/lib/google/drive-admin";
import {
  IMPORT_ENTITIES,
  type ImportDb,
  type ImportEntity,
} from "@/lib/import/refs";
import { createApplyCommand, NOTHING_NEW } from "@/scripts/monday/apply";
import { createPhaseB } from "@/scripts/monday/apply-phase-b";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import { createPlanCommand, PLAN_FILE } from "@/scripts/monday/plan";
import { ENTITY_TABLES } from "@/scripts/monday/rollback";

import {
  fakeDrive,
  io,
  nestedMapping,
  writeExportFolder,
} from "./apply-fixtures";

const STAFF = "56656656-0000-4000-8000-000000000001";
const CLIENT = "56656656-0000-4000-8000-0000000000c1";
const STAFF_EMAIL = "integracion.apply@example.com";
const ACCOUNT = "apply-integration-566";
const SHARED_DRIVE = "sd-566";
const ENV = { GOOGLE_SHARED_DRIVE_ID: SHARED_DRIVE };

/** The plan.md counts: the "Rows to create" total row plus the "Also:" line. */
interface PlanMdTotals {
  contacts: number;
  projects: number;
  tasks: number;
  childTasks: number;
  checklistItems: number;
  dependencies: number;
  comments: number;
  cronogramaRows: number;
  files: number;
  skipped: number;
  contactPeople: number;
  providerProfiles: number;
  taskSupport: number;
  projectSchedules: number;
}

const PLAN_MD_COLUMNS: Record<string, keyof PlanMdTotals> = {
  Contacts: "contacts",
  Projects: "projects",
  Tasks: "tasks",
  "Child tasks": "childTasks",
  "Checklist items": "checklistItems",
  Dependencies: "dependencies",
  Comments: "comments",
  "Cronograma rows": "cronogramaRows",
  Files: "files",
  "Already imported": "skipped",
};

/** Reads the totals back out of `<dir>/plan.md`. */
function readPlanMd(dir: string): { totals: PlanMdTotals; clean: boolean } {
  const md = readFileSync(join(dir, PLAN_FILE), "utf8");
  const lines = md.split("\n");
  const cells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
  const header = cells(lines.find((l) => l.startsWith("| Board |"))!);
  const total = cells(lines.find((l) => l.startsWith("| **Total** |"))!);
  const totals = {} as PlanMdTotals;
  header.slice(3).forEach((label, i) => {
    const key = PLAN_MD_COLUMNS[label];
    expect(key, `plan.md column ${label}`).toBeDefined();
    totals[key] = Number(/^\*\*(\d+)\*\*$/.exec(total[3 + i])![1]);
  });
  const also =
    /^Also: (\d+) contact people, (\d+) provider profiles, (\d+) task support rows, (\d+) cronogramas\.$/m.exec(
      md,
    );
  expect(also, "plan.md Also: line").not.toBeNull();
  [
    totals.contactPeople,
    totals.providerProfiles,
    totals.taskSupport,
    totals.projectSchedules,
  ] = also!.slice(1).map(Number);
  expect(Object.keys(totals)).toHaveLength(14);
  return { totals, clean: md.includes("**Clean:**") };
}

/** The import refs a full apply (phases A and B) creates, per entity, per plan.md. */
/** Links (`task_link` / `project_link`) are checked as a sum, see the test. */
function expectedRefs(
  t: PlanMdTotals,
): Record<Exclude<ImportEntity, "task_link" | "project_link">, number> {
  return {
    contact: t.contacts,
    contact_person: t.contactPeople,
    provider_profile: t.providerProfiles,
    project: t.projects,
    project_schedule: t.projectSchedules,
    task: t.tasks + t.childTasks,
    checklist_item: t.checklistItems,
    task_support: t.taskSupport,
    task_dependency: t.dependencies,
    history_event: t.comments,
    schedule_task: t.cronogramaRows,
    drive_file: t.files,
  };
}

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

// Several full plan + apply runs per case; the default 5 s is short when the
// whole suite shares one machine.
describe.skipIf(!url)(
  "apply integration (test DB, fake Drive)",
  { timeout: 60_000 },
  () => {
    const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
    const db = drizzle(client, { schema });
    const dirs: string[] = [];

    afterAll(() => client.end({ timeout: 5 }));
    afterEach(() => {
      for (const d of dirs.splice(0))
        rmSync(d, { recursive: true, force: true });
    });

    /**
     * Runs `fn` in a transaction that is rolled back. Repeatable read keeps
     * rows other test files commit meanwhile out of the table counts.
     */
    async function inTx(fn: (tx: ImportDb) => Promise<void>) {
      await db
        .transaction(
          async (tx) => {
            await fn(tx);
            throw new Rollback();
          },
          { isolationLevel: "repeatable read" },
        )
        .catch((err) => {
          if (!(err instanceof Rollback)) throw err;
        });
    }

    async function seed(tx: ImportDb) {
      await tx
        .insert(schema.staff)
        .values({ id: STAFF, name: "Integración Apply", email: STAFF_EMAIL });
      await tx
        .insert(schema.contacts)
        .values({ id: CLIENT, type: "cliente", name: "Integración Cliente" });
    }

    function exportFolder(
      mapping: MappingInput = nestedMapping(STAFF, CLIENT),
    ): string {
      const dir = writeExportFolder(ACCOUNT, mapping);
      dirs.push(dir);
      return dir;
    }

    const handle = (tx: ImportDb) => () =>
      ({ db: tx, close: async () => {} }) as unknown as MondayDbHandle;

    /** The real plan and apply commands over `tx` and one fake Drive. */
    function commands(tx: ImportDb, drive = fakeDrive()) {
      const deps = {
        openDb: handle(tx),
        openDrive: () => drive.drive,
        env: ENV,
      };
      const plan = createPlanCommand({
        ...deps,
        now: () => new Date("2026-10-30T12:00:00.000Z"),
      });
      const apply = createApplyCommand({
        ...deps,
        phaseB: createPhaseB({ openDrive: () => drive.drive, env: ENV }),
      });
      return {
        drive,
        plan: async (dir: string) => {
          const c = io();
          const code = await plan(["--export", dir], c.cli);
          return { code, out: c.out(), err: c.err(), ...readPlanMd(dir) };
        },
        apply: async (dir: string) => {
          const c = io();
          const code = await apply(
            ["--export", dir, "--by", STAFF_EMAIL],
            c.cli,
          );
          return { code, out: c.out(), err: c.err() };
        },
      };
    }

    /** Row counts of every core table. */
    async function tableCounts(tx: ImportDb): Promise<Record<string, number>> {
      const tables = (await tx.execute(
        sql`select table_name from information_schema.tables
            where table_schema = 'core' and table_type = 'BASE TABLE'
            order by table_name`,
      )) as unknown as { table_name: string }[];
      const counts: Record<string, number> = {};
      for (const { table_name } of tables) {
        const [row] = (await tx.execute(
          sql.raw(`select count(*)::int as n from core."${table_name}"`),
        )) as unknown as { n: number }[];
        counts[table_name] = row.n;
      }
      return counts;
    }

    function diff(
      before: Record<string, number>,
      after: Record<string, number>,
    ): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [t, n] of Object.entries(after))
        if (n !== before[t]) out[t] = n - before[t];
      return out;
    }

    const batchesOf = (tx: ImportDb) =>
      tx
        .select()
        .from(schema.importBatches)
        .where(eq(schema.importBatches.accountId, ACCOUNT));

    async function refsByEntity(tx: ImportDb, batchId: string) {
      const refs = await tx
        .select()
        .from(schema.importRefs)
        .where(eq(schema.importRefs.batchId, batchId));
      const counts = Object.fromEntries(
        IMPORT_ENTITIES.map((e) => [e, 0]),
      ) as Record<ImportEntity, number>;
      for (const r of refs) counts[r.entity as ImportEntity]++;
      return { refs, counts };
    }

    /** No file was uploaded twice and no folder exists twice under one parent. */
    function expectNoDuplicates(drive: ReturnType<typeof fakeDrive>) {
      const uploads = drive.log
        .filter((c) => c.op === "uploadResumable")
        .map((c) => `${c.parentId}/${c.name}`);
      expect(uploads.length, `uploads: ${uploads.join(", ")}`).toBe(
        new Set(uploads).size,
      );
      const stored = [...drive.files.values()].map(
        (f) => `${f.parents?.[0]}/${f.name}/${f.mimeType === FOLDER_MIME_TYPE}`,
      );
      expect(stored.length).toBe(new Set(stored).size);
    }

    it("apply creates exactly the plan.md counts, each row with an import ref", async () => {
      await inTx(async (tx) => {
        await seed(tx);
        const dir = exportFolder();
        const cmd = commands(tx);

        const planned = await cmd.plan(dir);
        expect(planned.code, planned.err).toBe(0);
        expect(planned.clean).toBe(true);
        const t = planned.totals;
        expect(t.skipped).toBe(0);
        expect(t.projects).toBeGreaterThan(0);
        expect(t.files).toBeGreaterThan(0);

        const before = await tableCounts(tx);
        const applied = await cmd.apply(dir);
        expect(applied.code, applied.err).toBe(0);
        expect(applied.out).toContain("applied.");

        const [batch] = await batchesOf(tx);
        expect(batch.status).toBe("applied");
        const { refs, counts } = await refsByEntity(tx, batch.id);
        // Each file is linked on its task or, without one, on its project.
        const { task_link, project_link, ...rest } = counts;
        expect(task_link + project_link).toBe(t.files);
        expect(rest).toEqual(expectedRefs(t));

        // Every created row of an imported entity has its import ref: the
        // growth of each entity table equals the refs pointing at it.
        const added = diff(before, await tableCounts(tx));
        const refsPerTable: Record<string, number> = {};
        for (const e of IMPORT_ENTITIES) {
          const { table } = ENTITY_TABLES[e];
          refsPerTable[table] = (refsPerTable[table] ?? 0) + counts[e];
        }
        for (const [table, n] of Object.entries(refsPerTable))
          expect(added[table] ?? 0, table).toBe(n);
        // Besides those, only the batch bookkeeping grows.
        const others = Object.fromEntries(
          Object.entries(added).filter(([table]) => !(table in refsPerTable)),
        );
        expect(others).toEqual({
          import_batches: 1,
          import_refs: refs.length,
          import_files: t.files,
        });

        // Each ref points at a live row.
        for (const ref of refs) {
          const { table, key } = ENTITY_TABLES[ref.entity as ImportEntity];
          const found = (await tx.execute(
            sql.raw(
              `select 1 from core.${table} where ${key} = '${ref.rowId}' limit 1`,
            ),
          )) as unknown as unknown[];
          expect(found.length, `${ref.entity} ${ref.externalId}`).toBe(1);
        }

        expect(cmd.drive.calls.uploads).toBe(t.files);
        expectNoDuplicates(cmd.drive);
      });
    });

    it("apply twice creates nothing the second time", async () => {
      await inTx(async (tx) => {
        await seed(tx);
        const dir = exportFolder();
        const cmd = commands(tx);
        const first = await cmd.plan(dir);
        expect((await cmd.apply(dir)).code).toBe(0);

        // plan sees everything as already imported.
        const replanned = await cmd.plan(dir);
        expect(replanned.code, replanned.err).toBe(0);
        const { skipped, ...creatable } = replanned.totals;
        expect(Object.values(creatable).every((n) => n === 0)).toBe(true);
        expect(skipped).toBeGreaterThan(0);
        expect(first.totals.skipped).toBe(0);

        const before = await tableCounts(tx);
        const writesBefore = cmd.drive.writes().length;
        const again = await cmd.apply(dir);
        expect(again.code, again.err).toBe(0);
        expect(again.out).toContain(NOTHING_NEW);

        // Only the empty, applied batch is new; Drive is untouched.
        expect(diff(before, await tableCounts(tx))).toEqual({
          import_batches: 1,
        });
        expect(cmd.drive.writes()).toHaveLength(writesBefore);
        const batches = await batchesOf(tx);
        expect(batches).toHaveLength(2);
        expect(batches.every((b) => b.status === "applied")).toBe(true);
      });
    });

    it("apply with a blocking issue writes nothing, in the DB or in Drive", async () => {
      await inTx(async (tx) => {
        await seed(tx);
        const mapping = nestedMapping(STAFF, CLIENT);
        delete mapping.boards[0].statusMaps.status["2"];
        const dir = exportFolder(mapping);
        const cmd = commands(tx);

        const planned = await cmd.plan(dir);
        expect(planned.code).toBe(1);
        expect(planned.clean).toBe(false);
        expect(planned.err).toContain("STATUS_UNMAPPED board 901 item 2002");

        const before = await tableCounts(tx);
        const applied = await cmd.apply(dir);
        expect(applied.code).toBe(1);
        expect(applied.err).toContain("refused");
        expect(applied.err).toContain("nothing was written");
        expect(applied.err).toContain("STATUS_UNMAPPED board 901 item 2002");
        expect(await tableCounts(tx)).toEqual(before);
        expect(cmd.drive.writes()).toEqual([]);
      });
    });

    it("phase B killed after any upload resumes without duplicate uploads", async () => {
      // The number of files to upload, from plan.md.
      let files = 0;
      await inTx(async (tx) => {
        await seed(tx);
        const dir = exportFolder();
        files = (await commands(tx).plan(dir)).totals.files;
      });
      expect(files).toBeGreaterThan(1);

      for (let k = 1; k <= files; k++) {
        await inTx(async (tx) => {
          await seed(tx);
          const dir = exportFolder();
          const cmd = commands(tx);
          const planned = await cmd.plan(dir);
          expect(planned.totals.files).toBe(files);

          // The k-th upload reaches Drive, then the process dies before
          // recording it; nothing after it reaches Drive.
          cmd.drive.killAfterUpload(k);
          const killed = await cmd.apply(dir);
          expect(killed.code, `kill at ${k}`).toBe(1);
          expect(killed.err).toContain("stays applying");
          const [batch] = await batchesOf(tx);
          expect(batch.status).toBe("applying");
          expect(cmd.drive.calls.uploads).toBe(k);

          // A new process runs the same apply: phase A is skipped and phase B
          // finishes, reusing the orphan upload.
          cmd.drive.restart();
          const resumed = await cmd.apply(dir);
          expect(resumed.code, resumed.err).toBe(0);
          expect(resumed.out).toContain("skipping phase A");
          expect(resumed.out).toContain("1 reused");
          expect(resumed.out).toContain(`Batch ${batch.id} applied.`);

          expect(cmd.drive.calls.uploads, `kill at ${k}`).toBe(files);
          expectNoDuplicates(cmd.drive);
          const uploaded = [...cmd.drive.files.values()].filter(
            (f) => f.mimeType !== FOLDER_MIME_TYPE,
          );
          expect(uploaded).toHaveLength(files);

          const rows = await tx
            .select()
            .from(schema.importFiles)
            .where(eq(schema.importFiles.batchId, batch.id));
          expect(rows).toHaveLength(files);
          expect(new Set(rows.map((r) => r.driveFileId))).toEqual(
            new Set(uploaded.map((f) => f.id)),
          );
          expect(rows.every((r) => r.error == null)).toBe(true);
          const { counts } = await refsByEntity(tx, batch.id);
          expect(counts.drive_file).toBe(files);
          expect(counts.task_link + counts.project_link).toBe(files);
          expect((await batchesOf(tx))[0].status).toBe("applied");
        });
      }
    });
  },
);
