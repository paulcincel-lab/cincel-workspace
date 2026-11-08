// @vitest-environment node
/**
 * Task projection (#954) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database; every test runs inside a
 * transaction that is rolled back.
 * - `listTaskRows` returns the `listTasks` rows (minus `notes`) in 1 statement,
 *   and its counts equal the correlated-subquery computations it replaced.
 * - `countOpenTasksFor` equals the open `listMyTasks` rows (isTaskClosed).
 * - `countProjectTasks` equals `listTasks({ projectId }).length`.
 */
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { TaskListItem, TaskListRow, ViewerScope } from "@/lib/types/core";

import { countQueries } from "../helpers/count-queries";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  countOpenTasksFor,
  countProjectTasks,
  listMyTasks,
  listTaskRows,
  listTasks,
} from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

const ADMIN: ViewerScope = { staffId: "", isAdmin: true };

class Rollback extends Error {}

const ROW_ONLY_FIELDS = ["subtaskDone", "commentCount", "attachmentCount", "checklistTotal", "checklistDone"] as const;

/** A `TaskListRow` reduced to the `TaskListItem` fields it shares. */
function sharedFields(row: TaskListRow): Omit<TaskListItem, "notes"> {
  const out: Record<string, unknown> = { ...row };
  for (const key of ROW_ONLY_FIELDS) delete out[key];
  return out as Omit<TaskListItem, "notes">;
}

function withoutNotes(item: TaskListItem): Omit<TaskListItem, "notes"> {
  const out: Partial<TaskListItem> = { ...item };
  delete out.notes;
  return out as Omit<TaskListItem, "notes">;
}

describe.skipIf(!url)("task list rows and counts (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = { projectId: string; otherProjectId: string; managerId: string; helperId: string };

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const [manager] = await tx.insert(schema.staff).values({ name: "Ana Proyección" }).returning();
        const [helper] = await tx.insert(schema.staff).values({ name: "Beto Apoyo" }).returning();
        const [client] = await tx
          .insert(schema.contacts)
          .values({ type: "cliente", name: "Cliente Proyección" })
          .returning();
        const [project] = await tx
          .insert(schema.projects)
          .values({ name: "Proyecto Proyección", clientId: client.id })
          .returning();
        const [other] = await tx.insert(schema.projects).values({ name: "Proyecto Otro" }).returning();
        await fn(tx, { projectId: project.id, otherProjectId: other.id, managerId: manager.id, helperId: helper.id });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  async function addTask(
    tx: Tx,
    ctx: Ctx,
    title: string,
    extra: Partial<typeof schema.tasks.$inferInsert> = {},
  ) {
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        projectId: ctx.projectId,
        kind: "usuario",
        title,
        notes: `Notas de ${title}`,
        createdById: ctx.managerId,
        managerId: ctx.managerId,
        ...extra,
      })
      .returning();
    return row;
  }

  /** Every kind of count the projection aggregates, on a few tasks. */
  async function seed(tx: Tx, ctx: Ctx) {
    const [closing] = await tx
      .insert(schema.taskStatuses)
      .values({ name: `Cierra ${crypto.randomUUID()}`, closes: true })
      .returning();
    const [open] = await tx
      .insert(schema.taskStatuses)
      .values({ name: `Abierto ${crypto.randomUUID()}` })
      .returning();
    const [gone] = await tx.insert(schema.staff).values({ name: "Carla Baja", deletedAt: new Date() }).returning();

    const parent = await addTask(tx, ctx, "Padre");
    await addTask(tx, ctx, "Hija hecha", { parentTaskId: parent.id, status: "completado" });
    const child = await addTask(tx, ctx, "Hija abierta", { parentTaskId: parent.id, managerId: null });
    await addTask(tx, ctx, "Hija archivada", { parentTaskId: parent.id, archived: true });
    await addTask(tx, ctx, "Hija borrada", { parentTaskId: parent.id, deletedAt: new Date() });
    const done = await addTask(tx, ctx, "Terminada", { status: "completado" });
    const closedByCustom = await addTask(tx, ctx, "Cerrada propia", { customStatusId: closing.id });
    await addTask(tx, ctx, "Abierta propia", { customStatusId: open.id, status: "en_proceso" });
    await addTask(tx, ctx, "Archivada", { archived: true });
    await addTask(tx, ctx, "Borrada", { deletedAt: new Date() });
    await addTask(tx, ctx, "Admin", { kind: "admin" });
    await addTask(tx, ctx, "Ajena", { projectId: ctx.otherProjectId, managerId: null });
    const supported = await addTask(tx, ctx, "Con apoyo", { managerId: null });

    await tx.insert(schema.taskSupport).values([
      { taskId: supported.id, staffId: ctx.helperId },
      { taskId: supported.id, staffId: ctx.managerId },
      { taskId: supported.id, staffId: gone.id },
      { taskId: child.id, staffId: ctx.helperId },
    ]);
    await tx.insert(schema.taskChecklistItems).values([
      { taskId: parent.id, title: "Uno", completed: true },
      { taskId: parent.id, title: "Dos" },
      { taskId: parent.id, title: "Tres", completed: true },
      { taskId: child.id, title: "Solo" },
    ]);
    await tx.insert(schema.taskDependencies).values([
      { taskId: parent.id, dependsOnTaskId: child.id },
      { taskId: parent.id, dependsOnTaskId: done.id },
      { taskId: supported.id, dependsOnTaskId: closedByCustom.id },
    ]);
    await tx.insert(schema.historyEvents).values([
      { entity: "task", entityId: parent.id, kind: "comentario", comment: "Hola" },
      { entity: "task", entityId: parent.id, kind: "comentario", comment: "Otra" },
      { entity: "task", entityId: parent.id, kind: "cambio", field: "title", beforeValue: "a", afterValue: "b" },
      { entity: "task", entityId: child.id, kind: "comentario", comment: "Hija" },
    ]);
    await tx.insert(schema.taskAttachments).values([
      { taskId: parent.id, fileName: "a.txt", mimeType: "text/plain", sizeBytes: 1, data: Buffer.from("a") },
      { taskId: supported.id, fileName: "b.txt", mimeType: "text/plain", sizeBytes: 1, data: Buffer.from("b") },
      { taskId: supported.id, fileName: "c.txt", mimeType: "text/plain", sizeBytes: 1, data: Buffer.from("c") },
    ]);
    return { parent, child, supported };
  }

  /** The counts as the old correlated subqueries computed them, per task id. */
  async function oldCounts(tx: Tx, ids: string[]) {
    if (ids.length === 0) return new Map<string, Record<string, unknown>>();
    const rows = await tx.execute<{
      id: string;
      checklist_total: number;
      checklist_done: number;
      parent_title: string | null;
      subtask_count: number;
      subtask_done: number;
      waiting_on: number;
      comment_count: number;
      attachment_count: number;
    }>(dsql`
      select t.id,
        (select count(*) from core.task_checklist_items c where c.task_id = t.id)::int as checklist_total,
        (select count(*) from core.task_checklist_items c where c.task_id = t.id and c.completed)::int as checklist_done,
        (select p.title from core.tasks p where p.id = t.parent_task_id and p.deleted_at is null) as parent_title,
        (select count(*) from core.tasks s where s.parent_task_id = t.id and s.deleted_at is null and not s.archived)::int as subtask_count,
        (select count(*) from core.tasks s where s.parent_task_id = t.id and s.deleted_at is null and not s.archived and s.status = 'completado')::int as subtask_done,
        (select count(*) from core.task_dependencies d join core.tasks dt on dt.id = d.depends_on_task_id where d.task_id = t.id and dt.deleted_at is null and not dt.archived and dt.status <> 'completado')::int as waiting_on,
        (select count(*) from core.history_events h where h.entity = 'task' and h.entity_id = t.id and h.kind = 'comentario')::int as comment_count,
        (select count(*) from core.task_attachments a where a.task_id = t.id)::int as attachment_count
      from core.tasks t
      where t.id in (${dsql.join(ids.map((id) => dsql`${id}::uuid`), dsql`, `)})
    `);
    return new Map(Array.from(rows).map((r) => [r.id, r as Record<string, unknown>]));
  }

  async function expectRowsMatch(tx: Tx, filters: Parameters<typeof listTasks>[0], viewer: ViewerScope) {
    const items = await listTasks(filters, viewer);
    const { result: rows, count } = await countQueries(() => listTaskRows(filters, viewer));

    expect(count).toBe(1);
    expect(rows.map(sharedFields)).toEqual(items.map(withoutNotes));
    for (const row of rows) expect(row).not.toHaveProperty("notes");

    const old = await oldCounts(tx, rows.map((r) => r.id));
    for (const row of rows) {
      const o = old.get(row.id)!;
      expect({
        checklistTotal: row.checklistTotal,
        checklistDone: row.checklistDone,
        parentTitle: row.parentTitle,
        subtaskCount: row.subtaskCount,
        subtaskDone: row.subtaskDone,
        waitingOn: row.waitingOn,
        commentCount: row.commentCount,
        attachmentCount: row.attachmentCount,
      }).toEqual({
        checklistTotal: o.checklist_total,
        checklistDone: o.checklist_done,
        parentTitle: row.parentTaskId ? o.parent_title : null,
        subtaskCount: o.subtask_count,
        subtaskDone: o.subtask_done,
        waitingOn: o.waiting_on,
        commentCount: o.comment_count,
        attachmentCount: o.attachment_count,
      });
      expect(row.checklist).toEqual({ total: row.checklistTotal, completed: row.checklistDone });
      expect(row.subtaskDoneCount).toBe(row.subtaskDone);
    }
    return rows;
  }

  it("listTaskRows returns the listTasks rows without notes, in one statement", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const nonAdmin: ViewerScope = { staffId: ctx.managerId, isAdmin: false };

      const rows = await expectRowsMatch(tx, { projectId: ctx.projectId }, ADMIN);
      expect(rows.length).toBeGreaterThan(0);
      await expectRowsMatch(tx, { projectId: ctx.projectId }, nonAdmin);
      await expectRowsMatch(tx, { projectId: ctx.projectId, kind: ["usuario", "admin"], archived: true }, ADMIN);
      await expectRowsMatch(tx, { involvesStaffId: ctx.helperId }, ADMIN);
      await expectRowsMatch(tx, { search: "hija" }, ADMIN);
      // The whole (seeded) database, as an administrator sees it.
      await expectRowsMatch(tx, {}, ADMIN);
    });
  });

  it("carries the counts, support and client scoping on known rows", async () => {
    await inTx(async (tx, ctx) => {
      const { parent, supported } = await seed(tx, ctx);
      const rows = await listTaskRows({ projectId: ctx.projectId }, ADMIN);
      const p = rows.find((r) => r.id === parent.id)!;
      expect(p).toMatchObject({
        subtaskCount: 2,
        subtaskDone: 1,
        checklistTotal: 3,
        checklistDone: 2,
        waitingOn: 1,
        commentCount: 2,
        attachmentCount: 1,
        project: { id: ctx.projectId, clientName: "Cliente Proyección" },
      });
      const s = rows.find((r) => r.id === supported.id)!;
      // Deleted staff left out; by name.
      expect(s.support.map((x) => x.name)).toEqual(["Ana Proyección", "Beto Apoyo"]);
      expect(s).toMatchObject({ attachmentCount: 2, commentCount: 0, waitingOn: 1 });

      const scoped = await listTaskRows({ projectId: ctx.projectId }, { staffId: ctx.managerId, isAdmin: false });
      expect(scoped.every((r) => r.project.clientName === null)).toBe(true);
      expect(scoped.some((r) => r.kind === "admin")).toBe(false);
    });
  });

  it("countOpenTasksFor equals the open listMyTasks rows", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const viewers: ViewerScope[] = [ADMIN, { staffId: ctx.managerId, isAdmin: false }];
      for (const viewer of viewers) {
        for (const staffId of [ctx.managerId, ctx.helperId]) {
          const expected = (await listMyTasks(staffId, {}, viewer)).filter((t) => !isTaskClosed(t)).length;
          const { result, count } = await countQueries(() => countOpenTasksFor(staffId, viewer));
          expect(count).toBe(1);
          expect(result).toBe(expected);
        }
      }
      // An administrator also counts their open admin task.
      expect(await countOpenTasksFor(ctx.managerId, ADMIN)).toBeGreaterThan(
        await countOpenTasksFor(ctx.managerId, { staffId: ctx.managerId, isAdmin: false }),
      );
    });
  });

  it("countProjectTasks equals listTasks({ projectId }).length", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const viewers: ViewerScope[] = [ADMIN, { staffId: ctx.managerId, isAdmin: false }];
      for (const viewer of viewers) {
        for (const projectId of [ctx.projectId, ctx.otherProjectId]) {
          const expected = (await listTasks({ projectId }, viewer)).length;
          const { result, count } = await countQueries(() => countProjectTasks(projectId, viewer));
          expect(count).toBe(1);
          expect(result).toBe(expected);
        }
      }
      expect(await countProjectTasks(crypto.randomUUID(), ADMIN)).toBe(0);
    });
  });
});
