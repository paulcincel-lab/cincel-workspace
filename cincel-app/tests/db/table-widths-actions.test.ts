// @vitest-environment node
/**
 * Remembered column widths (#1125) against a real Postgres: one table's
 * widths are stored under its id without touching the other tables, a reset
 * removes only that table, invalid input is refused, and each user keeps their
 * own. Runs only when TEST_DATABASE_URL points at a migrated database; the
 * staff rows carry a per-run marker and are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

const state = vi.hoisted(() => ({ staffId: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: state.staffId }, access: "Colaborador", email: "" }),
  getSession: async () => ({ user: { id: state.staffId } }),
}));

describe.skipIf(!url)("table widths actions (test DB)", async () => {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { setTableColumnWidthsAction } = unwrapActions(await import("@/lib/actions/table-widths-actions"));
  const { rowToUserPreferences } = await import("@/lib/ui/preferences-server");

  let other = "";

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Anchos ${run}`, role: "Colaborador" },
        { name: `Anchos otro ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    state.staffId = members[0]!.id;
    other = members[1]!.id;
  });

  afterAll(async () => {
    for (const id of [state.staffId, other]) if (id) await db.delete(schema.staff).where(eq(schema.staff.id, id));
  });

  beforeEach(async () => {
    await db.delete(schema.userPreferences).where(eq(schema.userPreferences.staffId, state.staffId));
  });

  it("creates the row on first use and stores the table's widths", async () => {
    const result = await setTableColumnWidthsAction({ tableId: "tareas-analitico", widths: { tarea: 420, estatus: 150 } });
    expect(result.tableColumnWidths).toEqual({ "tareas-analitico": { tarea: 420, estatus: 150 } });
    const [row] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.staffId, state.staffId));
    expect(row!.tableColumnWidths).toEqual({ "tareas-analitico": { tarea: 420, estatus: 150 } });
    expect(rowToUserPreferences(row!).tableColumnWidths).toEqual({ "tareas-analitico": { tarea: 420, estatus: 150 } });
  });

  it("replaces one table's widths and leaves the others and the other preferences alone", async () => {
    await db.insert(schema.userPreferences).values({ staffId: state.staffId, density: "compacta" });
    await setTableColumnWidthsAction({ tableId: "a", widths: { x: 100 } });
    await setTableColumnWidthsAction({ tableId: "b", widths: { y: 200 } });
    const result = await setTableColumnWidthsAction({ tableId: "a", widths: { x: 300, z: 80 } });
    expect(result.tableColumnWidths).toEqual({ a: { x: 300, z: 80 }, b: { y: 200 } });
    const [row] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.staffId, state.staffId));
    expect(row!.density).toBe("compacta");
  });

  it("null (or no widths) forgets only that table", async () => {
    await setTableColumnWidthsAction({ tableId: "a", widths: { x: 100 } });
    await setTableColumnWidthsAction({ tableId: "b", widths: { y: 200 } });
    expect((await setTableColumnWidthsAction({ tableId: "a", widths: null })).tableColumnWidths).toEqual({ b: { y: 200 } });
    expect((await setTableColumnWidthsAction({ tableId: "b", widths: {} })).tableColumnWidths).toEqual({});
  });

  it("refuses an id, a key or a width that is not valid", async () => {
    await expect(setTableColumnWidthsAction({ tableId: "Tareas Lista", widths: {} })).rejects.toThrow(/INVALID/);
    await expect(setTableColumnWidthsAction({ tableId: "t", widths: { "a b": 100 } })).rejects.toThrow(/INVALID/);
    await expect(setTableColumnWidthsAction({ tableId: "t", widths: { a: 9999 } })).rejects.toThrow(/INVALID/);
    await expect(setTableColumnWidthsAction({ tableId: "t", widths: { a: -1 } })).rejects.toThrow(/INVALID/);
  });

  it("each user keeps their own widths", async () => {
    await setTableColumnWidthsAction({ tableId: "a", widths: { x: 100 } });
    const mine = state.staffId;
    state.staffId = other;
    try {
      expect((await setTableColumnWidthsAction({ tableId: "a", widths: { x: 500 } })).tableColumnWidths).toEqual({ a: { x: 500 } });
    } finally {
      state.staffId = mine;
    }
    const [row] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.staffId, mine));
    expect(row!.tableColumnWidths).toEqual({ a: { x: 100 } });
  });
});
