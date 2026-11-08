// @vitest-environment node
/**
 * Shell and sidebar reads (Query Migration Phase 2, #936) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database;
 * every test runs inside a transaction that is rolled back.
 *
 * - `loadShellBadges` counts only the caller's open tasks, unread
 *   notifications and due reminders, in 3 statements.
 * - `countUnreadNotifications` equals the old unread list count.
 * - One `(staff)` layout render runs ≤ 8 statements and no task list
 *   (`listTasks` / `listMyTasks`).
 * - `GET /api/shell/badges`: 401 without a session, 200 with the private
 *   no-store header for staff, and the row counts are the same before and
 *   after a call (no side effects).
 */
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { ShellBadges } from "@/lib/types/shell";

import { countQueries } from "../helpers/count-queries";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// The layout's JSX is not rendered here: only its loaders run.
vi.mock("@/components/shell/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));

const spies = vi.hoisted(() => ({ listTasks: vi.fn(), listMyTasks: vi.fn() }));
vi.mock("@/lib/repositories/tasks-repository", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/repositories/tasks-repository")>();
  spies.listTasks.mockImplementation(real.listTasks);
  spies.listMyTasks.mockImplementation(real.listMyTasks);
  return { ...real, listTasks: spies.listTasks, listMyTasks: spies.listMyTasks };
});

import StaffLayout from "@/app/(staff)/layout";
import { GET } from "@/app/api/shell/badges/route";
import { asViewer, type TestViewer } from "@/lib/query/test-utils";
import { countUnreadNotifications, listInboxNotifications } from "@/lib/repositories/notifications-repository";
import { loadShellBadges } from "@/lib/shell/badges";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

/** The `requireCapabilityUser()` shape for a staff row. */
function capabilityUser(id: string, name: string, access: AuthenticatedUser["access"] = "Colaborador"): AuthenticatedUser {
  return {
    member: {
      id,
      name,
      role: "Diseño",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access,
  };
}

describe.skipIf(!url)("shell badges and layout reads (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = { anaId: string; betoId: string; projectId: string };

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const [ana] = await tx.insert(schema.staff).values({ name: "Ana Badges" }).returning();
        const [beto] = await tx.insert(schema.staff).values({ name: "Beto Badges" }).returning();
        const [contact] = await tx.insert(schema.contacts).values({ type: "cliente", name: "Cliente Badges" }).returning();
        const [project] = await tx
          .insert(schema.projects)
          .values({ name: "Proyecto Badges", clientId: contact.id })
          .returning();
        await fn(tx, { anaId: ana.id, betoId: beto.id, projectId: project.id });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  /** Ana: 2 open tasks, 1 done; 3 unread + 1 read notifications; 2 reminders still due today, 1 fired. Beto: his own of each. */
  async function seed(tx: Tx, ctx: Ctx, now: Date) {
    const task = (managerId: string, title: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) => ({
      projectId: ctx.projectId,
      kind: "usuario" as const,
      title,
      createdById: managerId,
      managerId,
      ...extra,
    });
    await tx.insert(schema.tasks).values([
      task(ctx.anaId, "Ana abierta 1"),
      task(ctx.anaId, "Ana abierta 2", { status: "en_proceso" }),
      task(ctx.anaId, "Ana terminada", { status: "completado" }),
      task(ctx.betoId, "Beto abierta"),
      task(ctx.betoId, "Beto abierta 2"),
      task(ctx.betoId, "Beto abierta 3"),
    ]);

    const notification = (staffId: string, title: string, readAt: Date | null = null) => ({
      staffId,
      kind: "asignacion" as const,
      title,
      inApp: true,
      readAt,
    });
    await tx.insert(schema.notifications).values([
      notification(ctx.anaId, "Ana 1"),
      notification(ctx.anaId, "Ana 2"),
      notification(ctx.anaId, "Ana 3"),
      notification(ctx.anaId, "Ana leída", now),
      notification(ctx.betoId, "Beto 1"),
    ]);

    const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);
    await tx.insert(schema.reminders).values([
      { staffId: ctx.anaId, text: "Llamar", dueAt: inMinutes(1) },
      { staffId: ctx.anaId, text: "Revisar", dueAt: inMinutes(2) },
      { staffId: ctx.anaId, text: "Ya enviado", dueAt: inMinutes(3), firedAt: now },
      { staffId: ctx.betoId, text: "Beto", dueAt: inMinutes(1) },
    ]);
  }

  /** A time of day with room for the seeded reminders before the local day ends. */
  function midday(): Date {
    const now = new Date();
    now.setUTCHours(18, 0, 0, 0); // 12:00 in Mexico City
    return now;
  }

  it("loadShellBadges counts only the caller's tasks, notifications and reminders, in 3 statements", async () => {
    await inTx(async (tx, ctx) => {
      const now = midday();
      await seed(tx, ctx, now);

      const { result, count } = await countQueries(() => loadShellBadges(capabilityUser(ctx.anaId, "Ana Badges"), now));
      expect(result.tareasOpen).toBe(2);
      expect(result.bandeja.unreadCount).toBe(3);
      expect(result.bandeja.dueReminders).toHaveLength(2);
      expect(count).toBe(3);

      const beto = await loadShellBadges(capabilityUser(ctx.betoId, "Beto Badges"), now);
      expect(beto.tareasOpen).toBe(3);
      expect(beto.bandeja.unreadCount).toBe(1);
      expect(beto.bandeja.dueReminders).toHaveLength(1);
    });
  });

  it("countUnreadNotifications equals the old unread list count", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx, midday());
      for (const staffId of [ctx.anaId, ctx.betoId]) {
        const list = await listInboxNotifications(tx, staffId, { unreadOnly: true, limit: 1000 });
        const { result, count } = await countQueries(() => countUnreadNotifications(tx, staffId));
        expect(result).toBe(list.length);
        expect(count).toBe(1);
      }
    });
  });

  it("one (staff) layout render runs ≤ 8 statements and no task list", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx, midday());
      spies.listTasks.mockClear();
      spies.listMyTasks.mockClear();
      const viewer: TestViewer = { id: ctx.anaId, name: "Ana Badges", access: "Colaborador" };

      const { count } = await asViewer(viewer, () => countQueries(() => StaffLayout({ children: null })));
      expect(count).toBeLessThanOrEqual(8);
      expect(spies.listTasks).not.toHaveBeenCalled();
      expect(spies.listMyTasks).not.toHaveBeenCalled();
    });
  });

  it("GET /api/shell/badges: 401 without a session", async () => {
    await inTx(async () => {
      const res = await asViewer(null, () => GET());
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  });

  it("GET /api/shell/badges: 200 for staff with the header, the caller's counts, and no writes", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx, midday());
      const rowCounts = async () => {
        const [row] = await tx.execute<{ tasks: number; notifications: number; unread: number; reminders: number }>(dsql`
          select
            (select count(*)::int from ${schema.tasks}) as tasks,
            (select count(*)::int from ${schema.notifications}) as notifications,
            (select count(*)::int from ${schema.notifications} where read_at is null) as unread,
            (select count(*)::int from ${schema.reminders} where fired_at is null) as reminders
        `);
        return row;
      };
      const before = await rowCounts();

      const res = await asViewer({ id: ctx.anaId, name: "Ana Badges", access: "Colaborador" }, () => GET());
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const body = (await res.json()) as ShellBadges;
      expect(body.tareasOpen).toBe(2);
      expect(body.bandeja.unreadCount).toBe(3);

      expect(await rowCounts()).toEqual(before);
    });
  });

  it("GET /api/shell/badges: 403 for a first-access session", async () => {
    await inTx(async (_tx, ctx) => {
      const res = await asViewer({ id: ctx.anaId, access: "Colaborador", status: "pending_first_access" }, () => GET());
      expect(res.status).toBe(403);
    });
  });
});
