// @vitest-environment node
/**
 * notify() against a real Postgres (redesign BE §8.3, §9.3, §16): every
 * channel combination produces the right row, quiet hours defer the email
 * with `deliver_after`, dedupe, actor exclusion and inactive staff. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every staff row is
 * created per run and deleted afterwards (notifications cascade).
 */
import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

import { NOTIFICATION_DEFAULTS, notify, quietHoursEnd, resolveChannels } from "./notify";

const url = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

// America/Mexico_City is UTC-6 all year (no DST since 2022).
const NIGHT = new Date("2026-11-08T05:00:00.000Z"); // 23:00 local, Nov 7
const NOON = new Date("2026-11-07T18:00:00.000Z"); // 12:00 local
const QUIET = { from: "22:00", to: "07:00" };
const QUIET_END = new Date("2026-11-08T13:00:00.000Z"); // 07:00 local, Nov 8

describe("quietHoursEnd", () => {
  it("is null without quiet hours, outside them or for an empty window", () => {
    expect(quietHoursEnd(NIGHT, null)).toBeNull();
    expect(quietHoursEnd(NOON, QUIET)).toBeNull();
    expect(quietHoursEnd(NIGHT, { from: "08:00", to: "08:00" })).toBeNull();
  });

  it("ends tomorrow for a window that crosses midnight, entered before midnight", () => {
    expect(quietHoursEnd(NIGHT, QUIET)).toEqual(QUIET_END);
  });

  it("ends today for a window that crosses midnight, entered after midnight", () => {
    const early = new Date("2026-11-08T08:30:00.000Z"); // 02:30 local
    expect(quietHoursEnd(early, QUIET)).toEqual(QUIET_END);
  });

  it("handles a same-day window and the HH:MM:SS form Postgres returns", () => {
    expect(quietHoursEnd(NOON, { from: "11:00:00", to: "14:30:00" })).toEqual(new Date("2026-11-07T20:30:00.000Z"));
    // The end itself is outside the window.
    expect(quietHoursEnd(new Date("2026-11-07T20:30:00.000Z"), { from: "11:00", to: "14:30" })).toBeNull();
  });
});

describe("resolveChannels", () => {
  it("uses the defaults without a preference row and lets force override in-app and email", () => {
    expect(resolveChannels("vencimiento", null)).toEqual(NOTIFICATION_DEFAULTS.vencimiento);
    expect(resolveChannels("sistema", { inApp: true, email: true, digest: true }, { inApp: false, email: false })).toEqual({
      inApp: false,
      email: false,
      digest: true,
    });
  });
});

describe("notify() failures", () => {
  it("logs notify.failed and never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      select: () => {
        throw new Error("boom");
      },
    } as unknown as OwnerDb;
    await expect(notify(broken, [randomUUID()], { kind: "sistema", title: "x" }, { traceId: "t-1" })).resolves.toEqual({
      created: 0,
    });
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).toMatchObject({ msg: "notify.failed", trace_id: "t-1", kind: "sistema", count: 1 });
    spy.mockRestore();
  });

  it("skips the database when the actor is the only recipient", async () => {
    const untouched = {} as OwnerDb;
    const id = randomUUID();
    await expect(notify(untouched, [id, id], { kind: "mencion", title: "x", actorId: id })).resolves.toEqual({ created: 0 });
  });
});

describe.skipIf(!url)("notify() (test DB)", () => {
  const client = postgres(url ?? "", { max: 2 });
  const db = drizzle(client, { schema });
  const { notifications, notificationPreferences, staff, userPreferences } = schema;
  const staffIds: string[] = [];

  async function newStaff(label: string, opts: { active?: boolean } = {}): Promise<string> {
    const [row] = await db
      .insert(staff)
      .values({ name: `Notify ${run} ${label}`, active: opts.active ?? true })
      .returning({ id: staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function rowsFor(ids: string[]) {
    return db.select().from(notifications).where(inArray(notifications.staffId, ids));
  }

  beforeAll(async () => {
    await client`select 1`;
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(staff).where(inArray(staff.id, staffIds));
    await client.end();
  });

  const combos = [
    { inApp: false, email: false, digest: false },
    { inApp: true, email: false, digest: false },
    { inApp: false, email: true, digest: false },
    { inApp: false, email: false, digest: true },
    { inApp: true, email: true, digest: false },
    { inApp: true, email: false, digest: true },
    { inApp: false, email: true, digest: true },
    { inApp: true, email: true, digest: true },
  ];

  it.each(
    combos.flatMap((c) => [
      { ...c, quiet: false },
      { ...c, quiet: true },
    ])
  )("in-app $inApp · email $email · digest $digest · quiet hours $quiet", async ({ inApp, email, digest, quiet }) => {
    const id = await newStaff(`${inApp}-${email}-${digest}-${quiet}`);
    await db.insert(notificationPreferences).values({ staffId: id, kind: "sistema", inApp, email, digest });
    if (quiet) await db.insert(userPreferences).values({ staffId: id, quietFrom: QUIET.from, quietTo: QUIET.to });

    const res = await notify(db, [id], { kind: "sistema", title: "Aviso", body: "Detalle" }, { now: NIGHT });
    const rows = await rowsFor([id]);

    if (!inApp && !email && !digest) {
      expect(res.created).toBe(0);
      expect(rows).toHaveLength(0);
      return;
    }
    expect(res.created).toBe(1);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      kind: "sistema",
      title: "Aviso",
      body: "Detalle",
      inApp,
      digest,
      emailStatus: email ? "pending" : "none",
      digestedAt: null,
      emailedAt: null,
      readAt: null,
    });
    // Quiet hours defer only the email.
    expect(row.deliverAfter).toEqual(email && quiet ? QUIET_END : NIGHT);
  });

  it("uses NOTIFICATION_DEFAULTS when there is no preference row", async () => {
    const id = await newStaff("defaults");
    await notify(db, [id], { kind: "asignacion", title: "Te asignaron una tarea" }, { now: NOON });
    await notify(db, [id], { kind: "vencimiento", title: "Vence mañana" }, { now: NOON });
    const rows = await rowsFor([id]);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(byKind.asignacion).toMatchObject({ inApp: true, emailStatus: "pending", digest: false });
    expect(byKind.vencimiento).toMatchObject({ inApp: true, emailStatus: "none", digest: true });
  });

  it("force overrides the preference row and still respects quiet hours", async () => {
    const id = await newStaff("force");
    await db.insert(notificationPreferences).values({ staffId: id, kind: "recordatorio", inApp: true, email: false, digest: false });
    await db.insert(userPreferences).values({ staffId: id, quietFrom: QUIET.from, quietTo: QUIET.to });
    await notify(db, [id], { kind: "recordatorio", title: "Llamar", force: { inApp: false, email: true } }, { now: NIGHT });
    const [row] = await rowsFor([id]);
    expect(row).toMatchObject({ inApp: false, emailStatus: "pending", deliverAfter: QUIET_END });
  });

  it("stores the entity pair and url only when given", async () => {
    const id = await newStaff("entity");
    const taskId = randomUUID();
    await notify(db, [id], { kind: "comentario", title: "Nuevo comentario", entity: "task", entityId: taskId, url: `/tareas/${taskId}` });
    await notify(db, [id], { kind: "sistema", title: "Sin entidad", entity: "task" });
    const rows = await rowsFor([id]);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(byKind.comentario).toMatchObject({ entity: "task", entityId: taskId, url: `/tareas/${taskId}` });
    expect(byKind.sistema).toMatchObject({ entity: null, entityId: null, url: null });
  });

  it("dedupes per (staff, dedupe_key) and keeps rows without a key", async () => {
    const a = await newStaff("dedupe-a");
    const b = await newStaff("dedupe-b");
    const key = `vencimiento:${randomUUID()}:2026-11-09`;
    expect((await notify(db, [a], { kind: "vencimiento", title: "Vence", dedupeKey: key })).created).toBe(1);
    expect((await notify(db, [a, b], { kind: "vencimiento", title: "Vence", dedupeKey: key })).created).toBe(1);
    expect((await notify(db, [a], { kind: "vencimiento", title: "Vence", dedupeKey: key })).created).toBe(0);
    expect((await notify(db, [a], { kind: "sistema", title: "Sin llave" })).created).toBe(1);
    expect((await notify(db, [a], { kind: "sistema", title: "Sin llave" })).created).toBe(1);
    expect(await rowsFor([a])).toHaveLength(3);
    expect(await rowsFor([b])).toHaveLength(1);
  });

  it("never notifies the actor, skips inactive staff and repeated ids", async () => {
    const actor = await newStaff("actor");
    const other = await newStaff("other");
    const inactive = await newStaff("inactive", { active: false });
    const res = await notify(db, [actor, other, other, inactive], { kind: "mencion", title: "Te mencionaron", actorId: actor });
    expect(res.created).toBe(1);
    expect(await rowsFor([actor])).toHaveLength(0);
    expect(await rowsFor([inactive])).toHaveLength(0);
    expect(await rowsFor([other])).toHaveLength(1);
  });

  it("returns 0 for unknown staff ids without throwing", async () => {
    await expect(notify(db, [randomUUID()], { kind: "sistema", title: "x" })).resolves.toEqual({ created: 0 });
  });
});
