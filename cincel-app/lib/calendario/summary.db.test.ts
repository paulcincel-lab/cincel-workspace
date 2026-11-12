// @vitest-environment node
/**
 * `loadDaySummary` / `loadWeekSummary` against a real Postgres (Calendario BE §10.1).
 * Runs only when TEST_DATABASE_URL points at a migrated database. The canvas fixtures:
 * Cimbra (blocked) stops Obra negra, Ingenierías is overdue before today's review, and
 * Luis waits for a task of the viewer.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe.skipIf(!url)("day and week summaries (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { loadDaySummary, loadWeekSummary } = await import("@/lib/loaders/calendario");

  const run = randomUUID().slice(0, 8);
  const now = new Date("2026-11-11T16:00:00Z"); // 10:00 in Mexico City
  let ana = "";
  let luis = "";
  let outsider = "";
  let projectId = "";
  let eventId = "";

  const asUser = (id: string, name: string) =>
    ({
      member: { id, name, role: "Colaborador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
      email: "",
      access: "Colaborador",
    }) as never;

  async function task(title: string, commitmentDate: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title, commitmentDate, createdById: ana, ...extra })
      .returning({ id: schema.tasks.id });
    return row!.id;
  }

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([{ name: `Ana ${run}` }, { name: `Luis ${run}` }, { name: `Ajena ${run}` }])
      .returning({ id: schema.staff.id });
    [ana, luis, outsider] = people.map((p) => p.id) as [string, string, string];
    const [project] = await db.insert(schema.projects).values({ name: `Casa ${run}` }).returning({ id: schema.projects.id });
    projectId = project!.id;
    await db.insert(schema.projectMembers).values([
      { projectId, staffId: ana },
      { projectId, staffId: luis },
    ]);

    const cimbra = await task("Cimbra", "2026-11-05", { status: "bloqueado", managerId: luis });
    const obra = await task("Obra negra", "2026-11-12", { managerId: ana });
    await db.insert(schema.taskDependencies).values({ taskId: obra, dependsOnTaskId: cimbra });
    await db.insert(schema.historyEvents).values({
      entity: "task",
      entityId: cimbra,
      kind: "cambio",
      field: "status",
      beforeValue: "pendiente",
      afterValue: "bloqueado",
      eventAt: new Date("2026-11-04T18:00:00Z"),
    });
    await task("Ingenierías", "2026-11-09");
    const planos = await task("Planos de cocina", "2026-11-11", { managerId: ana });
    const detalles = await task("Detalles de cocina", "2026-11-20", { managerId: luis });
    await db.insert(schema.taskDependencies).values({ taskId: detalles, dependsOnTaskId: planos });

    const [event] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        title: `Revisión ${run}`,
        projectId,
        organizerId: ana,
        startsAt: new Date("2026-11-11T16:00:00Z"),
        endsAt: new Date("2026-11-11T17:00:00Z"),
      })
      .returning({ id: schema.calendarEvents.id });
    eventId = event!.id;
  });

  afterAll(async () => {
    if (eventId) await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, eventId));
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [ana, luis, outsider].filter(Boolean)));
  });

  it("gives the canvas tiles for the day", async () => {
    const day = await loadDaySummary(asUser(ana, `Ana ${run}`), { date: "2026-11-11" }, now);
    const [reuniones, vence, riesgo, bloqueas] = day.tiles;

    expect(day.greeting).toBe("Buenos días, Ana");
    expect(reuniones!.items.map((i) => i.title)).toEqual([`Revisión ${run}`]);
    expect(vence!.items.map((i) => i.title)).toEqual(["Planos de cocina"]);
    expect(riesgo!.items.map((i) => [i.title, i.line])).toEqual([
      ["Cimbra", 'Bloqueada hace 7 días · frena "Obra negra" (12 nov)'],
      ["Ingenierías", "Vencida 2 días · la reunión de hoy depende de ella"],
    ]);
    expect(bloqueas!.items.map((i) => i.line)).toEqual([`Luis ${run} la necesita para "Detalles de cocina" (20 nov)`]);
    expect(day.lead).toContain("Lo más urgente");
  });

  it("builds the week from the Monday of the date", async () => {
    const week = await loadWeekSummary(asUser(ana, `Ana ${run}`), { from: "2026-11-12" }, now);
    expect(week.from).toBe("2026-11-09");
    expect(week.tiles.find((t) => t.key === "vence")!.items.map((i) => i.title).sort()).toEqual(["Obra negra", "Planos de cocina"]);
  });

  it("shows nothing of the project to a viewer without access", async () => {
    const day = await loadDaySummary(asUser(outsider, `Ajena ${run}`), { date: "2026-11-11" }, now);
    expect(JSON.stringify(day.tiles)).not.toContain(run);
    expect(day.tiles.every((t) => t.count === 0)).toBe(true);
  });
});
