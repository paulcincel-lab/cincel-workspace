// @vitest-environment node
/**
 * scripts/monday/rollback.ts step 1 (BE §9): blocker detection.
 *
 * The foreign-key cross-check and argument parsing run everywhere. The
 * detection tests need TEST_DATABASE_URL pointing at a migrated database;
 * each one works inside a transaction that is rolled back.
 */
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  IMPORT_ENTITIES,
  insertImportRefs,
  type ImportDb,
  type ImportEntity,
  type ImportRefInput,
} from "@/lib/import/refs";
import type { MondayDbHandle } from "@/scripts/monday/db";
import {
  createRollbackCommand,
  ENTITY_TABLES,
  findRollbackBlockers,
  formatBlockers,
  parseRollbackArgs,
  POINTER_CHECKS,
  type RollbackBlocker,
} from "@/scripts/monday/rollback";
import type { CliIo } from "@/scripts/monday/run";

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable =>
  is(v, PgTable),
);

describe("rollback blocker coverage", () => {
  it("maps every import entity to a table in the schema", () => {
    const names = new Set(tables.map((t) => getTableConfig(t).name));
    expect(Object.keys(ENTITY_TABLES).sort()).toEqual(
      [...IMPORT_ENTITIES].sort(),
    );
    for (const { table } of Object.values(ENTITY_TABLES))
      expect(names).toContain(table);
  });

  it("checks every foreign key into a batch table, and only those", () => {
    const batchTables = new Map<string, ImportEntity>(
      Object.entries(ENTITY_TABLES).map(([entity, m]) => [
        m.table,
        entity as ImportEntity,
      ]),
    );
    const keyOf = new Map(
      Object.values(ENTITY_TABLES).map((m) => [m.table, m.key]),
    );
    const fks: string[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const target = getTableConfig(ref.foreignTable).name;
        const entity = batchTables.get(target);
        if (!entity) continue;
        // The column paired with the target's key (composite FKs carry the type too).
        const i = ref.foreignColumns.findIndex(
          (c) => c.name === keyOf.get(target),
        );
        expect(i, `${config.name} → ${target}`).toBeGreaterThanOrEqual(0);
        fks.push(`${config.name}.${ref.columns[i].name} → ${entity}`);
      }
    }
    const checks = POINTER_CHECKS.map(
      (c) => `${c.table}.${c.column} → ${c.target}`,
    );
    expect([...new Set(checks)].sort()).toEqual([...new Set(fks)].sort());
    expect(checks.length).toBe(new Set(checks).size);
  });

  it("covers the tables the spec names", () => {
    const covered = new Set(
      POINTER_CHECKS.map((c) => `${c.table}.${c.column}`),
    );
    for (const name of [
      "tasks.project_id",
      "tasks.parent_task_id",
      "task_checklist_items.task_id",
      "task_support.task_id",
      "task_links.task_id",
      "task_dependencies.task_id",
      "task_dependencies.depends_on_task_id",
      "project_links.project_id",
      "project_contacts.project_id",
      "project_members.project_id",
      "project_stages.project_id",
      "schedule_tasks.schedule_id",
      "projects.client_id",
      "schedule_tasks.responsable_contact_id",
      "provider_profiles.contact_id",
      "contact_people.contact_id",
    ]) {
      expect(covered, name).toContain(name);
    }
  });
});

describe("rollback arguments", () => {
  const id = "5b0b7c1e-1f0a-4c55-9d7e-2f4b8f1c0a11";

  it("parses --batch and --drive-only", () => {
    expect(parseRollbackArgs(["--batch", id])).toEqual({
      batchId: id,
      driveOnly: false,
    });
    expect(parseRollbackArgs([`--batch=${id}`, "--drive-only"])).toEqual({
      batchId: id,
      driveOnly: true,
    });
  });

  it("rejects a missing or malformed batch id and unknown options", () => {
    expect(parseRollbackArgs([])).toMatch(/--batch/);
    expect(parseRollbackArgs(["--batch", "12"])).toMatch(/uuid/);
    expect(parseRollbackArgs(["--batch", id, "--force"])).toMatch(
      /unknown option/,
    );
  });

  it("formats blockers as table, id, what", () => {
    const text = formatBlockers([
      { kind: "edited", table: "tasks", id: "a", what: "edited" },
      {
        kind: "reference",
        table: "project_members",
        id: "b:c",
        what: "project_id → batch project p",
      },
    ]);
    const lines = text.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^table\s+id\s+what$/);
    expect(lines[2]).toBe("project_members  b:c  project_id → batch project p");
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("rollback blocker detection (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Fixture = Awaited<ReturnType<typeof seedBatch>>;

  /** A batch with one row of every import entity, refs carrying each row's updated_at. */
  async function seedBatch(tx: ImportDb) {
    const [admin] = await tx
      .insert(schema.staff)
      .values({ name: "Import admin" })
      .returning();
    const [helper] = await tx
      .insert(schema.staff)
      .values({ name: "Apoyo" })
      .returning();
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({
        accountId: "acc-1",
        exportedAt: new Date("2026-10-01T00:00:00Z"),
        exportPath: "exports/acme",
        mapping: {},
        appliedById: admin.id,
        status: "applied",
      })
      .returning();
    const [client] = await tx
      .insert(schema.contacts)
      .values({ type: "cliente", name: "Acme" })
      .returning();
    const [provider] = await tx
      .insert(schema.contacts)
      .values({ type: "proveedor", name: "Herrería" })
      .returning();
    const [person] = await tx
      .insert(schema.contactPeople)
      .values({ contactId: provider.id, name: "Ana" })
      .returning();
    const [profile] = await tx
      .insert(schema.providerProfiles)
      .values({ contactId: provider.id, subtype: "contratista" })
      .returning();
    const [project] = await tx
      .insert(schema.projects)
      .values({ name: "Casa Uno", clientId: client.id })
      .returning();
    const [task] = await tx
      .insert(schema.tasks)
      .values({
        projectId: project.id,
        kind: "usuario",
        title: "Planos",
        createdById: admin.id,
      })
      .returning();
    const [child] = await tx
      .insert(schema.tasks)
      .values({
        projectId: project.id,
        kind: "usuario",
        title: "Fachada",
        createdById: admin.id,
        parentTaskId: task.id,
      })
      .returning();
    const [item] = await tx
      .insert(schema.taskChecklistItems)
      .values({ taskId: task.id, title: "Revisar" })
      .returning();
    const [support] = await tx
      .insert(schema.taskSupport)
      .values({ taskId: task.id, staffId: helper.id })
      .returning();
    const [dep] = await tx
      .insert(schema.taskDependencies)
      .values({ taskId: child.id, dependsOnTaskId: task.id })
      .returning();
    const [event] = await tx
      .insert(schema.historyEvents)
      .values({
        entity: "task",
        entityId: task.id,
        kind: "comentario",
        comment: "De monday",
      })
      .returning();
    const [scheduleRow] = await tx
      .insert(schema.projectSchedules)
      .values({ projectId: project.id })
      .returning();
    const [scheduleTask] = await tx
      .insert(schema.scheduleTasks)
      .values({
        scheduleId: scheduleRow.id,
        stableKey: "pb-1",
        planta: "PB",
        seccion: "Obra negra",
        seccionOrder: 1,
        inicio: "2026-10-01",
        fin: "2026-10-10",
        tarea: "Cimentación",
        sortOrder: 1,
        responsableContactId: provider.id,
      })
      .returning();
    const [taskLink] = await tx
      .insert(schema.taskLinks)
      .values({
        taskId: task.id,
        kind: "interno",
        title: "plano.pdf",
        url: "https://example.com/a",
      })
      .returning();
    const [driveFile] = await tx
      .insert(schema.driveFiles)
      .values({ googleFileId: `fake-${crypto.randomUUID()}` })
      .returning();
    const [projectLink] = await tx
      .insert(schema.projectLinks)
      .values({
        projectId: project.id,
        kind: "interno",
        title: "render.png",
        url: "https://example.com/b",
        driveFileId: driveFile.id,
      })
      .returning();

    let n = 0;
    const ref = (
      entity: ImportEntity,
      rowId: string,
      rowUpdatedAt: Date | null,
      data: unknown = null,
    ): ImportRefInput => ({
      source: "monday",
      entity,
      externalId: `${entity}-${++n}`,
      rowId,
      batchId: batch.id,
      data,
      rowUpdatedAt,
    });
    await insertImportRefs(tx, [
      ref("contact", client.id, client.updatedAt),
      ref("contact", provider.id, provider.updatedAt),
      ref("contact_person", person.id, person.updatedAt),
      ref("provider_profile", profile.contactId, profile.updatedAt),
      ref("project", project.id, project.updatedAt),
      ref("task", task.id, task.updatedAt),
      ref("task", child.id, child.updatedAt),
      ref("checklist_item", item.id, item.updatedAt),
      ref("task_support", support.taskId, support.updatedAt, {
        staffId: helper.id,
      }),
      ref("task_dependency", dep.id, dep.updatedAt),
      ref("history_event", event.id, null),
      ref("project_schedule", scheduleRow.id, scheduleRow.updatedAt),
      ref("schedule_task", scheduleTask.id, scheduleTask.updatedAt),
      ref("task_link", taskLink.id, taskLink.updatedAt),
      ref("project_link", projectLink.id, projectLink.updatedAt),
      ref("drive_file", driveFile.id, driveFile.updatedAt),
    ]);
    await tx.insert(schema.importFiles).values({
      batchId: batch.id,
      assetId: "asset-1",
      projectId: project.id,
      taskId: task.id,
      fileName: "plano.pdf",
      sha256: "0".repeat(64),
      localPath: "files/asset-1/plano.pdf",
    });
    return {
      admin,
      helper,
      batch,
      client,
      provider,
      project,
      task,
      child,
      item,
      scheduleRow,
      driveFile,
    };
  }

  async function inBatch(fn: (tx: ImportDb, f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx, await seedBatch(tx));
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  const pick = (b: RollbackBlocker[]) =>
    b.map(({ kind, table, id }) => ({ kind, table, id }));

  it("reports no blockers on a clean, untouched batch", async () => {
    await inBatch(async (tx, f) => {
      expect(await findRollbackBlockers(tx, f.batch.id)).toEqual([]);
    });
  });

  it("names a batch row edited after the import", async () => {
    await inBatch(async (tx, f) => {
      await tx.execute(
        sql`update core.tasks set title = 'Planos v2', updated_at = now() + interval '1 minute' where id = ${f.task.id}`,
      );
      const blockers = await findRollbackBlockers(tx, f.batch.id);
      expect(pick(blockers)).toEqual([
        { kind: "edited", table: "tasks", id: f.task.id },
      ]);
      expect(blockers[0].what).toMatch(/edited after the import/);
    });
  });

  it("names a staff comment on an imported task", async () => {
    await inBatch(async (tx, f) => {
      const [comment] = await tx
        .insert(schema.historyEvents)
        .values({
          entity: "task",
          entityId: f.task.id,
          kind: "comentario",
          comment: "Ojo",
          actorId: f.admin.id,
        })
        .returning();
      const [change] = await tx
        .insert(schema.historyEvents)
        .values({
          entity: "contact",
          entityId: f.client.id,
          kind: "cambio",
          field: "phone",
          afterValue: "55",
        })
        .returning();
      expect(pick(await findRollbackBlockers(tx, f.batch.id))).toEqual([
        { kind: "history", table: "history_events", id: comment.id },
        { kind: "history", table: "history_events", id: change.id },
      ]);
    });
  });

  it("names every kind of row outside the batch pointing at a batch row", async () => {
    await inBatch(async (tx, f) => {
      const [workflow] = await tx
        .insert(schema.workflows)
        .values({ key: `wf-${crypto.randomUUID()}`, name: "Diseño" })
        .returning();
      const [newProject] = await tx
        .insert(schema.projects)
        .values({ name: "Casa Dos", clientId: f.client.id })
        .returning();
      const [manualTask] = await tx
        .insert(schema.tasks)
        .values({
          projectId: f.project.id,
          kind: "usuario",
          title: "Manual",
          createdById: f.admin.id,
        })
        .returning();
      // Lives in the new project, points at a batch parent.
      const [childTask] = await tx
        .insert(schema.tasks)
        .values({
          projectId: newProject.id,
          kind: "usuario",
          title: "Hija",
          createdById: f.admin.id,
          parentTaskId: f.task.id,
        })
        .returning();
      const [item] = await tx
        .insert(schema.taskChecklistItems)
        .values({ taskId: f.task.id, title: "Nuevo" })
        .returning();
      await tx
        .insert(schema.taskSupport)
        .values({ taskId: f.task.id, staffId: f.admin.id });
      const [link] = await tx
        .insert(schema.taskLinks)
        .values({
          taskId: f.task.id,
          kind: "cliente",
          title: "x",
          url: "https://example.com/c",
        })
        .returning();
      const [dep] = await tx
        .insert(schema.taskDependencies)
        .values({ taskId: f.child.id, dependsOnTaskId: manualTask.id })
        .returning();
      const [projectLink] = await tx
        .insert(schema.projectLinks)
        .values({
          projectId: f.project.id,
          kind: "cliente",
          title: "y",
          url: "https://example.com/d",
        })
        .returning();
      await tx
        .insert(schema.projectContacts)
        .values({ projectId: f.project.id, contactId: f.provider.id });
      await tx
        .insert(schema.projectMembers)
        .values({ projectId: f.project.id, staffId: f.helper.id });
      await tx
        .insert(schema.projectStages)
        .values({ projectId: f.project.id, workflowId: workflow.id });
      const [scheduleTask] = await tx
        .insert(schema.scheduleTasks)
        .values({
          scheduleId: f.scheduleRow.id,
          stableKey: "pb-2",
          planta: "PB",
          seccion: "Acabados",
          seccionOrder: 2,
          inicio: "2026-11-01",
          fin: "2026-11-10",
          tarea: "Pintura",
          sortOrder: 2,
        })
        .returning();
      const [person] = await tx
        .insert(schema.contactPeople)
        .values({ contactId: f.client.id, name: "Luis" })
        .returning();

      const ids = pick(await findRollbackBlockers(tx, f.batch.id));
      const expected = [
        { table: "tasks", id: manualTask.id },
        { table: "tasks", id: childTask.id },
        { table: "task_checklist_items", id: item.id },
        { table: "task_support", id: `${f.task.id}:${f.admin.id}` },
        { table: "task_links", id: link.id },
        // depends_on side points at a manual task, task_id side at a batch task.
        { table: "task_dependencies", id: dep.id },
        { table: "project_links", id: projectLink.id },
        { table: "project_contacts", id: `${f.project.id}:${f.provider.id}` },
        { table: "project_members", id: `${f.project.id}:${f.helper.id}` },
        { table: "project_stages", id: `${f.project.id}:${workflow.id}` },
        { table: "schedule_tasks", id: scheduleTask.id },
        { table: "projects", id: newProject.id },
        { table: "contact_people", id: person.id },
      ];
      for (const e of expected)
        expect(ids).toContainEqual({ kind: "reference", ...e });
      // Nothing from the batch itself, and no edited/history noise.
      expect(ids.every((b) => b.kind === "reference")).toBe(true);
    });
  });

  it("names a manual dependency on an imported task from either side", async () => {
    await inBatch(async (tx, f) => {
      const [other] = await tx
        .insert(schema.projects)
        .values({ name: "Casa Tres", clientId: f.client.id })
        .returning();
      const [manual] = await tx
        .insert(schema.tasks)
        .values({
          projectId: other.id,
          kind: "usuario",
          title: "Fuera",
          createdById: f.admin.id,
        })
        .returning();
      const [dep] = await tx
        .insert(schema.taskDependencies)
        .values({ taskId: manual.id, dependsOnTaskId: f.task.id })
        .returning();
      const blockers = await findRollbackBlockers(tx, f.batch.id);
      expect(blockers).toContainEqual({
        kind: "reference",
        table: "task_dependencies",
        id: dep.id,
        what: `depends_on_task_id → batch task ${f.task.id}`,
      });
    });
  });

  it("names a schedule task responsable and a provider profile on a batch contact", async () => {
    await inBatch(async (tx, f) => {
      const [schedule] = await tx
        .insert(schema.projectSchedules)
        .values({
          projectId: (
            await tx
              .insert(schema.projects)
              .values({ name: "Casa Cuatro", clientId: f.client.id })
              .returning()
          )[0].id,
        })
        .returning();
      const [st] = await tx
        .insert(schema.scheduleTasks)
        .values({
          scheduleId: schedule.id,
          stableKey: "pa-1",
          planta: "PA",
          seccion: "Obra",
          seccionOrder: 1,
          inicio: "2026-11-01",
          fin: "2026-11-02",
          tarea: "Losa",
          sortOrder: 1,
          responsableContactId: f.provider.id,
        })
        .returning();
      const [lonely] = await tx
        .insert(schema.contacts)
        .values({ type: "proveedor", name: "Vidrios" })
        .returning();
      await insertImportRefs(tx, [
        {
          source: "monday",
          entity: "contact",
          externalId: "contact-lonely",
          rowId: lonely.id,
          batchId: f.batch.id,
          rowUpdatedAt: lonely.updatedAt,
        },
      ]);
      await tx
        .insert(schema.providerProfiles)
        .values({ contactId: lonely.id, subtype: "tienda" });
      const ids = pick(await findRollbackBlockers(tx, f.batch.id));
      expect(ids).toContainEqual({
        kind: "reference",
        table: "schedule_tasks",
        id: st.id,
      });
      expect(ids).toContainEqual({
        kind: "reference",
        table: "provider_profiles",
        id: lonely.id,
      });
    });
  });

  it("names project_portal_access rows once the table exists", async () => {
    await inBatch(async (tx, f) => {
      await tx.execute(
        sql`create table core.project_portal_access (id uuid primary key default gen_random_uuid(), project_id uuid not null references core.projects(id))`,
      );
      const [row] = (await tx.execute(
        sql`insert into core.project_portal_access (project_id) values (${f.project.id}) returning id::text as id`,
      )) as unknown as { id: string }[];
      expect(pick(await findRollbackBlockers(tx, f.batch.id))).toEqual([
        { kind: "portal", table: "project_portal_access", id: row.id },
      ]);
    });
  });

  describe("rollback command", () => {
    function capture() {
      const out: string[] = [];
      const err: string[] = [];
      const io: CliIo = {
        stdout: (t) => out.push(t),
        stderr: (t) => err.push(t),
      };
      return { io, out: () => out.join(""), err: () => err.join("") };
    }
    const handleFor = (tx: ImportDb) =>
      ({
        db: tx,
        sql: client,
        close: async () => {},
      }) as unknown as MondayDbHandle;

    async function counts(tx: ImportDb) {
      const [row] = (await tx.execute(sql`select
        (select count(*) from core.import_refs)::int as refs,
        (select count(*) from core.tasks)::int as tasks,
        (select count(*) from core.history_events)::int as history,
        (select status::text from core.import_batches order by created_at desc limit 1) as status`)) as unknown as Record<
        string,
        unknown
      >[];
      return row;
    }

    it("refuses, prints every blocker, exits non-zero and writes nothing", async () => {
      await inBatch(async (tx, f) => {
        const [comment] = await tx
          .insert(schema.historyEvents)
          .values({
            entity: "task",
            entityId: f.task.id,
            kind: "comentario",
            comment: "Ojo",
          })
          .returning();
        const before = await counts(tx);
        const c = capture();
        const code = await createRollbackCommand({
          openDb: () => handleFor(tx),
        })(["--batch", f.batch.id], c.io);
        expect(code).toBe(1);
        expect(c.err()).toContain("refused. 1 blocker");
        expect(c.err()).toMatch(
          new RegExp(
            `history_events\\s+${comment.id}\\s+comentario on batch task`,
          ),
        );
        expect(await counts(tx)).toEqual(before);
      });
    });

    it("reports no blockers on a clean batch", async () => {
      await inBatch(async (tx, f) => {
        const c = capture();
        const code = await createRollbackCommand({
          openDb: () => handleFor(tx),
        })(["--batch", f.batch.id], c.io);
        expect(c.out()).toBe(`Batch ${f.batch.id}: no blockers.\n`);
        expect(code).toBe(2);
      });
    });

    it("refuses an unknown or already rolled back batch", async () => {
      await inBatch(async (tx, f) => {
        const run = createRollbackCommand({ openDb: () => handleFor(tx) });
        const c = capture();
        expect(await run(["--batch", crypto.randomUUID()], c.io)).toBe(1);
        expect(c.err()).toMatch(/not found/);
        await tx.execute(
          sql`update core.import_batches set status = 'rolled_back' where id = ${f.batch.id}`,
        );
        const d = capture();
        expect(await run(["--batch", f.batch.id], d.io)).toBe(1);
        expect(d.err()).toMatch(/already rolled back/);
      });
    });
  });
});
