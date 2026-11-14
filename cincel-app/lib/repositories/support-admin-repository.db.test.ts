// @vitest-environment node
/**
 * Mejoras repository against a real Postgres (#1113). Runs only when
 * TEST_DATABASE_URL points at a migrated database. Rows belong to staff
 * created here and are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("support admin repository", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { admin: "", author: "", other: "" };
  const tickets: string[] = [];
  let db: typeof import("@/lib/db/client").db;
  let repo: typeof import("./support-admin-repository");
  let schema: typeof import("@/lib/db/schema");
  let orm: typeof import("drizzle-orm");

  async function ticket(title: string, description = "Descripción de prueba") {
    const [row] = await db
      .insert(schema.supportTickets)
      .values({
        kind: "error",
        title,
        description,
        context: { path: "/", estilo: "a", theme: "light", viewport: "1x1", userAgent: "t", appVersion: "0", occurredAt: new Date().toISOString() },
        createdBy: ids.author,
      })
      .returning();
    tickets.push(row.id);
    return row;
  }

  async function events(id: string) {
    return db.select().from(schema.supportTicketEvents).where(orm.eq(schema.supportTicketEvents.ticketId, id));
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db/client"));
    repo = await import("./support-admin-repository");
    schema = await import("@/lib/db/schema");
    orm = await import("drizzle-orm");
    const rows = await db
      .insert(schema.staff)
      .values([{ name: `Admin ${tag}` }, { name: `Autor ${tag}` }, { name: `Otro ${tag}` }])
      .returning({ id: schema.staff.id });
    [ids.admin, ids.author, ids.other] = rows.map((r) => r.id);
  });

  afterAll(async () => {
    if (!url) return;
    if (tickets.length > 0) {
      await db.delete(schema.supportTickets).where(orm.inArray(schema.supportTickets.id, tickets));
    }
    await db.delete(schema.notifications).where(orm.eq(schema.notifications.staffId, ids.author));
    await db.delete(schema.staff).where(orm.inArray(schema.staff.id, Object.values(ids)));
  });

  it("writes exactly one event per change, with before and after", async () => {
    const t = await ticket(`Cambios ${tag}`);
    expect(await repo.updateTicket(ids.admin, t.id, { status: "en_revision", priority: "alta", assigneeId: ids.other })).toEqual({ ok: true, data: null });
    const rows = await events(t.id);
    expect(rows).toHaveLength(3);
    const status = rows.find((e) => e.type === "status");
    expect(status?.payload).toMatchObject({ from: "nuevo", to: "en_revision" });
    expect(status?.visibility).toBe("public");
    expect(rows.find((e) => e.type === "priority")?.payload).toMatchObject({ from: null, to: "alta" });
    expect(rows.find((e) => e.type === "assignee")?.visibility).toBe("internal");

    // The same patch again changes nothing.
    await repo.updateTicket(ids.admin, t.id, { status: "en_revision", priority: "alta" });
    expect(await events(t.id)).toHaveLength(3);
  });

  it("closes with closed_at and requires a message to discard", async () => {
    const t = await ticket(`Cierre ${tag}`);
    const refused = await repo.updateTicket(ids.admin, t.id, { status: "descartado" });
    expect(refused.ok).toBe(false);
    expect(await events(t.id)).toHaveLength(0);

    await repo.updateTicket(ids.admin, t.id, { status: "descartado", message: "Es el comportamiento esperado" });
    let [row] = await db.select().from(schema.supportTickets).where(orm.eq(schema.supportTickets.id, t.id));
    expect(row.closedAt).not.toBeNull();
    const [event] = await events(t.id);
    expect(event.payload).toMatchObject({ to: "descartado", text: "Es el comportamiento esperado" });

    await repo.updateTicket(ids.admin, t.id, { status: "en_revision" });
    [row] = await db.select().from(schema.supportTickets).where(orm.eq(schema.supportTickets.id, t.id));
    expect(row.closedAt).toBeNull();
  });

  it("keeps notes internal and notifies the author of public replies only", async () => {
    const t = await ticket(`Mensajes ${tag}`);
    await repo.addTicketMessage(ids.admin, t.id, { text: "Nota para el equipo", visibility: "internal" });
    await repo.addTicketMessage(ids.admin, t.id, { text: "Lo estamos revisando", visibility: "public" });
    const rows = await events(t.id);
    expect(rows.map((e) => `${e.type}:${e.visibility}`).sort()).toEqual(["note:internal", "reply:public"]);
    const sent = await db
      .select()
      .from(schema.notifications)
      .where(orm.eq(schema.notifications.staffId, ids.author));
    expect(sent.filter((n) => n.title.includes(t.code))).toHaveLength(1);
  });

  it("marks a duplicate and rejects chains", async () => {
    const original = await ticket(`Original ${tag}`);
    const copy = await ticket(`Copia ${tag}`);
    expect(await repo.markDuplicate(ids.admin, copy.id, original.id)).toEqual({ ok: true, data: null });
    const [row] = await db.select().from(schema.supportTickets).where(orm.eq(schema.supportTickets.id, copy.id));
    expect(row).toMatchObject({ status: "descartado", duplicateOf: original.id });
    const [event] = await events(copy.id);
    expect(event.type).toBe("duplicate");
    expect(event.payload.text).toBe(`Duplicada de ${original.code}`);

    const third = await ticket(`Tercera ${tag}`);
    expect((await repo.markDuplicate(ids.admin, third.id, copy.id)).ok).toBe(false);
    expect((await repo.markDuplicate(ids.admin, original.id, original.id)).ok).toBe(false);
  });

  it("searches code, title and description, and counts match the filters", async () => {
    const a = await ticket(`Buscable ${tag}`, "nada especial");
    const b = await ticket(`Otro titulo ${tag}`, `contiene palabra-${tag}`);

    const byTitle = await repo.listMejoras({ q: `Buscable ${tag}` }, null);
    expect(byTitle.rows.map((r) => r.id)).toEqual([a.id]);
    const byDescription = await repo.listMejoras({ q: `palabra-${tag}` }, null);
    expect(byDescription.rows.map((r) => r.id)).toEqual([b.id]);
    const byCode = await repo.listMejoras({ q: a.code }, null);
    expect(byCode.rows.map((r) => r.id)).toContain(a.id);

    await repo.updateTicket(ids.admin, b.id, { status: "planeado", assigneeId: ids.other });
    const filters = { q: tag, kind: "error" as const };
    const counts = await repo.getMejorasCounts(filters);
    const all = await repo.listMejoras(filters, null);
    expect(counts.total).toBe(all.rows.length);
    for (const status of ["nuevo", "planeado"] as const) {
      const listed = await repo.listMejoras({ ...filters, status }, null);
      expect(counts.byStatus[status]).toBe(listed.rows.length);
    }
    const unassigned = await repo.listMejoras({ q: tag, unassigned: true }, null);
    expect(unassigned.rows.map((r) => r.id)).not.toContain(b.id);
    expect((await repo.getMejorasCounts()).nuevo).toBeGreaterThanOrEqual(1);
  });

  it("pages by cursor without repeating rows", async () => {
    const before = (await repo.listMejoras({ sort: "created" }, null)).rows.length;
    for (let i = 0; i < 3; i++) await ticket(`Pagina ${i} ${tag}`);
    const first = await repo.listMejoras({ q: `Pagina`, sort: "priority" }, null);
    const seen = new Set(first.rows.map((r) => r.id));
    let next = first.nextCursor;
    while (next) {
      const page = await repo.listMejoras({ q: `Pagina`, sort: "priority" }, next);
      for (const r of page.rows) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
      }
      next = page.nextCursor;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});
