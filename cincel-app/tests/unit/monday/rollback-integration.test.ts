// @vitest-environment node
/**
 * Rollback after a real apply (BE §11 Integration, §9, §12 #12).
 *
 * Runs `apply` (phase A and phase B, against a fake Shared Drive) on the
 * nested translate fixture written out as an export folder, then
 * `rollback`. Covers the full removal, the four refusal cases of the spec
 * (staff comment, edit, new project for an imported client, manual
 * dependency) and the `--drive-only` retry.
 *
 * Needs TEST_DATABASE_URL pointing at a migrated database; each test runs in
 * a transaction that is rolled back.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  FOLDER_MIME_TYPE,
  type DriveAdmin,
  type DriveFile,
  type ListOptions,
  type UploadInput,
} from "@/lib/google/drive-admin";
import type { ImportDb, ImportEntity } from "@/lib/import/refs";
import nestedFixture from "@/scripts/monday/__fixtures__/translate-nested-export.json";
import { createApplyCommand } from "@/scripts/monday/apply";
import {
  createPhaseB,
  IMPORT_FOLDER_NAME,
} from "@/scripts/monday/apply-phase-b";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import {
  createRollbackCommand,
  ENTITY_TABLES,
} from "@/scripts/monday/rollback";
import type { CliIo } from "@/scripts/monday/run";
import type { ExportData } from "@/scripts/monday/translate";

const ANA = "22222222-2222-4222-8222-222222222222";
const ANA_EMAIL = "ana.rollback@example.com";
const CLIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "rollback-test-569";
const SHARED_DRIVE = "sd-rollback";

/**
 * In-memory Shared Drive for both commands: apply creates folders and
 * uploads, rollback reads `createdTime` and trashes. `failTrash` ids throw.
 */
function fakeDrive() {
  const files = new Map<string, DriveFile>();
  const failTrash = new Set<string>();
  const trashCalls: string[] = [];
  let next = 1;
  const add = (file: DriveFile) => {
    files.set(file.id, { createdTime: new Date().toISOString(), ...file });
    return files.get(file.id)!;
  };
  const list = async (options: ListOptions = {}) => {
    const q = options.q ?? "";
    const name = /name = '((?:[^'\\]|\\.)*)'/
      .exec(q)?.[1]
      ?.replace(/\\(.)/g, "$1");
    const folderOnly = q.includes(`mimeType = '${FOLDER_MIME_TYPE}'`);
    const filesOnly = q.includes(`mimeType != '${FOLDER_MIME_TYPE}'`);
    return {
      files: [...files.values()].filter(
        (f) =>
          (!options.parentId || f.parents?.includes(options.parentId)) &&
          (!name || f.name === name) &&
          (!folderOnly || f.mimeType === FOLDER_MIME_TYPE) &&
          (!filesOnly || f.mimeType !== FOLDER_MIME_TYPE) &&
          !f.trashed,
      ),
    };
  };
  const drive = {
    async createFolder(name: string, parentId: string) {
      return add({
        id: `folder-${next++}`,
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
      });
    },
    list,
    listAll: async (options: ListOptions = {}) => (await list(options)).files,
    async uploadResumable(input: UploadInput) {
      const id = `file-${next++}`;
      return add({
        id,
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
        size: String(input.size),
        webViewLink: `https://drive.example/${id}`,
      });
    },
    async get(id: string) {
      const file = files.get(id);
      if (!file) throw new Error(`no such file ${id}`);
      return file;
    },
    async trash(id: string) {
      trashCalls.push(id);
      if (failTrash.has(id)) throw new Error(`cuota excedida en ${id}`);
      const file = files.get(id);
      if (!file) throw new Error(`no such file ${id}`);
      file.trashed = true;
      return file;
    },
  };
  return {
    drive: drive as unknown as DriveAdmin,
    files,
    failTrash,
    trashCalls,
    /** A folder that existed before the import. */
    preexisting(name: string, parentId: string) {
      return add({
        id: `folder-${next++}`,
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [parentId],
        createdTime: "2020-01-01T00:00:00.000Z",
      });
    },
  };
}

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

type Row = Record<string, unknown>;

describe.skipIf(!url)("rollback after apply (test DB, fake Drive)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const dirs: string[] = [];

  afterAll(() => client.end({ timeout: 5 }));
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Writes translate-nested-export.json out as an export folder (BE §4.1). */
  function exportFolder(): string {
    const dir = mkdtempSync(join(tmpdir(), "monday-rollback-"));
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
    writeFileSync(join(dir, "mapping.json"), JSON.stringify(nestedMapping()));
    return dir;
  }

  const handleFor = (tx: ImportDb) =>
    ({
      db: tx,
      sql: client,
      close: async () => {},
    }) as unknown as MondayDbHandle;

  async function select(tx: ImportDb, query: ReturnType<typeof sql>) {
    return (await tx.execute(query)) as unknown as Row[];
  }

  interface Applied {
    tx: ImportDb;
    fake: ReturnType<typeof fakeDrive>;
    batchId: string;
    /** The project whose root folder existed before the import. */
    keptFolderId: string;
    refs: (typeof schema.importRefs.$inferSelect)[];
    rollback: (args?: string[]) => Promise<{
      code: number;
      out: string;
      err: string;
    }>;
  }

  /** Seeds staff and the client, runs apply (A + B) and hands over the applied batch. */
  async function withAppliedBatch(fn: (a: Applied) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await tx
          .insert(schema.staff)
          .values({ id: ANA, name: "Ana Rollback", email: ANA_EMAIL });
        await tx
          .insert(schema.contacts)
          .values({ id: CLIENT, type: "cliente", name: "Rollback Cliente" });

        const fake = fakeDrive();
        const env = { GOOGLE_SHARED_DRIVE_ID: SHARED_DRIVE };
        const apply = createApplyCommand({
          openDb: () => handleFor(tx),
          openDrive: () => fake.drive,
          env,
          phaseB: createPhaseB({ openDrive: () => fake.drive, env }),
        });
        const dir = exportFolder();
        const by = ["--export", dir, "--by", ANA_EMAIL];

        // Phase A alone first, to give one project a root folder that
        // predates the import before phase B runs.
        const phaseAOnly = createApplyCommand({
          openDb: () => handleFor(tx),
          openDrive: () => fake.drive,
          env,
          phaseB: async () => 0,
        });
        expect(await phaseAOnly(by, io().cli)).toBe(0);
        const [batch] = await tx
          .select()
          .from(schema.importBatches)
          .where(eq(schema.importBatches.accountId, ACCOUNT));
        const [withFiles] = await tx
          .select({ projectId: schema.importFiles.projectId })
          .from(schema.importFiles)
          .where(eq(schema.importFiles.batchId, batch.id))
          .limit(1);
        const kept = fake.preexisting("Carpeta previa", SHARED_DRIVE);
        await tx
          .update(schema.projects)
          .set({ driveFolderId: kept.id })
          .where(eq(schema.projects.id, withFiles.projectId));

        const applied = io();
        expect(await apply(by, applied.cli)).toBe(0);
        expect(applied.out()).toContain(`Batch ${batch.id} applied.`);

        const refs = await tx
          .select()
          .from(schema.importRefs)
          .where(eq(schema.importRefs.batchId, batch.id));
        expect(refs.length).toBeGreaterThan(0);

        const rollback = async (extra: string[] = []) => {
          const c = io();
          const code = await createRollbackCommand({
            openDb: () => handleFor(tx),
            openDrive: () => fake.drive,
          })(["--batch", batch.id, ...extra], c.cli);
          return { code, out: c.out(), err: c.err() };
        };

        await fn({
          tx,
          fake,
          batchId: batch.id,
          keptFolderId: kept.id,
          refs,
          rollback,
        });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  /** Whether the row behind an import ref still exists. */
  async function refRowExists(
    tx: ImportDb,
    ref: Applied["refs"][number],
  ): Promise<boolean> {
    const { table, key } = ENTITY_TABLES[ref.entity as ImportEntity];
    const extra =
      ref.entity === "task_support"
        ? sql` and staff_id::text = ${(ref.data as { staffId: string }).staffId}`
        : sql``;
    const found = await select(
      tx,
      sql`select 1 from ${sql.raw(`core.${table}`)} where ${sql.raw(key)} = ${ref.rowId}${extra} limit 1`,
    );
    return found.length > 0;
  }

  /** Everything a refused rollback must leave as it was. */
  async function snapshot(a: Applied) {
    const tables = [
      ...new Set(Object.values(ENTITY_TABLES).map((t) => t.table)),
    ].sort();
    const counts: Record<string, unknown> = {};
    for (const table of tables) {
      const [row] = await select(
        a.tx,
        sql`select count(*)::int as n from ${sql.raw(`core.${table}`)}`,
      );
      counts[table] = row.n;
    }
    const [batch] = await select(
      a.tx,
      sql`select status::text as status, rolled_back_at, stats,
        (select count(*) from core.import_refs where batch_id = ${a.batchId})::int as refs,
        (select count(*) from core.import_files where batch_id = ${a.batchId})::int as files
        from core.import_batches where id = ${a.batchId}`,
    );
    const live = await Promise.all(a.refs.map((r) => refRowExists(a.tx, r)));
    return {
      counts,
      batch,
      liveRefRows: live.filter(Boolean).length,
      trashed: [...a.fake.files.values()].filter((f) => f.trashed).length,
    };
  }

  /** Runs rollback expecting a refusal that names exactly `table` / `id`. */
  async function expectRefusal(a: Applied, table: string, id: string) {
    const before = await snapshot(a);
    expect(before.liveRefRows).toBe(a.refs.length);
    const r = await a.rollback();
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toContain(
      `refused. 1 blocker on batch ${a.batchId}; nothing was changed`,
    );
    expect(r.err).toMatch(new RegExp(`\\n${table}\\s+${id}\\s+\\S`));
    expect(await snapshot(a)).toEqual(before);
    expect(a.fake.trashCalls).toEqual([]);
    return r.err;
  }

  const refsOf = (a: Applied, entity: ImportEntity) =>
    a.refs.filter((r) => r.entity === entity);

  it("after phase B removes every batch row and trashes the Drive artefacts", async () => {
    await withAppliedBatch(async (a) => {
      const r = await a.rollback();
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(r.out).toContain(`Batch ${a.batchId} rolled back`);
      expect(r.out).toContain("1 kept (existed before the batch)");
      expect(r.out).toContain("0 failed");

      // Zero batch rows: no refs, no files, and no row any ref pointed at.
      for (const ref of a.refs) {
        expect(
          await refRowExists(a.tx, ref),
          `${ref.entity} ${ref.externalId}`,
        ).toBe(false);
      }
      const [left] = await select(
        a.tx,
        sql`select
          (select count(*) from core.import_refs where batch_id = ${a.batchId})::int as refs,
          (select count(*) from core.import_files where batch_id = ${a.batchId})::int as files`,
      );
      expect(left).toEqual({ refs: 0, files: 0 });

      // Rows that existed before the import stay.
      const [kept] = await select(
        a.tx,
        sql`select
          (select count(*) from core.staff where id = ${ANA})::int as staff,
          (select count(*) from core.contacts where id = ${CLIENT})::int as client`,
      );
      expect(kept).toEqual({ staff: 1, client: 1 });

      const [batch] = await select(
        a.tx,
        sql`select status::text as status, rolled_back_at from core.import_batches where id = ${a.batchId}`,
      );
      expect(batch.status).toBe("rolled_back");
      expect(batch.rolled_back_at).not.toBeNull();

      // Uploads, import folders and the project folders the batch created
      // are trashed; the project folder that predates the import is kept.
      const all = [...a.fake.files.values()];
      const uploads = all.filter((f) => f.mimeType !== FOLDER_MIME_TYPE);
      const importFolders = all.filter((f) => f.name === IMPORT_FOLDER_NAME);
      const roots = all.filter((f) => f.parents?.includes(SHARED_DRIVE));
      expect(uploads.length).toBeGreaterThan(1);
      expect(importFolders.length).toBeGreaterThan(0);
      expect(roots.length).toBeGreaterThan(1);
      for (const f of [...uploads, ...importFolders]) {
        expect(f.trashed, `${f.name} ${f.id}`).toBe(true);
      }
      for (const f of roots) {
        expect(f.trashed ?? false, `${f.name} ${f.id}`).toBe(
          f.id !== a.keptFolderId,
        );
      }
      expect(a.fake.trashCalls).not.toContain(a.keptFolderId);
    });
  });

  it("refuses after a staff comment on an imported task, naming it", async () => {
    await withAppliedBatch(async (a) => {
      const task = refsOf(a, "task")[0];
      const [comment] = await a.tx
        .insert(schema.historyEvents)
        .values({
          entity: "task",
          entityId: task.rowId,
          kind: "comentario",
          comment: "Revisar con el cliente",
          actorId: ANA,
        })
        .returning();
      const err = await expectRefusal(a, "history_events", comment.id);
      expect(err).toContain(`comentario on batch task ${task.rowId}`);
    });
  });

  it("refuses after an edit of a batch row, naming it", async () => {
    await withAppliedBatch(async (a) => {
      const task = refsOf(a, "task")[0];
      await a.tx
        .update(schema.tasks)
        .set({ title: "Título editado" })
        .where(eq(schema.tasks.id, task.rowId));
      const err = await expectRefusal(a, "tasks", task.rowId);
      expect(err).toContain(
        `batch task (monday ${task.externalId}) edited after the import`,
      );
    });
  });

  it("refuses after a new project for an imported client, naming it", async () => {
    await withAppliedBatch(async (a) => {
      const contact = refsOf(a, "contact")[0];
      expect(contact).toBeDefined();
      const [project] = await a.tx
        .insert(schema.projects)
        .values({ name: "Casa Nueva", clientId: contact.rowId })
        .returning();
      const err = await expectRefusal(a, "projects", project.id);
      expect(err).toContain(`client_id → batch contact ${contact.rowId}`);
    });
  });

  it("refuses after a manual dependency on an imported task, naming it", async () => {
    await withAppliedBatch(async (a) => {
      const task = refsOf(a, "task")[0];
      // A task outside the batch, in a project of a client that isn't imported.
      const [project] = await a.tx
        .insert(schema.projects)
        .values({ name: "Casa Manual", clientId: CLIENT })
        .returning();
      const [manual] = await a.tx
        .insert(schema.tasks)
        .values({
          projectId: project.id,
          kind: "usuario",
          title: "Tarea manual",
          createdById: ANA,
        })
        .returning();
      const [dep] = await a.tx
        .insert(schema.taskDependencies)
        .values({ taskId: manual.id, dependsOnTaskId: task.rowId })
        .returning();
      const err = await expectRefusal(a, "task_dependencies", dep.id);
      expect(err).toContain(`depends_on_task_id → batch task ${task.rowId}`);
    });
  });

  it("lists Drive failures and --drive-only retries them", async () => {
    await withAppliedBatch(async (a) => {
      const all = [...a.fake.files.values()];
      const upload = all.find((f) => f.mimeType !== FOLDER_MIME_TYPE)!;
      const root = all.find(
        (f) => f.parents?.includes(SHARED_DRIVE) && f.id !== a.keptFolderId,
      )!;
      a.fake.failTrash.add(upload.id);
      a.fake.failTrash.add(root.id);

      const first = await a.rollback();
      expect(first.code).toBe(1);
      expect(first.out).toContain(`Batch ${a.batchId} rolled back`);
      expect(first.out).toContain("2 failed");
      expect(first.err).toContain("2 Drive items not trashed");
      expect(first.err).toMatch(
        new RegExp(`${upload.id}\\s+file\\s+cuota excedida`),
      );
      expect(first.err).toMatch(
        new RegExp(`${root.id}\\s+project folder\\s+cuota excedida`),
      );
      expect(first.err).toContain(`rollback --batch ${a.batchId} --drive-only`);
      expect(upload.trashed ?? false).toBe(false);
      expect(root.trashed ?? false).toBe(false);
      // The database step is done regardless.
      for (const ref of a.refs) {
        expect(await refRowExists(a.tx, ref)).toBe(false);
      }

      // A plain rollback again is refused: the batch is already rolled back.
      const again = await a.rollback();
      expect(again.code).toBe(1);
      expect(again.err).toContain("already rolled back");

      a.fake.failTrash.clear();
      const callsBefore = a.fake.trashCalls.length;
      const retry = await a.rollback(["--drive-only"]);
      expect(retry.err).toBe("");
      expect(retry.code).toBe(0);
      expect(retry.out).toMatch(/Drive: 2 trashed, 0 kept .* 0 failed/);
      // Only the two failed items are retried.
      expect(a.fake.trashCalls.slice(callsBefore).sort()).toEqual(
        [upload.id, root.id].sort(),
      );
      expect(upload.trashed).toBe(true);
      expect(root.trashed).toBe(true);

      // A second retry has nothing left to do.
      const done = await a.rollback(["--drive-only"]);
      expect(done.code).toBe(0);
      expect(done.out).toMatch(/Drive: 0 trashed, 0 kept/);
      expect(a.fake.trashCalls.length).toBe(callsBefore + 2);
    });
  });
});
