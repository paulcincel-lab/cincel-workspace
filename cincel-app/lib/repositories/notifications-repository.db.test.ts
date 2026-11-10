// @vitest-environment node
/**
 * `summarizeNotifications` against a real Postgres (Mi espacio Analítico,
 * "Bandeja por tipo"): unread and total in-app rows per kind of the given
 * staff only, with the newest `created_at`. Runs only when TEST_DATABASE_URL
 * points at a migrated database. Rows belong to per-run staff deleted
 * afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("summarizeNotifications (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/notifications-repository");

  let ana = "";
  let beto = "";

  const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 10, day, hour, 0, 0));

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([{ name: `Resumen bandeja ${run} A` }, { name: `Resumen bandeja ${run} B` }])
      .returning({ id: schema.staff.id });
    ana = rows[0]!.id;
    beto = rows[1]!.id;
    await db.insert(schema.notifications).values([
      { staffId: ana, kind: "mencion", title: "m1", inApp: true, createdAt: at(2) },
      { staffId: ana, kind: "mencion", title: "m2", inApp: true, createdAt: at(7, 9), readAt: at(7, 10) },
      { staffId: ana, kind: "mencion", title: "m3", inApp: true, createdAt: at(5) },
      { staffId: ana, kind: "asignacion", title: "a1", inApp: true, createdAt: at(3), readAt: at(3, 13) },
      // Not in the Bandeja: email-only rows.
      { staffId: ana, kind: "asignacion", title: "a2", inApp: false, createdAt: at(8) },
      { staffId: ana, kind: "sistema", title: "s1", inApp: false, createdAt: at(8) },
      // Another person's rows.
      { staffId: beto, kind: "mencion", title: "bm", inApp: true, createdAt: at(9) },
      { staffId: beto, kind: "vencimiento", title: "bv", inApp: true, createdAt: at(9) },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.staff).where(inArray(schema.staff.id, [ana, beto]));
  });

  const byKind = async (staffId: string) =>
    new Map((await repo.summarizeNotifications(db, staffId)).map((row) => [row.kind, row]));

  it("summarizeNotifications counts unread and total per kind", async () => {
    const summary = await byKind(ana);
    expect(summary.get("mencion")).toMatchObject({ unread: 2, total: 3 });
    expect(summary.get("asignacion")).toMatchObject({ unread: 0, total: 1 });
  });

  it("ignores other staff and non in-app rows", async () => {
    const summary = await byKind(ana);
    expect([...summary.keys()].sort()).toEqual(["asignacion", "mencion"]);
    expect(summary.has("vencimiento")).toBe(false);
    expect(summary.has("sistema")).toBe(false);
    const other = await byKind(beto);
    expect(other.get("mencion")).toMatchObject({ unread: 1, total: 1 });
    expect(other.has("asignacion")).toBe(false);
  });

  it("latestAt is the newest createdAt", async () => {
    const summary = await byKind(ana);
    expect(summary.get("mencion")?.latestAt).toBe(at(7, 9).toISOString());
    // The email-only asignacion of the 8th does not count.
    expect(summary.get("asignacion")?.latestAt).toBe(at(3).toISOString());
  });
});
