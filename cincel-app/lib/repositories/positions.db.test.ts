// @vitest-environment node
/**
 * Puestos capacity and members against a real Postgres (#1016): the weekly
 * capacity saves through the actions and the 0–80 rule is enforced, and
 * `members` lists the puesto's active, live people by name. Runs only when
 * TEST_DATABASE_URL points at a migrated database; every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Admin",
      role: "Administrador",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: "Administrador",
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("puestos capacity and members (test DB)", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./positions-repository");
  const actions = unwrapActions(await import("@/lib/actions/positions-actions"));

  const positionIds: string[] = [];
  const staffIds: string[] = [];

  afterAll(async () => {
    if (positionIds.length) {
      await db.delete(schema.staffPositions).where(inArray(schema.staffPositions.positionId, positionIds));
      await db.delete(schema.positions).where(inArray(schema.positions.id, positionIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  async function created(name: string, weeklyCapacityHours?: number | null) {
    const position = await actions.createPositionAction({ name: `${name} ${run}`, weeklyCapacityHours });
    positionIds.push(position.id);
    return position;
  }

  it("capacity saves and rejects 81", async () => {
    const position = await created("Arquitecto", 40);
    expect(position.weeklyCapacityHours).toBe(40);

    const updated = await actions.updatePositionAction(position.id, { weeklyCapacityHours: 80 });
    expect(updated.weeklyCapacityHours).toBe(80);
    const cleared = await actions.updatePositionAction(position.id, { weeklyCapacityHours: null });
    expect(cleared.weeklyCapacityHours).toBeNull();

    await expect(actions.updatePositionAction(position.id, { weeklyCapacityHours: 81 })).rejects.toThrow(/INVALID/);
    await expect(actions.updatePositionAction(position.id, { weeklyCapacityHours: -1 })).rejects.toThrow(/INVALID/);
    await expect(actions.updatePositionAction(position.id, { weeklyCapacityHours: 7.5 })).rejects.toThrow(/INVALID/);
    // The column check holds even when the action is bypassed.
    await expect(
      db.execute(sql`update core.positions set weekly_capacity_hours = 81 where id = ${position.id}`),
    ).rejects.toThrow();
    const [row] = await db
      .select({ hours: schema.positions.weeklyCapacityHours })
      .from(schema.positions)
      .where(eq(schema.positions.id, position.id));
    expect(row?.hours).toBeNull();
  });

  it("members are active staff by name", async () => {
    const position = await created("Residente");
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Zoe ${run}`, lastName: "Ruiz" },
        { name: `Ana ${run}`, lastName: "López" },
        { name: `Inactiva ${run}`, active: false },
        { name: `Borrada ${run}`, deletedAt: new Date() },
      ])
      .returning({ id: schema.staff.id });
    staffIds.push(...people.map((p) => p.id));
    await db.insert(schema.staffPositions).values(people.map((p) => ({ staffId: p.id, positionId: position.id })));

    const [listed] = (await repo.listPositions()).filter((p) => p.id === position.id);
    expect(listed?.members).toEqual([
      { id: people[1]!.id, name: `Ana ${run} López`, initials: "AL" },
      { id: people[0]!.id, name: `Zoe ${run} Ruiz`, initials: "ZR" },
    ]);
    // staffCount still counts every live holder, active or not.
    expect(listed?.staffCount).toBe(3);
  });
});
