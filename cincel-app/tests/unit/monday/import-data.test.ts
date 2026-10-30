// @vitest-environment node
/**
 * "Datos de monday" read path (FE §2.3): toImportData, findImportRefByRow and
 * getImportDataAction over import_refs seeded by hand. The database part runs
 * only when TEST_DATABASE_URL points at a migrated database; it removes the
 * rows it seeds.
 */
import { inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/lib/db/schema";
import { toImportData } from "@/lib/import/import-data";

const url = process.env.TEST_DATABASE_URL;

const testDb = vi.hoisted(() => ({ url: process.env.TEST_DATABASE_URL ?? "" }));
vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const s = await import("@/lib/db/schema");
  const sql = postgres(testDb.url, { max: 1, onnotice: () => {} });
  return { db: drizzle(sql, { schema: s }), sql };
});

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "actor" },
    access: "Colaborador",
  })),
}));

const canView = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: canView.value }),
  resolveProjectsCapabilities: () => ({ canViewProjects: canView.value }),
  resolveClientsCapabilities: () => ({ canViewClients: canView.value }),
}));

const createdAt = new Date("2026-10-05T12:00:00Z");

describe("toImportData", () => {
  it("lifts board and group out of data.source and passes the rest through", () => {
    expect(
      toImportData({
        source: "monday",
        createdAt,
        data: {
          source: {
            boardId: "1",
            boardName: "Obras",
            groupId: "g",
            groupTitle: "Activos",
          },
          columns: { Estado: "Listo", Etiquetas: ["a", "b"] },
          subitems: [{ id: "9", name: "Pintura", columns: {} }],
          start: "2026-09-01",
          milestone: true,
        },
      }),
    ).toEqual({
      source: "monday",
      importedAt: "2026-10-05T12:00:00.000Z",
      boardName: "Obras",
      groupTitle: "Activos",
      data: {
        columns: { Estado: "Listo", Etiquetas: ["a", "b"] },
        subitems: [{ id: "9", name: "Pintura", columns: {} }],
        start: "2026-09-01",
        milestone: true,
      },
    });
  });

  it("returns null boardName / groupTitle when data.source is missing", () => {
    expect(
      toImportData({ source: "monday", createdAt, data: { columns: {} } }),
    ).toMatchObject({
      boardName: null,
      groupTitle: null,
      data: { columns: {} },
    });
  });

  it("returns null without data or for another source", () => {
    expect(
      toImportData({ source: "monday", createdAt, data: null }),
    ).toBeNull();
    expect(
      toImportData({ source: "monday", createdAt, data: ["x"] }),
    ).toBeNull();
    expect(
      toImportData({ source: "trello", createdAt, data: { columns: {} } }),
    ).toBeNull();
  });
});

describe.skipIf(!url)(
  "getImportDataAction over hand-seeded import_refs (test DB)",
  () => {
    type Db = typeof import("@/lib/db/client").db;
    let db: Db;
    let sql: { end: (o: { timeout: number }) => Promise<void> };
    let getImportDataAction: typeof import("@/lib/actions/import-actions").getImportDataAction;
    let findImportRefByRow: typeof import("@/lib/import/refs").findImportRefByRow;

    const ids = {
      staff: "",
      contact: "",
      project: "",
      task: "",
      plain: "",
      batch: "",
    };
    const ext = `t${Date.now()}`;

    beforeAll(async () => {
      const client = (await import("@/lib/db/client")) as unknown as {
        db: Db;
        sql: typeof sql;
      };
      db = client.db;
      sql = client.sql;
      ({ getImportDataAction } = await import("@/lib/actions/import-actions"));
      ({ findImportRefByRow } = await import("@/lib/import/refs"));

      const [staff] = await db
        .insert(schema.staff)
        .values({ name: `Import data ${ext}` })
        .returning();
      const [contact] = await db
        .insert(schema.contacts)
        .values({ type: "cliente", name: "Cliente importado" })
        .returning();
      const [plain] = await db
        .insert(schema.contacts)
        .values({ type: "cliente", name: "Cliente sin importar" })
        .returning();
      const [project] = await db
        .insert(schema.projects)
        .values({ name: "Casa importada", clientId: contact.id })
        .returning();
      const [task] = await db
        .insert(schema.tasks)
        .values({
          projectId: project.id,
          kind: "usuario",
          title: "Tarea importada",
          createdById: staff.id,
        })
        .returning();
      const [batch] = await db
        .insert(schema.importBatches)
        .values({
          accountId: "acc-1",
          exportedAt: new Date("2026-10-01T00:00:00Z"),
          exportPath: "exports/acme",
          mapping: {},
          appliedById: staff.id,
        })
        .returning();
      Object.assign(ids, {
        staff: staff.id,
        contact: contact.id,
        plain: plain.id,
        project: project.id,
        task: task.id,
        batch: batch.id,
      });

      const src = (boardName: string) => ({
        boardId: "1",
        boardName,
        groupId: "g",
        groupTitle: "Activos",
      });
      await db.insert(schema.importRefs).values([
        {
          source: "monday",
          entity: "task",
          externalId: `${ext}-task`,
          rowId: task.id,
          batchId: batch.id,
          data: {
            source: src("Tareas"),
            columns: { Estado: "Listo" },
            milestone: true,
          },
        },
        {
          source: "monday",
          entity: "project",
          externalId: `${ext}-project`,
          rowId: project.id,
          batchId: batch.id,
          data: { source: src("Proyectos"), columns: { Presupuesto: "1200" } },
        },
        {
          source: "monday",
          entity: "contact",
          externalId: `${ext}-contact`,
          rowId: contact.id,
          batchId: batch.id,
          data: { source: src("Clientes"), columns: { Teléfono: "555" } },
        },
      ]);
    });

    afterAll(async () => {
      if (!db) return;
      await db
        .delete(schema.importRefs)
        .where(inArray(schema.importRefs.batchId, [ids.batch]));
      await db
        .delete(schema.importBatches)
        .where(inArray(schema.importBatches.id, [ids.batch]));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, [ids.task]));
      await db
        .delete(schema.projects)
        .where(inArray(schema.projects.id, [ids.project]));
      await db
        .delete(schema.contacts)
        .where(inArray(schema.contacts.id, [ids.contact, ids.plain]));
      await db
        .delete(schema.staff)
        .where(inArray(schema.staff.id, [ids.staff]));
      await sql.end({ timeout: 5 });
    });

    beforeEach(() => {
      canView.value = true;
    });

    it("returns data for a task, a project and a contact", async () => {
      await expect(
        getImportDataAction("task", ids.task),
      ).resolves.toMatchObject({
        source: "monday",
        boardName: "Tareas",
        groupTitle: "Activos",
        data: { columns: { Estado: "Listo" }, milestone: true },
      });
      await expect(
        getImportDataAction("project", ids.project),
      ).resolves.toMatchObject({
        boardName: "Proyectos",
        data: { columns: { Presupuesto: "1200" } },
      });
      await expect(
        getImportDataAction("contact", ids.contact),
      ).resolves.toMatchObject({
        boardName: "Clientes",
        data: { columns: { Teléfono: "555" } },
      });
    });

    it("returns null for a row without import data", async () => {
      await expect(
        getImportDataAction("contact", ids.plain),
      ).resolves.toBeNull();
      // A ref of another entity on the same id doesn't count.
      await expect(
        getImportDataAction("project", ids.task),
      ).resolves.toBeNull();
    });

    it("refuses a user who cannot see the row", async () => {
      canView.value = false;
      await expect(getImportDataAction("task", ids.task)).resolves.toBeNull();
    });

    it("returns null once the row is deleted", async () => {
      const { eq } = await import("drizzle-orm");
      await db
        .update(schema.contacts)
        .set({ deletedAt: new Date() })
        .where(eq(schema.contacts.id, ids.contact));
      try {
        await expect(
          getImportDataAction("contact", ids.contact),
        ).resolves.toBeNull();
      } finally {
        await db
          .update(schema.contacts)
          .set({ deletedAt: null })
          .where(eq(schema.contacts.id, ids.contact));
      }
    });

    it("findImportRefByRow picks the oldest ref of the row", async () => {
      await db.insert(schema.importRefs).values({
        source: "monday",
        entity: "task",
        externalId: `${ext}-task-later`,
        rowId: ids.task,
        batchId: ids.batch,
        data: { columns: { Estado: "Otro" } },
        createdAt: new Date(Date.now() + 60_000),
      });
      const ref = await findImportRefByRow(db, "monday", "task", ids.task);
      expect(ref?.externalId).toBe(`${ext}-task`);
    });
  },
);
