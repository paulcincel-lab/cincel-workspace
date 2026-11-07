// @vitest-environment node
/**
 * GET /api/horario/export against a real Postgres (redesign BE §7.7): 401
 * without a session, 403 without `canViewTeamHours`, 400 unless `week` is a
 * Monday; for Administrador and Dirección a UTF-8 CSV with BOM, file
 * `horario-<week>.csv`, formula-leading cells escaped, trial days (before
 * `requiredFrom`) excluded and counted in `X-Cincel-Trial-Days`. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ access: "Administrador" as string | null }));
const stored = vi.hoisted(() => ({ settings: null as unknown }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (session.access === null) throw new Error("FORBIDDEN");
    return {
      member: {
        id: "00000000-0000-4000-8000-000000000815",
        name: "Admin",
        role: session.access,
        area: "",
        capacity: 0,
        availability: "",
        active: true,
        institutionalEmail: "",
        phone: "",
      },
      email: "admin@cincel.example",
      access: session.access,
    };
  }),
}));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/settings")>()),
  getTimeTrackingSettings: vi.fn(async () => stored.settings),
}));

describe.skipIf(!url)("GET /api/horario/export (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { NextRequest } = await import("next/server");
  const { db, schema } = await import("@/lib/db/client");
  const { localInstant } = await import("@/lib/time-tracking/auto-close");
  const { DEFAULT_TIME_TRACKING_SETTINGS } = await import("@/lib/time-tracking/settings");
  const { GET } = await import("./route");

  const run = Math.random().toString(36).slice(2, 8);
  // A week of February 2020 nobody else writes.
  const WEEK = "2020-02-03";
  const staffIds: string[] = [];

  const request = (week: string | null) =>
    new NextRequest(`http://localhost/api/horario/export${week === null ? "" : `?week=${week}`}`);

  async function entry(staffId: string, date: string, from: string, to: string, flagged = false) {
    await db.insert(schema.timeEntries).values({
      staffId,
      workDate: date,
      startedAt: localInstant(date, from),
      endedAt: localInstant(date, to),
      closedBy: flagged ? "auto_close" : "user",
      flagged,
      pauses: [],
      source: "login",
    });
  }

  beforeEach(() => {
    session.access = "Administrador";
    stored.settings = { ...DEFAULT_TIME_TRACKING_SETTINGS, enabled: true, requiredFrom: "2020-02-05" };
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("401 without a session", async () => {
    session.access = null;
    expect((await GET(request(WEEK))).status).toBe(401);
  });

  it("403 without canViewTeamHours", async () => {
    session.access = "Colaborador";
    const res = await GET(request(WEEK));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).not.toMatch(/text\/csv/);
  });

  it("400 unless week is a Monday", async () => {
    for (const week of [null, "2020-02-04", "febrero"]) {
      expect((await GET(request(week))).status).toBe(400);
    }
  });

  it.each(["Administrador", "Dirección"])("%s downloads the CSV with BOM, escaping and trial days left out", async (access) => {
    session.access = access;
    if (staffIds.length === 0) {
      const [row] = await db
        .insert(schema.staff)
        .values({ name: `@Export ${run}`, lastName: "-Uno", role: "Colaborador" })
        .returning({ id: schema.staff.id });
      staffIds.push(row!.id);
      await entry(row!.id, "2020-02-03", "09:00", "17:00"); // trial (before 2020-02-05)
      await entry(row!.id, "2020-02-04", "09:00", "17:00"); // trial
      await entry(row!.id, "2020-02-05", "09:00", "20:00", true);
    }

    const res = await GET(request(WEEK));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="horario-${WEEK}.csv"`);
    expect(res.headers.get("x-cincel-trial-days")).toBe("2");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("persona,fecha,entrada,salida,pausas_min,horas,origen,marcada");
    expect(lines.filter((line) => line.includes(run))).toEqual([`'@Export ${run} -Uno,2020-02-05,09:00,20:00,0,11.00,login,sí`]);
  });
});
