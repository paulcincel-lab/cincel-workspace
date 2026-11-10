// @vitest-environment node
/**
 * `setTaskSupportAction` (#1038, the Apoyo cell of the task tables) against a
 * real Postgres: the Responsable's permission (`canChangeResponsible`), the
 * `ActionResult` shape, the task's support rows and the bitácora entry with
 * the people's names. Runs only when TEST_DATABASE_URL points at a migrated
 * database. Only the session is mocked; the capabilities are the real role
 * defaults. Every row carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

type Actor = { id: string; name: string; access: "Administrador" | "Colaborador" };
const session = vi.hoisted(() => ({ actor: null as null | Actor }));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityUser: vi.fn(async () => {
    const actor = session.actor;
    if (!actor) throw new Error("no test actor");
    return {
      member: {
        id: actor.id,
        name: actor.name,
        role: actor.access,
        area: "",
        capacity: 0,
        availability: "",
        active: true,
        institutionalEmail: `${actor.id}@test.local`,
        phone: "",
      },
      email: `${actor.id}@test.local`,
      access: actor.access,
    };
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

describe.skipIf(!url)("setTaskSupportAction (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { setTaskSupportAction } = await import("./tasks-actions");
  const tasksRepository = await import("@/lib/repositories/tasks-repository");

  let admin: Actor;
  let colaborador: Actor;
  const people: { id: string; name: string }[] = [];
  let projectId = "";
  let taskId = "";

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, role: "Administrador" },
        { name: `Colaborador ${run}`, role: "Colaborador" },
        { name: `Ana Apoyo ${run}`, role: "Colaborador" },
        { name: `Bruno Apoyo ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id, name: schema.staff.name });
    admin = { id: rows[0]!.id, name: rows[0]!.name, access: "Administrador" };
    colaborador = { id: rows[1]!.id, name: rows[1]!.name, access: "Colaborador" };
    people.push(rows[2]!, rows[3]!);
    const [project] = await db.insert(schema.projects).values({ name: `Apoyo ${run}` }).returning({ id: schema.projects.id });
    projectId = project!.id;
    const [task] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `Tarea apoyo ${run}`, createdById: admin.id, managerId: colaborador.id })
      .returning({ id: schema.tasks.id });
    taskId = task!.id;
  });

  afterAll(async () => {
    if (taskId) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, taskId));
      await db.delete(schema.taskSupport).where(eq(schema.taskSupport.taskId, taskId));
      await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    }
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    const ids = [admin?.id, colaborador?.id, ...people.map((p) => p.id)].filter((id): id is string => Boolean(id));
    if (ids.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
  });

  const supportIds = async () =>
    (await db.select({ staffId: schema.taskSupport.staffId }).from(schema.taskSupport).where(eq(schema.taskSupport.taskId, taskId)))
      .map((r) => r.staffId)
      .sort();

  it("an administrator sets the equipo de apoyo; the result is an ActionResult with the people", async () => {
    session.actor = admin;
    const [ana, bruno] = people;
    const result = await setTaskSupportAction(taskId, [ana!.id, bruno!.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((s) => s.id).sort()).toEqual([ana!.id, bruno!.id].sort());
    expect(await supportIds()).toEqual([ana!.id, bruno!.id].sort());
  });

  it("the change reaches the task (sheet) and its bitácora with the names", async () => {
    const [ana, bruno] = people;
    const detail = await tasksRepository.getTask(taskId);
    expect(detail?.support.map((s) => s.id).sort()).toEqual([ana!.id, bruno!.id].sort());
    session.actor = admin;
    expect((await setTaskSupportAction(taskId, [bruno!.id])).ok).toBe(true);
    const [event] = await db
      .select({ before: schema.historyEvents.beforeValue, after: schema.historyEvents.afterValue })
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entityId, taskId), eq(schema.historyEvents.field, "support")))
      .orderBy(schema.historyEvents.eventAt)
      .limit(1)
      .offset(1);
    expect(event).toEqual({ before: [ana!.name, bruno!.name].sort((x, y) => x.localeCompare(y, "es")).join(", "), after: bruno!.name });
  });

  it("an empty list clears it", async () => {
    session.actor = admin;
    expect((await setTaskSupportAction(taskId, [])).ok).toBe(true);
    expect(await supportIds()).toEqual([]);
  });

  it("without canChangeResponsible (Colaborador) it is refused, even as the Responsable", async () => {
    session.actor = colaborador;
    const result = await setTaskSupportAction(taskId, [people[0]!.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(String(result.error)).toMatch(/FORBIDDEN/);
    expect(await supportIds()).toEqual([]);
  });
});
