// @vitest-environment node
/**
 * Cron jobs `notifications-deliver` and `daily-digest` (redesign BE §9.3, §13)
 * against a real Postgres. Runs only when TEST_DATABASE_URL points at a
 * migrated database. Rows are created for per-run staff and use instants far
 * in the past, so other rows of the database never fall into the tested
 * windows; everything is deleted afterwards (staff deletes cascade).
 */
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_THREADS_KEPT,
  dailyDigestJob,
  GMAIL_THREADS_KEPT,
  purgeOldNotifications,
  trimAssistantThreads,
  trimGmailThreads,
} from "@/lib/cron/jobs/daily-digest";
import { notificationsDeliverJob } from "@/lib/cron/jobs/notifications-deliver";
import { runTick } from "@/lib/cron/tick";
import * as schema from "@/lib/db/schema";
import type { MailMessage, SendMailResult } from "@/lib/email";
import { DELIVER_BATCH_LIMIT, deliverPendingEmails, sendDailyDigests } from "@/lib/notifications/digest";
import type { NotificationKind } from "@/lib/types/redesign";

const url = process.env.TEST_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const ORIGIN = "https://app.cincel.test";
const TZ = "America/Mexico_City";

type NewNotification = typeof schema.notifications.$inferInsert;

describe.skipIf(!url)("cron jobs (test DB)", () => {
  const client = postgres(url ?? "", { max: 2, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const staffIds: string[] = [];
  const windowKeys: string[] = [];

  async function newStaff(label: string, values: Partial<typeof schema.staff.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Cron ${label} ${RUN}`, email: `cron-${label}-${RUN}@example.test`, ...values })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function addNotification(staffId: string, values: Partial<NewNotification> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.notifications)
      .values({ staffId, kind: "asignacion", title: `Aviso ${RUN}`, inApp: true, ...values })
      .returning({ id: schema.notifications.id });
    return row.id;
  }

  async function notification(id: string) {
    const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    return row;
  }

  function sender(result: (message: MailMessage) => SendMailResult = () => ({ sent: true })) {
    const sent: MailMessage[] = [];
    const send = vi.fn(async (message: MailMessage) => {
      sent.push(message);
      return result(message);
    });
    return { send, sent };
  }

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    if (windowKeys.length) await db.delete(schema.cronRuns).where(inArray(schema.cronRuns.windowKey, windowKeys));
    await db.delete(schema.cronLeases).where(dsql`${schema.cronLeases.job} like ${`test-jobs-${RUN}-%`}`);
    await client.end({ timeout: 5 });
  });

  describe("notifications-deliver", () => {
    // Every row of this block is due at 1999-12-31; `now` is the next day.
    const due = new Date("1999-12-31T12:00:00Z");
    const now = new Date("2000-01-01T12:00:00Z");
    let active = "";
    let inactive = "";
    let noEmail = "";

    beforeAll(async () => {
      active = await newStaff("deliver");
      inactive = await newStaff("deliver-off", { active: false });
      noEmail = await newStaff("deliver-noemail", { email: null });
    });

    it("sends due pending rows, skips the rest and records sent / failed", async () => {
      const ok = await addNotification(active, {
        title: `Te asignaron una tarea ${RUN}`,
        body: "Revisar planos",
        url: "/tareas?t=1",
        emailStatus: "pending",
        deliverAfter: due,
      });
      const smtpFails = await addNotification(active, {
        title: `Falla ${RUN}`,
        emailStatus: "pending",
        deliverAfter: due,
      });
      const deferred = await addNotification(active, {
        emailStatus: "pending",
        deliverAfter: new Date("2000-01-01T18:00:00Z"),
      });
      const offStaff = await addNotification(inactive, { emailStatus: "pending", deliverAfter: due });
      const missingEmail = await addNotification(noEmail, { emailStatus: "pending", deliverAfter: due });
      const inAppOnly = await addNotification(active, { emailStatus: "none", deliverAfter: due });

      const { send, sent } = sender((m) => (m.subject.startsWith("Falla") ? { sent: false, reason: "failed" } : { sent: true }));
      const result = await deliverPendingEmails(db, now, { send, origin: ORIGIN });

      expect(result.count).toBe(4);
      expect(send).toHaveBeenCalledTimes(2);
      const mail = sent.find((m) => m.subject === `Te asignaron una tarea ${RUN}`)!;
      expect(mail.to).toBe(`cron-deliver-${RUN}@example.test`);
      expect(mail.text).toContain("Revisar planos");
      expect(mail.text).toContain(`${ORIGIN}/tareas?t=1`);
      expect(mail.html).toContain("Abrir en Cincel");

      expect(await notification(ok)).toMatchObject({ emailStatus: "sent", emailError: null, emailedAt: now });
      expect(await notification(smtpFails)).toMatchObject({ emailStatus: "failed", emailError: "failed" });
      expect(await notification(deferred)).toMatchObject({ emailStatus: "pending", emailedAt: null });
      expect(await notification(offStaff)).toMatchObject({ emailStatus: "failed", emailError: "inactive" });
      expect(await notification(missingEmail)).toMatchObject({ emailStatus: "failed", emailError: "no_email" });
      expect(await notification(inAppOnly)).toMatchObject({ emailStatus: "none" });

      // Nothing is sent twice.
      const again = sender();
      expect((await deliverPendingEmails(db, now, { send: again.send, origin: ORIGIN })).count).toBe(0);
      expect(again.send).not.toHaveBeenCalled();
    });

    it("records not_configured when SMTP is not set up", async () => {
      const id = await addNotification(active, { emailStatus: "pending", deliverAfter: due });
      const { send } = sender(() => ({ sent: false, reason: "not_configured" }));
      await deliverPendingEmails(db, now, { send, origin: ORIGIN });
      expect(await notification(id)).toMatchObject({ emailStatus: "failed", emailError: "not_configured" });
    });

    it(`sends at most ${DELIVER_BATCH_LIMIT} rows per run, oldest deliver_after first`, async () => {
      const bulk = await newStaff("deliver-bulk");
      const base = new Date("1999-06-01T00:00:00Z").getTime();
      const values: NewNotification[] = Array.from({ length: DELIVER_BATCH_LIMIT + 1 }, (_, i) => ({
        staffId: bulk,
        kind: "asignacion" as NotificationKind,
        title: `Lote ${i} ${RUN}`,
        inApp: true,
        emailStatus: "pending" as const,
        deliverAfter: new Date(base + i * 1000),
      }));
      await db.insert(schema.notifications).values(values);

      const { send } = sender();
      expect((await deliverPendingEmails(db, now, { send, origin: ORIGIN })).count).toBe(DELIVER_BATCH_LIMIT);

      const left = await db
        .select({ title: schema.notifications.title })
        .from(schema.notifications)
        .where(and(eq(schema.notifications.staffId, bulk), eq(schema.notifications.emailStatus, "pending")));
      expect(left).toEqual([{ title: `Lote ${DELIVER_BATCH_LIMIT} ${RUN}` }]);
    });

    it("is registered as an every-tick job that delivers through the tick", async () => {
      expect(notificationsDeliverJob.due(now, TZ)).toEqual({ run: true });
      const report = await runTick(now, { db, jobs: [notificationsDeliverJob], leaseJob: `test-jobs-${RUN}-deliver` });
      expect(report.acquired).toBe(true);
      expect(report.ran.map((r) => r.job)).toEqual(["notifications-deliver"]);
    });
  });

  describe("daily digest", () => {
    // 2001-03-01 07:45 local (UTC-6).
    const now = new Date("2001-03-01T13:45:00Z");
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    it("sends one resumen-diario per staff with digest rows of the last 24 h and sets digested_at", async () => {
      const ana = await newStaff("digest-ana");
      const beto = await newStaff("digest-beto");
      const quiet = await newStaff("digest-quiet");

      const anaVence = await addNotification(ana, {
        kind: "vencimiento",
        title: `Vence mañana ${RUN}`,
        url: "/tareas?t=2",
        digest: true,
        createdAt: hoursAgo(2),
      });
      const anaComenta = await addNotification(ana, {
        kind: "comentario",
        title: `Nuevo comentario ${RUN}`,
        digest: true,
        inApp: false,
        createdAt: hoursAgo(5),
      });
      const anaOld = await addNotification(ana, {
        kind: "comentario",
        title: `Viejo ${RUN}`,
        digest: true,
        createdAt: hoursAgo(30),
      });
      const anaDone = await addNotification(ana, {
        kind: "comentario",
        digest: true,
        digestedAt: hoursAgo(20),
        createdAt: hoursAgo(21),
      });
      const betoVence = await addNotification(beto, {
        kind: "vencimiento",
        title: `Vencida ${RUN}`,
        digest: true,
        createdAt: hoursAgo(1),
      });
      const quietRow = await addNotification(quiet, { kind: "asignacion", digest: false, createdAt: hoursAgo(1) });

      const { send, sent } = sender();
      const result = await sendDailyDigests(db, now, { send, origin: ORIGIN });

      expect(result.count).toBe(2);
      expect(sent.map((m) => m.to).sort()).toEqual(
        [`cron-digest-ana-${RUN}@example.test`, `cron-digest-beto-${RUN}@example.test`].sort()
      );
      const anaMail = sent.find((m) => m.to === `cron-digest-ana-${RUN}@example.test`)!;
      expect(anaMail.subject).toBe("Tu resumen de hoy en Cincel");
      expect(anaMail.text).toContain(`Vence mañana ${RUN}`);
      expect(anaMail.text).toContain(`Nuevo comentario ${RUN}`);
      expect(anaMail.text).not.toContain(`Viejo ${RUN}`);

      expect((await notification(anaVence)).digestedAt).toEqual(now);
      expect((await notification(anaComenta)).digestedAt).toEqual(now);
      expect((await notification(betoVence)).digestedAt).toEqual(now);
      expect((await notification(anaOld)).digestedAt).toBeNull();
      expect((await notification(anaDone)).digestedAt).toEqual(hoursAgo(20));
      expect((await notification(quietRow)).digestedAt).toBeNull();

      // A second run finds nothing left to digest.
      const again = sender();
      expect((await sendDailyDigests(db, now, { send: again.send, origin: ORIGIN })).count).toBe(0);
      expect(again.send).not.toHaveBeenCalled();
    });

    it("leaves rows undigested when the email is not sent", async () => {
      const carla = await newStaff("digest-carla");
      const id = await addNotification(carla, { kind: "vencimiento", digest: true, createdAt: hoursAgo(3) });
      const { send } = sender(() => ({ sent: false, reason: "failed" }));
      const at = new Date(now.getTime() + 60_000);
      expect((await sendDailyDigests(db, at, { send, origin: ORIGIN })).count).toBe(0);
      expect((await notification(id)).digestedAt).toBeNull();
    });

    it("runs once per local day through the tick, at 07:30 or later", async () => {
      const early = new Date("2001-03-02T13:29:00Z");
      const onTime = new Date("2001-03-02T13:30:00Z");
      windowKeys.push("daily-digest:2001-03-02");
      const lease = `test-jobs-${RUN}-digest`;

      const before = await runTick(early, { db, jobs: [dailyDigestJob], leaseJob: lease, tz: TZ });
      expect(before.skipped).toEqual([{ job: "daily-digest", reason: "not_due" }]);

      const first = await runTick(onTime, { db, jobs: [dailyDigestJob], leaseJob: lease, tz: TZ });
      expect(first.ran.map((r) => r.job)).toEqual(["daily-digest"]);

      const second = await runTick(new Date("2001-03-02T15:00:00Z"), {
        db,
        jobs: [dailyDigestJob],
        leaseJob: lease,
        tz: TZ,
      });
      expect(second.ran).toEqual([]);
      expect(second.skipped).toEqual([{ job: "daily-digest", reason: "window_done" }]);

      const [window] = await db
        .select({ status: schema.cronRuns.status })
        .from(schema.cronRuns)
        .where(and(eq(schema.cronRuns.job, "daily-digest"), eq(schema.cronRuns.windowKey, "daily-digest:2001-03-02")));
      expect(window.status).toBe("done");
    });
  });

  describe("housekeeping", () => {
    it("purges read and non-inbox notifications older than 180 days only", async () => {
      const owner = await newStaff("purge");
      const now = new Date();
      const old = new Date(now.getTime() - 181 * 86_400_000);
      const recent = new Date(now.getTime() - 179 * 86_400_000);

      const oldRead = await addNotification(owner, { createdAt: old, readAt: old });
      const oldNotInbox = await addNotification(owner, { createdAt: old, inApp: false, digest: true });
      const oldUnread = await addNotification(owner, { createdAt: old });
      const oldPending = await addNotification(owner, { createdAt: old, inApp: false, emailStatus: "pending" });
      const recentRead = await addNotification(owner, { createdAt: recent, readAt: recent });

      expect(await purgeOldNotifications(db, now)).toBeGreaterThanOrEqual(2);

      const left = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(eq(schema.notifications.staffId, owner));
      expect(left.map((r) => r.id).sort()).toEqual([oldUnread, oldPending, recentRead].sort());
      expect(left.map((r) => r.id)).not.toContain(oldRead);
      expect(left.map((r) => r.id)).not.toContain(oldNotInbox);
    });

    it(`soft-deletes assistant threads beyond ${ASSISTANT_THREADS_KEPT} per staff, oldest first`, async () => {
      const owner = await newStaff("threads");
      const other = await newStaff("threads-other");
      const base = Date.now() - 10 * 86_400_000;
      const threads = Array.from({ length: ASSISTANT_THREADS_KEPT + 2 }, (_, i) => ({
        id: randomUUID(),
        staffId: owner,
        title: `Hilo ${i}`,
        createdAt: new Date(base + i * 60_000),
        updatedAt: new Date(base + i * 60_000),
      }));
      await db.insert(schema.assistantThreads).values(threads);
      const alreadyDeleted = randomUUID();
      await db
        .insert(schema.assistantThreads)
        .values({ id: alreadyDeleted, staffId: owner, deletedAt: new Date(base), updatedAt: new Date(base - 1) });
      await db.insert(schema.assistantThreads).values({ id: randomUUID(), staffId: other });

      const now = new Date();
      expect(await trimAssistantThreads(db, now)).toBeGreaterThanOrEqual(2);

      const live = await db
        .select({ id: schema.assistantThreads.id })
        .from(schema.assistantThreads)
        .where(and(eq(schema.assistantThreads.staffId, owner), isNull(schema.assistantThreads.deletedAt)));
      expect(live).toHaveLength(ASSISTANT_THREADS_KEPT);
      const liveIds = new Set(live.map((r) => r.id));
      expect(liveIds.has(threads[0].id)).toBe(false);
      expect(liveIds.has(threads[1].id)).toBe(false);
      expect(liveIds.has(threads[threads.length - 1].id)).toBe(true);

      const otherLive = await db
        .select({ id: schema.assistantThreads.id })
        .from(schema.assistantThreads)
        .where(and(eq(schema.assistantThreads.staffId, other), isNull(schema.assistantThreads.deletedAt)));
      expect(otherLive).toHaveLength(1);
    });

    it(`trims cached Gmail threads beyond ${GMAIL_THREADS_KEPT} per staff, oldest first`, async () => {
      const owner = await newStaff("gmail");
      const base = Date.now() - 30 * 86_400_000;
      const rows = Array.from({ length: GMAIL_THREADS_KEPT + 3 }, (_, i) => ({
        id: `t-${RUN}-${i}`,
        staffId: owner,
        receivedAt: new Date(base + i * 60_000),
      }));
      await db.insert(schema.gmailThreads).values(rows);

      expect(await trimGmailThreads(db)).toBeGreaterThanOrEqual(3);

      const left = await db
        .select({ id: schema.gmailThreads.id })
        .from(schema.gmailThreads)
        .where(eq(schema.gmailThreads.staffId, owner));
      expect(left).toHaveLength(GMAIL_THREADS_KEPT);
      const ids = new Set(left.map((r) => r.id));
      for (const gone of [0, 1, 2]) expect(ids.has(`t-${RUN}-${gone}`)).toBe(false);
      expect(ids.has(`t-${RUN}-${GMAIL_THREADS_KEPT + 2}`)).toBe(true);
    });
  });
});
