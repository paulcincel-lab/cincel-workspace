// @vitest-environment node
/**
 * Acceptance (redesign BE §16, §17 item 4): a reminder created through
 * `createReminderAction` → `POST /api/cron/tick` → one in-app `recordatorio`
 * row and its email sent by `notifications-deliver`, within one minute of the
 * due time; a second tick duplicates nothing (dedupe key). Mail goes through
 * a mocked `sendMail`. Runs only when TEST_DATABASE_URL points at a migrated
 * database; every row it creates is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";
import { lockReminders } from "@/tests/setup/reminders-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const SECRET = `tick-${randomUUID()}`;
process.env.CRON_SECRET = SECRET;

const session = vi.hoisted(() => ({ memberId: "", email: "" }));
const mail = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({ sent: true as const })) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendMail: mail.sendMail,
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Recordatorios",
      role: "Administrador",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: session.email,
      phone: "",
    },
    email: session.email,
    access: "Administrador",
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("reminder → tick → in-app row + email (test DB)", async () => {
  let unlock: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlock = await lockReminders(url!);
  }, 300_000);

  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { createReminderAction } = unwrapActions(await import("@/lib/actions/my-space-actions"));
  const { reminderDedupeKey } = await import("@/lib/my-space/reminders");
  const { POST } = await import("@/app/api/cron/tick/route");

  let staffId = "";

  beforeAll(async () => {
    session.email = `recordatorio-acc-${run}@cincel.example`;
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Recordatorio ${run}`, email: session.email })
      .returning({ id: schema.staff.id });
    staffId = row!.id;
    session.memberId = staffId;
  });

  afterAll(async () => {
    try {
      if (staffId) await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
    } finally {
      await unlock?.();
    }
  });

  /** POST /api/cron/tick; waits while another tick holds the lease (204). */
  async function tick(): Promise<Response> {
    const deadline = Date.now() + 70_000;
    for (;;) {
      const response = await POST(
        new NextRequest("http://app:3000/api/cron/tick", {
          method: "POST",
          headers: { authorization: `Bearer ${SECRET}` },
        }),
      );
      if (response.status !== 204 || Date.now() > deadline) return response;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  async function reminderNotifications() {
    return db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.staffId, staffId), eq(schema.notifications.kind, "recordatorio")));
  }

  it("fires within one minute of the due time and never twice", async () => {
    // Due 30 s ago: still accepted (PAST_TIME only beyond 60 s).
    const dueAt = new Date(Date.now() - 30_000);
    const reminder = await createReminderAction({
      text: `Llamar a Juanma ${run}`,
      dueAt: dueAt.toISOString(),
      channels: ["app", "email"],
    });

    const first = await tick();
    expect(first.status).toBe(200);
    const body = (await first.json()) as { ran: { job: string }[] };
    expect(body.ran.map((r) => r.job)).toEqual(expect.arrayContaining(["reminders-fire", "notifications-deliver"]));

    const rows = await reminderNotifications();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      title: `Llamar a Juanma ${run}`,
      inApp: true,
      dedupeKey: reminderDedupeKey(reminder.id, dueAt),
      url: "/mi-espacio",
    });
    expect(row.createdAt.getTime() - dueAt.getTime()).toBeLessThan(60_000);

    // The email left in the same tick through notifications-deliver.
    expect(row.emailStatus).toBe("sent");
    expect(row.emailedAt).not.toBeNull();
    expect(row.emailedAt!.getTime() - dueAt.getTime()).toBeLessThan(60_000);
    const calls = mail.sendMail.mock.calls as unknown as [{ to: string | string[]; subject: string }][];
    const mine = calls.filter(([message]) => [message.to].flat().includes(session.email));
    expect(mine).toHaveLength(1);
    expect(mine[0]![0].subject).toContain(`Llamar a Juanma ${run}`);

    const [stored] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id));
    expect(stored!.firedAt).not.toBeNull();

    // A second tick creates no duplicate row and sends no second email.
    const second = await tick();
    expect(second.status).toBe(200);
    expect(await reminderNotifications()).toHaveLength(1);
    expect(
      (mail.sendMail.mock.calls as unknown as [{ to: string | string[] }][]).filter(([message]) =>
        [message.to].flat().includes(session.email),
      ),
    ).toHaveLength(1);
  }, 180_000);
});
