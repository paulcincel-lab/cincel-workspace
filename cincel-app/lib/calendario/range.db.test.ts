// @vitest-environment node
/**
 * Calendario range loader against a real Postgres (BE §5, §13): per-day aggregates
 * match a JS reference over the same seed, viewer scope, keyset paging and the guard
 * against loading everything. Runs only when TEST_DATABASE_URL points at a migrated
 * database; every row carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { CalendarioFilters, CalendarioRangeInput } from "@/lib/types/calendario";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

const FILTERS: CalendarioFilters = {
  mostrar: "todo",
  quien: "yo",
  proyectos: [],
  tramo: null,
  responsable: null,
  apoyo: true,
  ocultarCompletadas: false,
};

function userOf(id: string, access: string): AuthenticatedUser {
  return { member: { id, name: `Persona ${run}`, role: access, active: true }, email: `cal-${run}-${id.slice(0, 4)}@test.local`, access } as unknown as AuthenticatedUser;
}

function monthInput(filters: Partial<CalendarioFilters> = {}): CalendarioRangeInput {
  return { view: "mes", from: "2031-03-03", to: "2031-04-13", filters: { ...FILTERS, ...filters } };
}

describe.skipIf(!url)("Calendario range loader (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { loadCalendarioRange, loadCalendarioList } = await import("@/lib/loaders/calendario");
  const { countQueries } = await import("../../tests/helpers/count-queries");

  let adminId = "";
  let anaId = "";
  let otherId = "";
  let projectId = "";
  const taskIds: string[] = [];
  const seeded: { date: string; status: "pendiente" | "completado"; managerId: string | null; kind: "usuario" | "admin" }[] = [];
  let admin: AuthenticatedUser;
  let ana: AuthenticatedUser;
  let other: AuthenticatedUser;

  const dayOf = (i: number) => {
    const d = new Date(Date.UTC(2031, 2, 3 + (i % 42)));
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, role: "Administrador" },
        { name: `Ana ${run}`, role: "Colaborador" },
        { name: `Otro ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    adminId = people[0]!.id;
    anaId = people[1]!.id;
    otherId = people[2]!.id;
    admin = userOf(adminId, "Administrador");
    ana = userOf(anaId, "Colaborador");
    other = userOf(otherId, "Colaborador");
    const [project] = await db.insert(schema.projects).values({ name: `Calendario ${run}` }).returning({ id: schema.projects.id });
    projectId = project!.id;

    // 130 tasks over the 42-day grid: Ana's (some completed), another person's, and one admin task of the administrator.
    for (let i = 0; i < 130; i++) {
      seeded.push({
        date: dayOf(i),
        status: i % 5 === 0 ? "completado" : "pendiente",
        managerId: i % 4 === 0 ? otherId : anaId,
        kind: "usuario",
      });
    }
    seeded.push({ date: "2031-03-10", status: "pendiente", managerId: adminId, kind: "admin" });
    const rows = await db
      .insert(schema.tasks)
      .values(
        seeded.map((t, i) => ({
          projectId,
          kind: t.kind,
          title: `Tarea ${String(i).padStart(3, "0")} ${run}`,
          createdById: adminId,
          managerId: t.managerId,
          status: t.status,
          commitmentDate: t.date,
        })),
      )
      .returning({ id: schema.tasks.id });
    taskIds.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    if (projectId) {
      await db.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId));
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    }
    await db.delete(schema.staff).where(inArray(schema.staff.id, [adminId, anaId, otherId].filter(Boolean)));
  });

  it("matches a JS reference per day and bounds the items to 3 per day", async () => {
    const range = await loadCalendarioRange(ana, monthInput());
    expect(range.days).toHaveLength(42);
    const mine = seeded.filter((t) => t.managerId === anaId && t.kind === "usuario");
    for (const day of range.days) {
      const ref = mine.filter((t) => t.date === day.date);
      expect(day.tasks).toBe(ref.length);
      expect(day.completed).toBe(ref.filter((t) => t.status === "completado").length);
      expect(day.events).toBe(0);
      expect(day.hours).toBeNull();
      expect(day.shown).toBe(Math.min(3, ref.length));
    }
    expect(range.items.length).toBeLessThanOrEqual(42 * 3);
    expect(range.truncated).toBe(range.days.some((d) => d.tasks > 3));
    expect(range.kpis.tasks).toBe(mine.length);
    expect(range.kpis.unassigned).toBe(0);
  });

  it("never gives a non-admin the admin tasks, and an admin sees their own", async () => {
    const day = { view: "dia" as const, from: "2031-03-10", to: "2031-03-10" };
    const mine = await loadCalendarioRange(admin, { ...day, filters: FILTERS });
    expect(mine.items.some((i) => i.kind === "task" && i.manager?.id === adminId)).toBe(true);
    // Not in anyone else's lists, even with the team calendar or as support.
    const team = await loadCalendarioRange(admin, { ...day, filters: { ...FILTERS, quien: "todos" } });
    expect(team.items.some((i) => i.kind === "task" && i.manager?.id === adminId)).toBe(false);
    const asAna = await loadCalendarioRange(ana, { ...day, filters: FILTERS });
    expect(asAna.items.some((i) => i.kind === "task" && i.manager?.id === adminId)).toBe(false);
  });

  it("ignores quien=todos without canViewTeamCalendar", async () => {
    const asOther = await loadCalendarioRange(other, monthInput({ quien: "todos" }));
    const mine = seeded.filter((t) => t.managerId === otherId).length;
    expect(asOther.kpis.tasks).toBe(mine);
    const asAdmin = await loadCalendarioRange(admin, monthInput({ quien: "todos", responsable: anaId }));
    expect(asAdmin.kpis.tasks).toBe(seeded.filter((t) => t.managerId === anaId && t.kind === "usuario").length);
  });

  it("hides completed tasks on request and returns nothing for reuniones", async () => {
    const open = await loadCalendarioRange(ana, monthInput({ ocultarCompletadas: true }));
    expect(open.days.every((d) => d.completed === 0)).toBe(true);
    const meetings = await loadCalendarioRange(ana, monthInput({ mostrar: "reuniones" }));
    expect(meetings.items).toEqual([]);
    expect(meetings.kpis.tasks).toBe(0);
  });

  it("loads a range in at most 4 queries", async () => {
    const { count } = await countQueries(() => loadCalendarioRange(ana, monthInput()));
    expect(count).toBeLessThanOrEqual(4);
  });

  it("pages the list with a stable keyset, both directions", async () => {
    for (const orderDir of ["asc", "desc"] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const page = await loadCalendarioList(ana, { from: "2031-03-03", to: "2031-04-13", filters: FILTERS, cursor, limit: 40, orderDir });
        seen.push(...page.rows.map((r) => r.id));
        total = page.total;
        cursor = page.nextCursor;
      } while (cursor);
      const mine = seeded.filter((t) => t.managerId === anaId && t.kind === "usuario").length;
      expect(total).toBe(mine);
      expect(seen).toHaveLength(mine);
      expect(new Set(seen).size).toBe(mine);
    }
  });

  describe("guard against loading everything", () => {
    const bulk: string[] = [];
    beforeAll(async () => {
      const values = Array.from({ length: 5000 }, (_, i) => {
        const d = new Date(Date.UTC(2032, 0, 1 + (i % 730)));
        return { projectId, kind: "usuario" as const, title: `Masa ${i} ${run}`, createdById: adminId, managerId: anaId, commitmentDate: d.toISOString().slice(0, 10) };
      });
      for (let i = 0; i < values.length; i += 500) {
        const rows = await db.insert(schema.tasks).values(values.slice(i, i + 500)).returning({ id: schema.tasks.id });
        bulk.push(...rows.map((r) => r.id));
      }
    }, 60_000);

    it("a month over 5 000 tasks returns at most 42 x 3 items in at most 4 queries", async () => {
      const input: CalendarioRangeInput = { view: "mes", from: "2032-03-01", to: "2032-04-11", filters: FILTERS };
      const { result, count } = await countQueries(() => loadCalendarioRange(ana, input));
      expect(result.items.length).toBeLessThanOrEqual(42 * 3);
      expect(count).toBeLessThanOrEqual(4);
      expect(result.days.reduce((n, d) => n + d.tasks, 0)).toBeGreaterThan(result.items.length);
    });
  });
});
