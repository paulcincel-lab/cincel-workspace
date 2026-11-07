// @vitest-environment node
/**
 * Bandeja notifications and channel preferences (redesign BE §7.4, §16):
 * pagination and cursor, `unreadOnly`, `kinds`, owner isolation (the
 * notifications instance of the owner-scoped suite), mark-read ignoring
 * foreign ids, preference defaults and `INVALID`. The DB part runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`);
 * every staff row it creates carries a per-run marker and is deleted
 * afterwards (notifications and preferences cascade).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "00000000-0000-4000-8000-000000000000" }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", () => cache);
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Integrante",
      role: "Diseño",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "integrante@cincel.example",
    access: "Colaborador",
  })),
}));

const KINDS = [
  "asignacion",
  "mencion",
  "vencimiento",
  "comentario",
  "aprobacion_cliente",
  "recordatorio",
  "sistema",
] as const;

describe("notifications actions: input validation", async () => {
  const actions = await import("@/lib/actions/notifications-actions");
  const { IMPLEMENTED } = await import("@/lib/actions/notifications-actions.flags");

  it("flags every action as implemented", () => {
    expect(Object.values(IMPLEMENTED).every(Boolean)).toBe(true);
  });

  it.each(["nope", "2026-11-07T10:00:00.000Z", "2026-11-07T10:00:00.000Z_not-a-uuid", `yesterday_${randomUUID()}`])(
    "rejects the malformed cursor %s with INVALID",
    async (cursor) => {
      await expect(actions.fetchNotificationsAction({ cursor })).rejects.toThrow(/^INVALID/);
    },
  );

  it("rejects unknown kinds in the filter with INVALID", async () => {
    await expect(
      actions.fetchNotificationsAction({ kinds: ["desconocido" as (typeof KINDS)[number]] }),
    ).rejects.toThrow(/^INVALID/);
  });

  it("rejects non-uuid ids when marking read with INVALID", async () => {
    await expect(actions.markNotificationsReadAction(["abc"])).rejects.toThrow(/^INVALID/);
  });

  it.each([
    { from: "25:00", to: "07:00" },
    { from: "22:00", to: "7:00" },
    { from: "22:00", to: "22:00" },
    { from: "22:00" } as { from: string; to: string },
  ])("rejects malformed quiet hours %o with INVALID", async (quietHours) => {
    await expect(actions.updateNotificationPreferencesAction({ rows: [], quietHours })).rejects.toThrow(/^INVALID/);
  });

  it("rejects unknown and repeated kinds in the preferences with INVALID", async () => {
    await expect(
      actions.updateNotificationPreferencesAction({
        rows: [{ kind: "desconocido" as (typeof KINDS)[number], inApp: true, email: false, digest: false }],
        quietHours: null,
      }),
    ).rejects.toThrow(/^INVALID/);
    await expect(
      actions.updateNotificationPreferencesAction({
        rows: [
          { kind: "mencion", inApp: true, email: false, digest: false },
          { kind: "mencion", inApp: false, email: true, digest: false },
        ],
        quietHours: null,
      }),
    ).rejects.toThrow(/^INVALID/);
  });
});

describe.skipIf(!url)("notifications actions (test DB)", async () => {
  const { eq, inArray, and, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = await import("@/lib/actions/notifications-actions");
  const { NOTIFICATION_DEFAULTS } = await import("@/lib/notifications/notify");

  const run = randomUUID().slice(0, 8);
  const staffIds: string[] = [];

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Bandeja ${run} ${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  /** Inserts `n` rows for `staffId`, one second apart (the newest is the last one). */
  async function seed(
    staffId: string,
    n: number,
    values: Partial<typeof schema.notifications.$inferInsert> = {},
    base = Date.UTC(2026, 10, 1, 12, 0, 0),
  ): Promise<string[]> {
    const rows = Array.from({ length: n }, (_, i) => ({
      staffId,
      kind: "sistema" as const,
      title: `Aviso ${i}`,
      inApp: true,
      createdAt: new Date(base + i * 1000),
      ...values,
    }));
    const inserted = await db.insert(schema.notifications).values(rows).returning({ id: schema.notifications.id });
    return inserted.map((row) => row.id);
  }

  function actAs(staffId: string) {
    session.memberId = staffId;
  }

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  beforeEach(() => {
    cache.revalidatePath.mockClear();
  });

  describe("fetchNotificationsAction", () => {
    it("pages 30 at a time, newest first, with a stable cursor and no repeats", async () => {
      const me = await makeStaff("paginacion");
      // Two rows share one timestamp so the id tie-breaker is exercised.
      await seed(me, 64);
      await seed(me, 1, { title: "Empate" }, Date.UTC(2026, 10, 1, 12, 0, 30));
      actAs(me);

      const first = await actions.fetchNotificationsAction({});
      expect(first.items).toHaveLength(30);
      expect(first.nextCursor).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z_[0-9a-f-]{36}$/);
      expect(first.unreadCount).toBe(65);

      const second = await actions.fetchNotificationsAction({ cursor: first.nextCursor! });
      expect(second.items).toHaveLength(30);
      const third = await actions.fetchNotificationsAction({ cursor: second.nextCursor! });
      expect(third.items).toHaveLength(5);
      expect(third.nextCursor).toBeNull();

      const all = [...first.items, ...second.items, ...third.items];
      expect(new Set(all.map((item) => item.id)).size).toBe(65);
      const times = all.map((item) => Date.parse(item.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      // Same cursor → same page.
      const again = await actions.fetchNotificationsAction({ cursor: first.nextCursor! });
      expect(again.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
    });

    it("returns null nextCursor when everything fits in one page", async () => {
      const me = await makeStaff("una-pagina");
      await seed(me, 30);
      actAs(me);
      const page = await actions.fetchNotificationsAction({});
      expect(page.items).toHaveLength(30);
      expect(page.nextCursor).toBeNull();
    });

    it("never returns rows with in_app = false, nor counts them as unread", async () => {
      const me = await makeStaff("solo-correo");
      await seed(me, 2);
      await seed(me, 3, { inApp: false, emailStatus: "pending" });
      await seed(me, 1, { inApp: false, digest: true });
      actAs(me);
      const page = await actions.fetchNotificationsAction({});
      expect(page.items).toHaveLength(2);
      expect(page.unreadCount).toBe(2);
    });

    it("filters by unreadOnly and kinds, and unreadCount ignores the filters", async () => {
      const me = await makeStaff("filtros");
      await seed(me, 2, { kind: "mencion" });
      await seed(me, 3, { kind: "asignacion" });
      await seed(me, 4, { kind: "comentario", readAt: new Date() });
      actAs(me);

      const unread = await actions.fetchNotificationsAction({ unreadOnly: true });
      expect(unread.items).toHaveLength(5);
      expect(unread.items.every((item) => item.readAt === null)).toBe(true);

      const mentions = await actions.fetchNotificationsAction({ kinds: ["mencion"] });
      expect(mentions.items.map((item) => item.kind)).toEqual(["mencion", "mencion"]);
      expect(mentions.unreadCount).toBe(5);

      const readComments = await actions.fetchNotificationsAction({ kinds: ["comentario"], unreadOnly: true });
      expect(readComments.items).toEqual([]);

      const several = await actions.fetchNotificationsAction({ kinds: ["mencion", "comentario"] });
      expect(several.items).toHaveLength(6);

      const empty = await actions.fetchNotificationsAction({ kinds: [] });
      expect(empty.items).toHaveLength(9);
    });

    it("maps rows to NotificationItem", async () => {
      const me = await makeStaff("forma");
      const taskId = randomUUID();
      await seed(me, 1, {
        kind: "asignacion",
        title: "Te asignaron una tarea",
        body: "Plano de cocina",
        entity: "task",
        entityId: taskId,
        url: `/tareas/${taskId}`,
      });
      actAs(me);
      const [item] = (await actions.fetchNotificationsAction({})).items;
      expect(item).toMatchObject({
        kind: "asignacion",
        title: "Te asignaron una tarea",
        body: "Plano de cocina",
        entity: "task",
        entityId: taskId,
        url: `/tareas/${taskId}`,
        readAt: null,
      });
      expect(Number.isNaN(Date.parse(item!.createdAt))).toBe(false);
    });

    it("never returns rows of other staff (owner isolation)", async () => {
      const me = await makeStaff("dueno");
      const other = await makeStaff("ajeno");
      await seed(me, 1, { title: "Mío" });
      await seed(other, 5, { title: "Ajeno" });
      actAs(me);
      const page = await actions.fetchNotificationsAction({});
      expect(page.items.map((item) => item.title)).toEqual(["Mío"]);
      expect(page.unreadCount).toBe(1);
    });
  });

  describe("markNotificationsReadAction", () => {
    it("marks only the caller's ids, ignores foreign ids and returns the caller's unreadCount", async () => {
      const me = await makeStaff("leer");
      const other = await makeStaff("leer-ajeno");
      const mine = await seed(me, 3);
      const theirs = await seed(other, 2);
      actAs(me);

      const result = await actions.markNotificationsReadAction([mine[0]!, ...theirs]);
      expect(result).toEqual({ unreadCount: 2 });
      expect(cache.revalidatePath).toHaveBeenCalledWith("/mi-espacio");

      const theirUnread = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(and(eq(schema.notifications.staffId, other), isNull(schema.notifications.readAt)));
      expect(theirUnread).toHaveLength(2);
    });

    it("keeps the first read_at when a row is marked twice", async () => {
      const me = await makeStaff("dos-veces");
      const [id] = await seed(me, 1);
      actAs(me);
      await actions.markNotificationsReadAction([id!]);
      const [before] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id!));
      await actions.markNotificationsReadAction([id!]);
      const [after] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id!));
      expect(after!.readAt?.getTime()).toBe(before!.readAt?.getTime());
    });

    it('"all" marks only the caller\'s rows', async () => {
      const me = await makeStaff("todas");
      const other = await makeStaff("todas-ajeno");
      await seed(me, 4);
      await seed(other, 3);
      actAs(me);

      expect(await actions.markNotificationsReadAction("all")).toEqual({ unreadCount: 0 });

      actAs(other);
      const theirs = await actions.fetchNotificationsAction({ unreadOnly: true });
      expect(theirs.items).toHaveLength(3);
      expect(theirs.unreadCount).toBe(3);
    });

    it("an empty id list changes nothing", async () => {
      const me = await makeStaff("vacia");
      await seed(me, 2);
      actAs(me);
      expect(await actions.markNotificationsReadAction([])).toEqual({ unreadCount: 2 });
    });
  });

  describe("preferences", () => {
    it("returns exactly one row per kind with the defaults when nothing is stored", async () => {
      const me = await makeStaff("defaults");
      actAs(me);
      const prefs = await actions.fetchNotificationPreferencesAction();
      expect(prefs.rows.map((row) => row.kind).sort()).toEqual([...KINDS].sort());
      for (const row of prefs.rows) {
        expect({ inApp: row.inApp, email: row.email, digest: row.digest }).toEqual(NOTIFICATION_DEFAULTS[row.kind]);
      }
      expect(prefs.quietHours).toBeNull();
    });

    it("saves the matrix and quiet hours; a second fetch returns the saved values", async () => {
      const me = await makeStaff("guardar");
      actAs(me);
      const saved = await actions.updateNotificationPreferencesAction({
        rows: [
          { kind: "mencion", inApp: false, email: true, digest: false },
          { kind: "vencimiento", inApp: true, email: true, digest: false },
        ],
        quietHours: { from: "22:00", to: "07:30" },
      });
      expect(cache.revalidatePath).toHaveBeenCalledWith("/ajustes/notificaciones");

      const fetched = await actions.fetchNotificationPreferencesAction();
      expect(fetched).toEqual(saved);
      expect(fetched.rows).toHaveLength(7);
      expect(fetched.rows.find((row) => row.kind === "mencion")).toEqual({
        kind: "mencion",
        inApp: false,
        email: true,
        digest: false,
      });
      expect(fetched.rows.find((row) => row.kind === "vencimiento")).toEqual({
        kind: "vencimiento",
        inApp: true,
        email: true,
        digest: false,
      });
      expect(fetched.rows.find((row) => row.kind === "sistema")).toEqual({
        kind: "sistema",
        ...NOTIFICATION_DEFAULTS.sistema,
      });
      expect(fetched.quietHours).toEqual({ from: "22:00", to: "07:30" });

      // Upsert: saving again overwrites, clearing quiet hours stores null.
      await actions.updateNotificationPreferencesAction({
        rows: [{ kind: "mencion", inApp: true, email: false, digest: true }],
        quietHours: null,
      });
      const again = await actions.fetchNotificationPreferencesAction();
      expect(again.rows.find((row) => row.kind === "mencion")).toEqual({
        kind: "mencion",
        inApp: true,
        email: false,
        digest: true,
      });
      expect(again.rows.find((row) => row.kind === "vencimiento")?.email).toBe(true);
      expect(again.quietHours).toBeNull();

      const stored = await db
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.staffId, me));
      expect(stored).toHaveLength(2);
    });

    it("keeps the caller's other preference columns when saving quiet hours", async () => {
      const me = await makeStaff("conservar");
      await db.insert(schema.userPreferences).values({ staffId: me, mode: "dark", density: "compacta" });
      actAs(me);
      await actions.updateNotificationPreferencesAction({ rows: [], quietHours: { from: "21:00", to: "06:00" } });
      const [row] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.staffId, me));
      expect(row).toMatchObject({ mode: "dark", density: "compacta" });
      expect(row!.quietFrom?.slice(0, 5)).toBe("21:00");
      expect(row!.quietTo?.slice(0, 5)).toBe("06:00");
    });

    it("reads and writes only the caller's rows (owner isolation)", async () => {
      const me = await makeStaff("prefs-dueno");
      const other = await makeStaff("prefs-ajeno");
      actAs(other);
      await actions.updateNotificationPreferencesAction({
        rows: KINDS.map((kind) => ({ kind, inApp: false, email: false, digest: true })),
        quietHours: { from: "20:00", to: "08:00" },
      });

      actAs(me);
      const mine = await actions.fetchNotificationPreferencesAction();
      for (const row of mine.rows) {
        expect({ inApp: row.inApp, email: row.email, digest: row.digest }).toEqual(NOTIFICATION_DEFAULTS[row.kind]);
      }
      expect(mine.quietHours).toBeNull();

      await actions.updateNotificationPreferencesAction({
        rows: [{ kind: "sistema", inApp: true, email: true, digest: false }],
        quietHours: null,
      });
      actAs(other);
      const theirs = await actions.fetchNotificationPreferencesAction();
      expect(theirs.rows.find((row) => row.kind === "sistema")).toEqual({
        kind: "sistema",
        inApp: false,
        email: false,
        digest: true,
      });
      expect(theirs.quietHours).toEqual({ from: "20:00", to: "08:00" });
    });
  });
});
