// @vitest-environment node
/**
 * scripts/monday/apply.ts phase A (BE §7, §12 #3, #4, #5) and phase B
 * (scripts/monday/apply-phase-b.ts, BE §7, §12 #10, #11).
 *
 * Argument parsing runs everywhere. The command tests need TEST_DATABASE_URL
 * pointing at a migrated database; each runs in a transaction that is rolled
 * back, with the nested translate fixture written out as an export folder
 * and a fake Drive.
 */
import { rmSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { FOLDER_MIME_TYPE, type DriveAdmin } from "@/lib/google/drive-admin";
import {
  CLIENT_FOLDER_NAME,
  INTERNAL_FOLDER_NAME,
} from "@/lib/google/project-folders";
import type { ImportDb, ImportEntity } from "@/lib/import/refs";
import {
  createApplyCommand,
  NOTHING_NEW,
  parseApplyArgs,
  type PhaseB,
} from "@/scripts/monday/apply";
import {
  createPhaseB,
  IMPORT_FOLDER_NAME,
  mimeTypeFor,
} from "@/scripts/monday/apply-phase-b";
import type { MondayDbHandle } from "@/scripts/monday/db";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import {
  buildPlan,
  createPlanDbLookups,
  readPlanExport,
} from "@/scripts/monday/plan";
import { ENTITY_TABLES } from "@/scripts/monday/rollback";

import {
  fakeDrive,
  io,
  nestedMapping as sharedNestedMapping,
  writeExportFolder,
} from "./apply-fixtures";

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

describe("phase B upload MIME type", () => {
  it("maps known extensions and falls back to octet-stream", () => {
    expect(mimeTypeFor("muros.PDF")).toBe("application/pdf");
    expect(mimeTypeFor("foto.jpg")).toBe("image/jpeg");
    expect(mimeTypeFor("plano.xyz")).toBe("application/octet-stream");
    expect(mimeTypeFor("sin-extension")).toBe("application/octet-stream");
  });
});

/** The mapping of translate-nested-export.json with this file's staff and client. */
const nestedMapping = (): MappingInput => sharedNestedMapping(ANA, CLIENT);

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
    const dir = writeExportFolder(ACCOUNT, mapping);
    dirs.push(dir);
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

  it("phase B: uploads into Importado de monday/<group>, links them, resumes without duplicates and ends applied", async () => {
    await inTx(async (tx) => {
      await seed(tx);
      const dir = exportFolder();
      const by = ["--export", dir, "--by", "ana.apply@example.com"];
      expect(await command(tx)(by, io().cli)).toBe(0);
      const [batch] = await batchesOf(tx);
      const files = await tx
        .select()
        .from(schema.importFiles)
        .where(eq(schema.importFiles.batchId, batch.id));
      expect(files.length).toBeGreaterThan(1);
      const projectRefs = await tx
        .select()
        .from(schema.importRefs)
        .where(
          sql`${schema.importRefs.batchId} = ${batch.id} and ${schema.importRefs.entity} = 'project'`,
        );

      // One project already has its root folder: it must be kept.
      const fake = fakeDrive();
      const sd = "sd1";
      const keptProject = files[0].projectId;
      const existing = await fake.drive.createFolder("Carpeta previa", sd);
      await tx
        .update(schema.projects)
        .set({ driveFolderId: existing.id })
        .where(eq(schema.projects.id, keptProject));

      const phaseB = createPhaseB({
        openDrive: () => fake.drive,
        env: { GOOGLE_SHARED_DRIVE_ID: sd },
      });

      // The first run dies on the second upload, after Drive stored it.
      fake.failUpload(2);
      const first = io();
      expect(await command(tx, phaseB)(by, first.cli)).toBe(1);
      expect(first.err()).toContain("conexión perdida");
      expect(first.err()).toContain("stays applying");
      expect((await batchesOf(tx))[0].status).toBe("applying");

      // The re-run reuses the orphan upload and finishes.
      fake.failUpload(null);
      const second = io();
      expect(await command(tx, phaseB)(by, second.cli)).toBe(0);
      expect(second.out()).toContain("skipping phase A");
      expect(second.out()).toContain("1 reused");
      expect(second.out()).toContain(`Batch ${batch.id} applied.`);
      expect(fake.calls.uploads).toBe(files.length);

      const [done] = await batchesOf(tx);
      expect(done.status).toBe("applied");
      expect(done.stats).toMatchObject({
        created: expect.any(Object),
        drive: { files: files.length, pending: 0, failedProjects: 0 },
      });

      const after = await tx
        .select()
        .from(schema.importFiles)
        .where(eq(schema.importFiles.batchId, batch.id));
      const uploaded = [...fake.files.values()].filter(
        (f) => f.mimeType !== FOLDER_MIME_TYPE,
      );
      expect(uploaded).toHaveLength(files.length);
      expect(new Set(after.map((f) => f.driveFileId)).size).toBe(files.length);
      expect(after.every((f) => f.error == null)).toBe(true);

      for (const f of after) {
        const [p] = await tx
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.id, f.projectId));
        const internal = fake.files.get(p.driveInternalFolderId!)!;
        expect(internal.name).toBe(INTERNAL_FOLDER_NAME);
        const importFolder = fake.files.get(p.driveImportFolderId!)!;
        expect(importFolder).toMatchObject({
          name: IMPORT_FOLDER_NAME,
          parents: [internal.id],
        });
        const driveFile = fake.files.get(f.driveFileId!)!;
        const parent = fake.files.get(driveFile.parents![0])!;
        if (f.groupName) {
          expect(parent).toMatchObject({
            name: f.groupName,
            parents: [importFolder.id],
          });
        } else {
          expect(parent.id).toBe(importFolder.id);
        }
        // Nothing lands in 02 Cliente.
        expect(fake.files.get(p.driveClientFolderId!)!.name).toBe(
          CLIENT_FOLDER_NAME,
        );
        expect(fake.childrenOf(p.driveClientFolderId!)).toEqual([]);

        // Linked on its task or project as interno, with import refs.
        const [df] = await tx
          .select()
          .from(schema.driveFiles)
          .where(eq(schema.driveFiles.googleFileId, f.driveFileId!));
        expect(df.webViewLink).toBe(driveFile.webViewLink);
        const linkEntity = f.taskId ? "task_link" : "project_link";
        const refs = await tx
          .select()
          .from(schema.importRefs)
          .where(
            sql`${schema.importRefs.externalId} = ${f.assetId} and ${schema.importRefs.entity} in ('drive_file', ${linkEntity})`,
          );
        expect(refs.map((r) => r.entity).sort()).toEqual(
          ["drive_file", linkEntity].sort(),
        );
        expect(refs.find((r) => r.entity === "drive_file")!.rowId).toBe(df.id);
        const linkRef = refs.find((r) => r.entity === linkEntity)!;
        if (f.taskId) {
          const [link] = await tx
            .select()
            .from(schema.taskLinks)
            .where(eq(schema.taskLinks.id, linkRef.rowId));
          expect(link).toMatchObject({
            taskId: f.taskId,
            kind: "interno",
            title: f.fileName,
            url: driveFile.webViewLink,
            createdById: ANA,
          });
          expect(linkRef.rowUpdatedAt?.getTime()).toBe(
            link.updatedAt.getTime(),
          );
        } else {
          const [link] = await tx
            .select()
            .from(schema.projectLinks)
            .where(eq(schema.projectLinks.id, linkRef.rowId));
          expect(link).toMatchObject({
            projectId: f.projectId,
            kind: "interno",
            title: f.fileName,
            driveFileId: df.id,
          });
        }
      }

      // The project with a root folder kept it; one new root per other project.
      const [kept] = await tx
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, keptProject));
      expect(kept.driveFolderId).toBe(existing.id);
      expect(fake.childrenOf(sd)).toHaveLength(projectRefs.length);

      // Project refs follow the drive_* writes, so rollback sees no edit.
      for (const ref of projectRefs) {
        const [p] = await tx
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.id, ref.rowId));
        expect(p.driveFolderStatus).toBe("ready");
        expect(p.driveImportFolderId).toBeTruthy();
        const [fresh] = await tx
          .select()
          .from(schema.importRefs)
          .where(
            sql`${schema.importRefs.entity} = 'project' and ${schema.importRefs.externalId} = ${ref.externalId}`,
          );
        expect(fresh.rowUpdatedAt?.getTime()).toBe(p.updatedAt.getTime());
      }
    });
  });

  it("phase B without GOOGLE_SHARED_DRIVE_ID leaves the batch applying", async () => {
    await inTx(async (tx) => {
      await seed(tx);
      const dir = exportFolder();
      const phaseB = createPhaseB({
        openDrive: () => fakeDrive().drive,
        env: {},
      });
      const c = io();
      expect(
        await command(tx, phaseB)(
          ["--export", dir, "--by", "ana.apply@example.com"],
          c.cli,
        ),
      ).toBe(1);
      expect(c.err()).toContain("GOOGLE_SHARED_DRIVE_ID is not set");
      expect((await batchesOf(tx))[0].status).toBe("applying");
    });
  });
});
