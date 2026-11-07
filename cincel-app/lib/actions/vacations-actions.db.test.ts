// @vitest-environment node
/**
 * Vacations against a real Postgres (redesign BE §7.8, §8.8, §9.6, §16,
 * §17 item 8): validation, `OVERLAP`, `STARTED`, own-decision `FORBIDDEN`,
 * `kind` masking, notifications, settings and the acceptance flow request →
 * decision → balance and availability. Runs only when TEST_DATABASE_URL
 * points at a migrated database (`npm run db:migrate`). Every row a test
 * creates belongs to staff created here and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = "https://cincel.example";

const session = vi.hoisted(() => ({ access: "Colaborador" as string, memberId: "", name: "" }));
const pendingAfter = vi.hoisted(() => [] as Promise<unknown>[]);
const mail = vi.hoisted(() => ({ sent: [] as { to: string | string[]; subject: string; text: string }[] }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    pendingAfter.push(Promise.resolve().then(task));
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: session.name,
      role: session.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access: session.access,
  })),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendMail: vi.fn(async (message: { to: string | string[]; subject: string; text: string }) => {
    mail.sent.push(message);
    return { sent: true };
  }),
}));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time-tracking/settings")>();
  return { ...actual, getTimeTrackingSettings: vi.fn(async () => ({ ...actual.DEFAULT_TIME_TRACKING_SETTINGS })) };
});

const run = randomUUID().slice(0, 8);
// A Wednesday; Mexico City noon. Every date below is relative to it.
const NOW = new Date("2031-06-11T18:00:00Z");

async function flushAfter(): Promise<void> {
  while (pendingAfter.length) await pendingAfter.shift();
}

describe.skipIf(!url)("vacations (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = await import("@/lib/actions/vacations-actions");
  const { approvedAbsences } = await import("@/lib/vacations/approved-absences");
  const { VACATIONS_SETTING_KEY } = await import("@/lib/vacations/balance");

  const staffIds: string[] = [];
  const people = { requester: "", colleague: "", decider: "", decider2: "" };
  const names: Record<keyof typeof people, string> = {
    requester: `Ana ${run}`,
    colleague: `Beto ${run}`,
    decider: `Carla ${run}`,
    decider2: `Dario ${run}`,
  };
  let originalSetting: string | null = null;

  async function makeStaff(name: string, role: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name, role, email: `${name.toLowerCase().replace(/\s+/g, ".")}@cincel.example` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  function as(person: keyof typeof people, access?: string) {
    session.memberId = people[person];
    session.name = names[person];
    session.access = access ?? (person === "decider" || person === "decider2" ? "Dirección" : "Colaborador");
  }

  async function insertRequest(
    staffId: string,
    values: { from: string; to: string; days: number; status: "pendiente" | "aprobada" | "rechazada" | "cancelada"; kind?: "vacaciones" | "personal" | "enfermedad" },
  ): Promise<string> {
    const [row] = await db
      .insert(schema.vacationRequests)
      .values({
        staffId,
        fromDate: values.from,
        toDate: values.to,
        days: values.days,
        status: values.status,
        kind: values.kind ?? "vacaciones",
      })
      .returning({ id: schema.vacationRequests.id });
    return row!.id;
  }

  async function clearRequests(): Promise<void> {
    const requests = await db
      .select({ id: schema.vacationRequests.id })
      .from(schema.vacationRequests)
      .where(inArray(schema.vacationRequests.staffId, staffIds));
    // Other deciders of the test DB get the request notifications too.
    const keys = requests.flatMap((r) => [`vacaciones-solicitud:${r.id}`, `vacaciones-decision:${r.id}`]);
    if (keys.length) await db.delete(schema.notifications).where(inArray(schema.notifications.dedupeKey, keys));
    await db.delete(schema.vacationRequests).where(inArray(schema.vacationRequests.staffId, staffIds));
    await db.delete(schema.notifications).where(inArray(schema.notifications.staffId, staffIds));
  }

  beforeAll(async () => {
    people.requester = await makeStaff(names.requester, "Colaborador");
    people.colleague = await makeStaff(names.colleague, "Colaborador");
    people.decider = await makeStaff(names.decider, "Dirección");
    people.decider2 = await makeStaff(names.decider2, "Administrador");
    const [row] = await db
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, VACATIONS_SETTING_KEY));
    originalSetting = row?.value ?? null;
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mail.sent.length = 0;
    as("requester");
  });

  afterEach(async () => {
    await flushAfter();
    vi.useRealTimers();
    await clearRequests();
  });

  afterAll(async () => {
    if (originalSetting === null) {
      await db.delete(schema.appSettings).where(eq(schema.appSettings.key, VACATIONS_SETTING_KEY));
    } else {
      await db
        .update(schema.appSettings)
        .set({ value: originalSetting })
        .where(eq(schema.appSettings.key, VACATIONS_SETTING_KEY));
    }
    if (staffIds.length) {
      await clearRequests();
      await db.delete(schema.staffProfiles).where(inArray(schema.staffProfiles.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  describe("requestVacationAction", () => {
    it("rejects invalid ranges with INVALID", async () => {
      // to < from
      await expect(
        actions.requestVacationAction({ from: "2031-07-11", to: "2031-07-07", kind: "vacaciones" }),
      ).rejects.toThrow(/^INVALID/);
      // more than 30 calendar days
      await expect(
        actions.requestVacationAction({ from: "2031-07-01", to: "2031-08-01", kind: "vacaciones" }),
      ).rejects.toThrow(/^INVALID/);
      // weekend only: 0 work days
      await expect(
        actions.requestVacationAction({ from: "2031-07-05", to: "2031-07-06", kind: "vacaciones" }),
      ).rejects.toThrow(/^INVALID/);
    });

    it("stores the work days of the range as pendiente", async () => {
      const created = await actions.requestVacationAction({
        from: "2031-07-07",
        to: "2031-07-13",
        kind: "personal",
        comment: "  Mudanza ",
      });
      expect(created).toMatchObject({ from: "2031-07-07", to: "2031-07-13", kind: "personal", comment: "Mudanza", status: "pendiente" });
      const [row] = await db.select().from(schema.vacationRequests).where(eq(schema.vacationRequests.id, created.id));
      expect(row?.days).toBe(5);
      expect(row?.staffId).toBe(people.requester);
    });

    it("returns OVERLAP against the caller's own pendiente or aprobada requests only", async () => {
      await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" });
      await expect(
        actions.requestVacationAction({ from: "2031-07-10", to: "2031-07-15", kind: "vacaciones" }),
      ).rejects.toThrow(/^OVERLAP/);

      await insertRequest(people.requester, { from: "2031-07-14", to: "2031-07-18", days: 5, status: "aprobada" });
      await expect(
        actions.requestVacationAction({ from: "2031-07-18", to: "2031-07-18", kind: "personal" }),
      ).rejects.toThrow(/^OVERLAP/);

      // Rejected and cancelled requests don't block.
      await insertRequest(people.requester, { from: "2031-08-04", to: "2031-08-08", days: 5, status: "rechazada" });
      await insertRequest(people.requester, { from: "2031-08-11", to: "2031-08-15", days: 5, status: "cancelada" });
      await expect(
        actions.requestVacationAction({ from: "2031-08-06", to: "2031-08-12", kind: "vacaciones" }),
      ).resolves.toMatchObject({ status: "pendiente" });

      // Another person's request on the same dates doesn't block.
      as("colleague");
      await expect(
        actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" }),
      ).resolves.toMatchObject({ status: "pendiente" });
    });

    it("notifies the deciders without the kind (in-app + vacaciones-solicitud)", async () => {
      const created = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "enfermedad" });
      await flushAfter();

      const rows = await db
        .select()
        .from(schema.notifications)
        .where(inArray(schema.notifications.staffId, staffIds));
      const recipients = rows.map((r) => r.staffId).sort();
      expect(recipients).toEqual([people.decider, people.decider2].sort());
      for (const row of rows) {
        expect(row.kind).toBe("sistema");
        expect(row.inApp).toBe(true);
        expect(row.title).toBe(`Nueva solicitud de ausencia de ${names.requester}`);
        expect(`${row.title} ${row.body}`.toLowerCase()).not.toContain("enfermedad");
        expect(row.dedupeKey).toBe(`vacaciones-solicitud:${created.id}`);
      }

      const toDeciders = mail.sent.filter((m) =>
        [`carla.${run}@cincel.example`, `dario.${run}@cincel.example`].includes(String(m.to)),
      );
      expect(toDeciders).toHaveLength(2);
      for (const m of toDeciders) {
        expect(m.subject).toBe(`Nueva solicitud de ausencia de ${names.requester}`);
        expect(m.text.toLowerCase()).not.toContain("enfermedad");
      }
    });
  });

  describe("cancelVacationRequestAction", () => {
    it("cancels a pendiente request and a future aprobada one", async () => {
      const pending = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" });
      await actions.cancelVacationRequestAction(pending.id);
      const future = await insertRequest(people.requester, { from: "2031-08-04", to: "2031-08-08", days: 5, status: "aprobada" });
      await actions.cancelVacationRequestAction(future);

      const rows = await db
        .select({ status: schema.vacationRequests.status })
        .from(schema.vacationRequests)
        .where(inArray(schema.vacationRequests.id, [pending.id, future]));
      expect(rows.map((r) => r.status)).toEqual(["cancelada", "cancelada"]);
    });

    it("returns STARTED for an approved request that already started", async () => {
      const started = await insertRequest(people.requester, { from: "2031-06-09", to: "2031-06-13", days: 5, status: "aprobada" });
      await expect(actions.cancelVacationRequestAction(started)).rejects.toThrow(/^STARTED/);
      const startsToday = await insertRequest(people.requester, { from: "2031-06-11", to: "2031-06-11", days: 1, status: "aprobada" });
      await expect(actions.cancelVacationRequestAction(startsToday)).rejects.toThrow(/^STARTED/);
    });

    it("returns FORBIDDEN for another person's request and NOT_FOUND for a missing one", async () => {
      const theirs = await insertRequest(people.colleague, { from: "2031-07-07", to: "2031-07-11", days: 5, status: "pendiente" });
      await expect(actions.cancelVacationRequestAction(theirs)).rejects.toThrow(/^FORBIDDEN/);
      as("decider");
      await expect(actions.cancelVacationRequestAction(theirs)).rejects.toThrow(/^FORBIDDEN/);
      await expect(actions.cancelVacationRequestAction(randomUUID())).rejects.toThrow(/^NOT_FOUND/);
    });

    it("refuses a request that was rejected or cancelled", async () => {
      const rejected = await insertRequest(people.requester, { from: "2031-07-07", to: "2031-07-11", days: 5, status: "rechazada" });
      await expect(actions.cancelVacationRequestAction(rejected)).rejects.toThrow(/^INVALID/);
    });
  });

  describe("decisions", () => {
    it("only deciders list pending requests, oldest first and never their own", async () => {
      await expect(actions.fetchPendingVacationRequestsAction()).rejects.toThrow(/^FORBIDDEN/);

      const first = await actions.requestVacationAction({ from: "2031-08-04", to: "2031-08-08", kind: "vacaciones" });
      as("colleague");
      const second = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-08", kind: "personal" });
      as("decider");
      const own = await actions.requestVacationAction({ from: "2031-07-14", to: "2031-07-14", kind: "personal" });

      const listed = (await actions.fetchPendingVacationRequestsAction()).filter((r) => staffIds.includes(r.staffId));
      expect(listed.map((r) => r.id)).toEqual([first.id, second.id]);
      expect(listed.map((r) => r.id)).not.toContain(own.id);
      expect(listed[0]).toMatchObject({ staffId: people.requester, name: names.requester, days: 5, kind: "vacaciones" });
    });

    it("returns FORBIDDEN to non-deciders and to a decider on their own request", async () => {
      const theirs = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" });
      await expect(actions.decideVacationAction(theirs.id, "aprobada")).rejects.toThrow(/^FORBIDDEN/);

      as("decider");
      const own = await actions.requestVacationAction({ from: "2031-07-14", to: "2031-07-18", kind: "vacaciones" });
      await expect(actions.decideVacationAction(own.id, "aprobada")).rejects.toThrow(/^FORBIDDEN/);
      const [row] = await db.select().from(schema.vacationRequests).where(eq(schema.vacationRequests.id, own.id));
      expect(row?.status).toBe("pendiente");
    });

    it("returns NOT_FOUND for a missing request and INVALID when it is not pendiente", async () => {
      as("decider");
      await expect(actions.decideVacationAction(randomUUID(), "aprobada")).rejects.toThrow(/^NOT_FOUND/);
      const cancelled = await insertRequest(people.requester, { from: "2031-07-07", to: "2031-07-11", days: 5, status: "cancelada" });
      await expect(actions.decideVacationAction(cancelled, "aprobada")).rejects.toThrow(/^INVALID/);
      const pending = await insertRequest(people.requester, { from: "2031-07-14", to: "2031-07-18", days: 5, status: "pendiente" });
      await expect(actions.decideVacationAction(pending, "aceptada" as "aprobada")).rejects.toThrow(/^INVALID/);
    });

    it("rejecting notifies the requester in-app and by vacaciones-decision", async () => {
      const created = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" });
      await flushAfter();
      mail.sent.length = 0;

      as("decider");
      const decided = await actions.decideVacationAction(created.id, "rechazada", "Cierre de obra esa semana");
      expect(decided.status).toBe("rechazada");
      await flushAfter();

      const [row] = await db.select().from(schema.vacationRequests).where(eq(schema.vacationRequests.id, created.id));
      expect(row).toMatchObject({ decidedBy: people.decider, decisionNote: "Cierre de obra esa semana" });
      expect(row?.decidedAt).toBeInstanceOf(Date);

      const inbox = await db
        .select()
        .from(schema.notifications)
        .where(and(eq(schema.notifications.staffId, people.requester), eq(schema.notifications.inApp, true)));
      expect(inbox.map((n) => n.title)).toEqual(["Tu solicitud de vacaciones fue rechazada"]);

      const toRequester = mail.sent.filter((m) => String(m.to) === `ana.${run}@cincel.example`);
      expect(toRequester).toHaveLength(1);
      expect(toRequester[0]!.subject).toBe("Tu solicitud de vacaciones fue rechazada");
      expect(toRequester[0]!.text).toContain("Cierre de obra esa semana");
    });
  });

  describe("fetchTeamAbsencesAction", () => {
    it("masks the kind as ausencia for everyone but the owner and deciders", async () => {
      await insertRequest(people.requester, { from: "2031-07-07", to: "2031-07-11", days: 5, status: "aprobada", kind: "enfermedad" });
      await insertRequest(people.requester, { from: "2031-07-21", to: "2031-07-22", days: 2, status: "pendiente", kind: "personal" });
      await insertRequest(people.colleague, { from: "2031-07-28", to: "2031-08-01", days: 5, status: "aprobada", kind: "vacaciones" });
      await insertRequest(people.colleague, { from: "2031-07-14", to: "2031-07-15", days: 2, status: "rechazada", kind: "vacaciones" });

      const mine = (rows: Awaited<ReturnType<typeof actions.fetchTeamAbsencesAction>>) =>
        rows.filter((r) => staffIds.includes(r.staffId)).map((r) => ({ staffId: r.staffId, from: r.from, kind: r.kind }));

      // A colleague: approved rows only, kind masked except their own.
      as("colleague");
      expect(mine(await actions.fetchTeamAbsencesAction({ month: "2031-07" }))).toEqual([
        { staffId: people.requester, from: "2031-07-07", kind: "ausencia" },
        { staffId: people.colleague, from: "2031-07-28", kind: "vacaciones" },
      ]);

      // The owner sees their own kind.
      as("requester");
      expect(mine(await actions.fetchTeamAbsencesAction({ month: "2031-07" }))).toEqual([
        { staffId: people.requester, from: "2031-07-07", kind: "enfermedad" },
        { staffId: people.colleague, from: "2031-07-28", kind: "ausencia" },
      ]);

      // Deciders see every kind and the pending rows too.
      as("decider");
      expect(mine(await actions.fetchTeamAbsencesAction({ month: "2031-07" }))).toEqual([
        { staffId: people.requester, from: "2031-07-07", kind: "enfermedad" },
        { staffId: people.requester, from: "2031-07-21", kind: "personal" },
        { staffId: people.colleague, from: "2031-07-28", kind: "vacaciones" },
      ]);

      // A range crossing the month boundary shows in both months.
      expect(mine(await actions.fetchTeamAbsencesAction({ month: "2031-08" }))).toEqual([
        { staffId: people.colleague, from: "2031-07-28", kind: "vacaciones" },
      ]);
    });

    it("returns INVALID for a malformed month", async () => {
      await expect(actions.fetchTeamAbsencesAction({ month: "2031-13" })).rejects.toThrow(/^INVALID/);
      await expect(actions.fetchTeamAbsencesAction({ month: "julio" })).rejects.toThrow(/^INVALID/);
    });
  });

  describe("vacation settings", () => {
    it("are only for deciders", async () => {
      await expect(actions.fetchVacationSettingsAction()).rejects.toThrow(/^FORBIDDEN/);
      await expect(actions.saveVacationSettingsAction({ daysPerYear: 12, overrides: [] })).rejects.toThrow(/^FORBIDDEN/);
    });

    it("validates the range of daysPerYear and the overrides", async () => {
      as("decider");
      await expect(actions.saveVacationSettingsAction({ daysPerYear: 61, overrides: [] })).rejects.toThrow(/^INVALID/);
      await expect(actions.saveVacationSettingsAction({ daysPerYear: -1, overrides: [] })).rejects.toThrow(/^INVALID/);
      await expect(
        actions.saveVacationSettingsAction({ daysPerYear: 12, overrides: [{ staffId: people.requester, days: 61 }] }),
      ).rejects.toThrow(/^INVALID/);
      await expect(
        actions.saveVacationSettingsAction({ daysPerYear: 12, overrides: [{ staffId: randomUUID(), days: 10 }] }),
      ).rejects.toThrow(/^INVALID/);
    });

    it("entitled uses the person override, else the org default", async () => {
      as("decider");
      const saved = await actions.saveVacationSettingsAction({
        daysPerYear: 14,
        overrides: [{ staffId: people.requester, days: 20 }],
      });
      expect(saved.daysPerYear).toBe(14);
      expect(saved.overrides.find((o) => o.staffId === people.requester)).toEqual({
        staffId: people.requester,
        name: names.requester,
        days: 20,
      });
      expect(saved.overrides.find((o) => o.staffId === people.colleague)?.days).toBeNull();
      await expect(actions.fetchVacationSettingsAction()).resolves.toEqual(saved);

      as("requester");
      expect((await actions.fetchMyVacationsAction()).balance.entitled).toBe(20);
      as("colleague");
      expect((await actions.fetchMyVacationsAction()).balance.entitled).toBe(14);

      as("decider");
      await actions.saveVacationSettingsAction({ daysPerYear: 15, overrides: [{ staffId: people.requester, days: null }] });
      as("requester");
      expect((await actions.fetchMyVacationsAction()).balance.entitled).toBe(15);
    });
  });

  describe("acceptance (BE §17 item 8)", () => {
    it("request → decision → balance and availability updated", async () => {
      as("decider");
      await actions.saveVacationSettingsAction({ daysPerYear: 12, overrides: [{ staffId: people.requester, days: null }] });

      as("requester");
      const before = await actions.fetchMyVacationsAction();
      expect(before).toEqual({ balance: { entitled: 12, taken: 0, pending: 0, available: 12 }, requests: [] });

      const created = await actions.requestVacationAction({ from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" });
      const pending = await actions.fetchMyVacationsAction();
      expect(pending.balance).toEqual({ entitled: 12, taken: 0, pending: 5, available: 7 });
      expect(pending.requests).toEqual([created]);

      // Not yet an absence for colleagues.
      as("colleague");
      const teamBefore = await actions.fetchTeamAbsencesAction({ month: "2031-07" });
      expect(teamBefore.filter((r) => r.staffId === people.requester)).toEqual([]);
      await flushAfter();

      as("decider");
      const decided = await actions.decideVacationAction(created.id, "aprobada");
      expect(decided).toMatchObject({ id: created.id, status: "aprobada" });
      await flushAfter();

      as("requester");
      const after = await actions.fetchMyVacationsAction();
      expect(after.balance).toEqual({ entitled: 12, taken: 0, pending: 0, available: 7 });
      expect(after.requests[0]).toMatchObject({ id: created.id, status: "aprobada" });

      // Availability: colleagues see the approved absence (masked), the helper returns it.
      as("colleague");
      const team = await actions.fetchTeamAbsencesAction({ month: "2031-07" });
      expect(team.filter((r) => r.staffId === people.requester)).toEqual([
        { staffId: people.requester, name: names.requester, from: "2031-07-07", to: "2031-07-11", kind: "ausencia" },
      ]);
      await expect(
        approvedAbsences(db, { from: "2031-07-01", to: "2031-07-31", staffIds: [people.requester] }),
      ).resolves.toEqual([{ staffId: people.requester, from: "2031-07-07", to: "2031-07-11", kind: "vacaciones" }]);

      // Once the days pass, they count as taken.
      vi.setSystemTime(new Date("2031-07-16T18:00:00Z"));
      as("requester");
      expect((await actions.fetchMyVacationsAction()).balance).toEqual({ entitled: 12, taken: 5, pending: 0, available: 7 });

      // The requester got the decision in-app and by email.
      const inbox = await db
        .select({ title: schema.notifications.title })
        .from(schema.notifications)
        .where(eq(schema.notifications.staffId, people.requester));
      expect(inbox.map((n) => n.title)).toContain("Tu solicitud de vacaciones fue aprobada");
      expect(mail.sent.some((m) => String(m.to) === `ana.${run}@cincel.example` && m.subject === "Tu solicitud de vacaciones fue aprobada")).toBe(true);
    });
  });
});
