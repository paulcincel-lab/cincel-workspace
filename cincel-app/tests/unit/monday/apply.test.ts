// @vitest-environment node
/**
 * scripts/monday/apply.ts phase A (BE §7, §12 #3, #4, #5).
 *
 * Argument parsing runs everywhere. The command tests need TEST_DATABASE_URL
 * pointing at a migrated database; each runs in a transaction that is rolled
 * back, with the nested translate fixture written out as an export folder
 * and a fake Drive.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { DriveAdmin } from "@/lib/google/drive-admin";
import type { ImportDb, ImportEntity } from "@/lib/import/refs";
import nestedFixture from "@/scripts/monday/__fixtures__/translate-nested-export.json";
import {
  createApplyCommand,
  NOTHING_NEW,
  parseApplyArgs,
  type PhaseB,
} from "@/scripts/monday/apply";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import {
  buildPlan,
  createPlanDbLookups,
  readPlanExport,
} from "@/scripts/monday/plan";
import { ENTITY_TABLES } from "@/scripts/monday/rollback";
import type { CliIo } from "@/scripts/monday/run";
import type { ExportData } from "@/scripts/monday/translate";

const ANA = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT = "apply-test-555";

describe("apply arguments", () => {
  it("parses --export and --by", () => {
    expect(
      parseApplyArgs(["--export", "exports/acme", "--by", "ana@cincel.mx"]),
    ).toEqual({
      exportDir: "exports/acme",
      by: "ana@cincel.mx",
    });
    expect(
      parseApplyArgs(["--export=exports/acme", "--by=ana@cincel.mx"]),
    ).toEqual({
      exportDir: "exports/acme",
      by: "ana@cincel.mx",
    });
    expect(parseApplyArgs(["--by", "a@b.c"])).toBe(
      "--export exports/<client> is required",
    );
    expect(parseApplyArgs(["--export", "x"])).toBe(
      "--by <staff email> is required",
    );
    expect(parseApplyArgs(["--export", "x", "--by", "a", "--force"])).toBe(
      'unknown option "--force"',
    );
  });

  it("rejects bad arguments without opening the DB", async () => {
    const openDb = vi.fn();
    const c = io();
    expect(await createApplyCommand({ openDb })(["--export", "x"], c.cli)).toBe(
      1,
    );
    expect(c.err()).toContain("--by <staff email> is required");
    expect(openDb).not.toHaveBeenCalled();
  });
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  return { cli, out: () => out.join(""), err: () => err.join("") };
}

/** The mapping of translate-nested-export.json (checklist, child tasks, item_as_project, crm). */
function nestedMapping(): MappingInput {
  const STATUS = {
    "0": { status: "pendiente" },
    "1": { status: "completado" },
    "2": { status: "en_proceso" },
  } as const;
  const SUB = {
    "0": { status: "pendiente" },
    "1": { status: "completado" },
  } as const;
  return {
    version: 1,
    boards: [
      {
        mondayBoardId: "901",
        name: "Casa Nido",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: {
          name: "title",
          status: "status",
          people: "people",
          timeline: "timeline",
          costo: "import_data",
          planta: "ignore",
        },
        subitemColumns: { name: "title", sstatus: "status" },
        statusMaps: { status: STATUS, sstatus: SUB },
        subitems: "checklist",
        schedule: { enabled: true, planta: { columnId: "planta" } },
      },
      {
        mondayBoardId: "902",
        name: "Casa Faro",
        strategy: "board_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: { name: "title", status: "status" },
        subitemColumns: { name: "title", sstatus: "status" },
        statusMaps: { status: STATUS, sstatus: SUB },
        subitems: "child_tasks",
      },
      {
        mondayBoardId: "903",
        name: "Obras",
        strategy: "item_as_project",
        client: { kind: "contact", contactId: CLIENT },
        columns: { name: "title", presupuesto: "import_data" },
        subitemColumns: { name: "title" },
        statusMaps: {},
      },
      {
        mondayBoardId: "904",
        name: "Clientes",
        strategy: "crm_contacts",
        contactType: "cliente",
        columns: { name: "title", rfc: "import_data" },
        statusMaps: {},
      },
    ],
    people: {
      "11": { action: "staff", staffId: ANA },
      "14": { action: "ignore" },
    },
    options: { includeUpdates: true, includeFiles: true },
  };
}

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("apply phase A (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const dirs: string[] = [];

  afterAll(() => client.end({ timeout: 5 }));
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function inTx(fn: (tx: ImportDb) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  async function seed(tx: ImportDb) {
    await tx.insert(schema.staff).values([
      { id: ANA, name: "Ana Apply", email: "Ana.Apply@example.com" },
      {
        name: "Inactiva Apply",
        email: "inactiva-apply@example.com",
        active: false,
      },
    ]);
    await tx
      .insert(schema.contacts)
      .values({ id: CLIENT, type: "cliente", name: "Apply Cliente" });
  }

  /** Writes translate-nested-export.json out as an export folder (BE §4.1). */
  function exportFolder(mapping: MappingInput = nestedMapping()): string {
    const dir = mkdtempSync(join(tmpdir(), "monday-apply-"));
    dirs.push(dir);
    const data = structuredClone(nestedFixture) as unknown as ExportData;
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        account: { id: ACCOUNT, slug: "acme", name: "Acme" },
        exported_at: "2026-10-20T12:00:00.000Z",
        api_version: "2026-07",
        token_user: { id: "1", name: "Ana", email: "ana@acme.mx" },
        boards: data.boards.map((b) => ({ id: b.board.id })),
        call_count: 1,
        errors: [],
      }),
    );
    writeFileSync(join(dir, "users.json"), JSON.stringify(data.users));
    for (const b of data.boards) {
      const bd = join(dir, "boards", b.board.id);
      mkdirSync(bd, { recursive: true });
      writeFileSync(join(bd, "board.json"), JSON.stringify(b.board));
      writeFileSync(
        join(bd, "items.ndjson"),
        b.items.map((i) => JSON.stringify(i)).join("\n"),
      );
      writeFileSync(
        join(bd, "updates.ndjson"),
        (b.updates ?? []).map((u) => JSON.stringify(u)).join("\n"),
      );
      writeFileSync(join(bd, ".done"), "");
    }
    for (const entry of Object.values(data.files ?? {})) {
      mkdirSync(join(dir, entry.path, ".."), { recursive: true });
      writeFileSync(join(dir, entry.path), "x");
    }
    writeFileSync(join(dir, "files", "index.json"), JSON.stringify(data.files));
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(mapping));
    return dir;
  }

  function command(tx: ImportDb, phaseB: PhaseB = vi.fn(async () => 0)) {
    return createApplyCommand({
      openDb: () =>
        ({ db: tx, close: async () => {} }) as unknown as MondayDbHandle,
      openDrive: () =>
        ({ list: async () => ({ files: [] }) }) as unknown as DriveAdmin,
      env: { GOOGLE_SHARED_DRIVE_ID: "sd1" },
      phaseB,
    });
  }

  const batchesOf = (tx: ImportDb) =>
    tx
      .select()
      .from(schema.importBatches)
      .where(eq(schema.importBatches.accountId, ACCOUNT));

  it("rejects an unknown or inactive --by email and writes nothing", async () => {
    await inTx(async (tx) => {
      await seed(tx);
      const dir = exportFolder();
      for (const by of ["nadie@example.com", "inactiva-apply@example.com"]) {
        const c = io();
        expect(await command(tx)(["--export", dir, "--by", by], c.cli)).toBe(1);
        expect(c.err()).toContain(
          `--by ${by} is not the email of an active staff member`,
        );
      }
      expect(await batchesOf(tx)).toEqual([]);
    });
  });

  it("refuses a plan with a blocking issue and writes nothing", async () => {
    await inTx(async (tx) => {
      await seed(tx);
      const mapping = nestedMapping();
      delete mapping.boards[0].statusMaps.status["2"];
      const dir = exportFolder(mapping);
      const before = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.tasks);
      const phaseB = vi.fn(async () => 0);
      const c = io();
      expect(
        await command(tx, phaseB)(
          ["--export", dir, "--by", "ana.apply@example.com"],
          c.cli,
        ),
      ).toBe(1);
      expect(c.err()).toContain("refused");
      expect(c.err()).toContain("STATUS_UNMAPPED board 901 item 2002");
      expect(phaseB).not.toHaveBeenCalled();
      expect(await batchesOf(tx)).toEqual([]);
      expect(
        await tx.select({ n: sql<number>`count(*)::int` }).from(schema.tasks),
      ).toEqual(before);
      expect(await tx.select().from(schema.importRefs)).toEqual([]);
    });
  });

  it("creates the plan's counts with an import ref per row; resumes an applying batch; re-apply is empty", async () => {
    await inTx(async (tx) => {
      await seed(tx);
      const dir = exportFolder();
      const { data } = await readPlanExport(dir);
      const plan = await buildPlan(
        data,
        nestedMapping(),
        createPlanDbLookups(tx),
        {
          importedById: ANA,
        },
      );
      expect(plan.issues.filter((i) => i.blocking)).toEqual([]);

      const phaseB = vi.fn<PhaseB>(async () => 0);
      const c = io();
      expect(
        await command(tx, phaseB)(
          ["--export", dir, "--by", "ana.apply@example.com"],
          c.cli,
        ),
      ).toBe(0);
      const [batch] = await batchesOf(tx);
      expect(batch).toMatchObject({
        status: "applying",
        accountSlug: "acme",
        exportedByEmail: "ana@acme.mx",
        appliedById: ANA,
        exportPath: dir,
      });
      expect(c.out()).toContain(`Batch ${batch.id}.`);
      expect(phaseB).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: batch.id, exportDir: dir }),
      );

      // Counts = plan.md totals, per import ref entity.
      const refs = await tx
        .select()
        .from(schema.importRefs)
        .where(eq(schema.importRefs.batchId, batch.id));
      const byEntity = (e: ImportEntity) =>
        refs.filter((r) => r.entity === e).length;
      const t = plan.totals;
      expect({
        contacts: byEntity("contact"),
        contactPeople: byEntity("contact_person"),
        providerProfiles: byEntity("provider_profile"),
        projects: byEntity("project"),
        projectSchedules: byEntity("project_schedule"),
        tasks: byEntity("task"),
        checklistItems: byEntity("checklist_item"),
        taskSupport: byEntity("task_support"),
        dependencies: byEntity("task_dependency"),
        comments: byEntity("history_event"),
        cronogramaRows: byEntity("schedule_task"),
      }).toEqual({
        contacts: t.contacts,
        contactPeople: t.contactPeople,
        providerProfiles: t.providerProfiles,
        projects: t.projects,
        projectSchedules: t.projectSchedules,
        tasks: t.tasks + t.childTasks,
        checklistItems: t.checklistItems,
        taskSupport: t.taskSupport,
        dependencies: t.dependencies,
        comments: t.comments,
        cronogramaRows: t.cronogramaRows,
      });
      expect(t.projects).toBeGreaterThan(0);
      expect(t.childTasks).toBeGreaterThan(0);
      const files = await tx
        .select()
        .from(schema.importFiles)
        .where(eq(schema.importFiles.batchId, batch.id));
      expect(files).toHaveLength(t.files);
      expect(files.every((f) => f.driveFileId == null)).toBe(true);

      // Every ref points at a live row, with that row's updated_at.
      for (const ref of refs) {
        const { table, key, hasUpdatedAt } =
          ENTITY_TABLES[ref.entity as ImportEntity];
        const found = (await tx.execute(
          sql.raw(
            `select ${hasUpdatedAt ? "updated_at" : "null as updated_at"} from core.${table} where ${key} = '${ref.rowId}' limit 1`,
          ),
        )) as unknown as { updated_at: string | null }[];
        expect(found.length, `${ref.entity} ${ref.externalId}`).toBe(1);
        if (hasUpdatedAt) {
          expect(ref.rowUpdatedAt?.getTime()).toBe(
            new Date(found[0].updated_at!).getTime(),
          );
        } else {
          expect(ref.rowUpdatedAt).toBeNull();
        }
      }

      // Every created task, project and comment row is in import_refs.
      const taskIds = new Set(
        refs.filter((r) => r.entity === "task").map((r) => r.rowId),
      );
      const projectIds = refs
        .filter((r) => r.entity === "project")
        .map((r) => r.rowId);
      const created = await tx
        .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
        .from(schema.tasks);
      expect(
        created
          .filter((r) => projectIds.includes(r.projectId))
          .every((r) => taskIds.has(r.id)),
      ).toBe(true);
      const cambios = await tx
        .select()
        .from(schema.historyEvents)
        .where(eq(schema.historyEvents.kind, "cambio"));
      expect(cambios).toEqual([]);

      // An applying batch of the account is resumed: phase A is skipped.
      const resumed = vi.fn<PhaseB>(async () => 0);
      const again = io();
      expect(
        await command(tx, resumed)(
          ["--export", dir, "--by", "ana.apply@example.com"],
          again.cli,
        ),
      ).toBe(0);
      expect(again.out()).toContain("skipping phase A");
      expect(resumed).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: batch.id }),
      );
      expect(await batchesOf(tx)).toHaveLength(1);

      // Once applied, a second apply of the same export creates an empty applied batch.
      await tx
        .update(schema.importBatches)
        .set({ status: "applied" })
        .where(eq(schema.importBatches.id, batch.id));
      const third = vi.fn<PhaseB>(async () => 0);
      const empty = io();
      expect(
        await command(tx, third)(
          ["--export", dir, "--by", "ana.apply@example.com"],
          empty.cli,
        ),
      ).toBe(0);
      expect(empty.out()).toContain(NOTHING_NEW);
      expect(third).not.toHaveBeenCalled();
      const all = await batchesOf(tx);
      expect(all).toHaveLength(2);
      const second = all.find((b) => b.id !== batch.id)!;
      expect(second.status).toBe("applied");
      expect(
        await tx
          .select()
          .from(schema.importRefs)
          .where(eq(schema.importRefs.batchId, second.id)),
      ).toEqual([]);
      expect(
        await tx
          .select()
          .from(schema.importFiles)
          .where(eq(schema.importFiles.batchId, second.id)),
      ).toEqual([]);
    });
  });
});
