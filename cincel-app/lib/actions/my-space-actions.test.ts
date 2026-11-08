// @vitest-environment node
/**
 * Mi espacio notes and checklists against a real Postgres (redesign BE §7.5,
 * §8.0.3, §9.1, §16): note CRUD with archive / restore, checklist flows,
 * reorder (exact ids, serialized by `lockForUpdate`), the `INVALID` rules and
 * cross-owner isolation, plus the owner-scoped instances for notes,
 * checklists and checklist items. Runs only when TEST_DATABASE_URL points at
 * a migrated database (`npm run db:migrate`). Every row a test creates
 * belongs to per-run staff and projects that are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "" }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", () => cache);
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Integrante",
      role: "Colaborador",
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

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Mi espacio notes and checklists (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actionsModule = await import("@/lib/actions/my-space-actions");
  const actions = unwrapActions(actionsModule);
  const { IMPLEMENTED } = await import("@/lib/actions/my-space-actions.flags");

  const staffIds: string[] = [];
  const projectIds: string[] = [];
  let ownerId = "";
  let otherId = "";
  let projectId = "";
  let archivedProjectId = "";

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Mi espacio ${run} ${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function makeProject(label: string, archived = false): Promise<string> {
    const [row] = await db
      .insert(schema.projects)
      .values({ name: `Proyecto mi espacio ${run} ${label}`, deletedAt: archived ? new Date() : null })
      .returning({ id: schema.projects.id });
    projectIds.push(row!.id);
    return row!.id;
  }

  function as(staffId: string) {
    session.memberId = staffId;
  }

  beforeAll(async () => {
    ownerId = await makeStaff("Dueño");
    otherId = await makeStaff("Otro");
    projectId = await makeProject("Visible");
    archivedProjectId = await makeProject("Archivado", true);
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    if (projectIds.length) await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
  });

  beforeEach(() => {
    as(ownerId);
    cache.revalidatePath.mockClear();
  });

  it("flags every notes and checklists action as implemented", () => {
    for (const name of [
      "fetchNotesAction",
      "createNoteAction",
      "updateNoteAction",
      "archiveNoteAction",
      "restoreNoteAction",
      "fetchChecklistsAction",
      "createChecklistAction",
      "addChecklistItemAction",
      "toggleChecklistItemAction",
      "reorderChecklistItemsAction",
      "archiveChecklistAction",
    ] as const) {
      expect(IMPLEMENTED[name]).toBe(true);
    }
  });

  // ── Notes ────────────────────────────────────────────────────────────────

  describe("notes", () => {
    it("creates a note with defaults and revalidates nothing (the client patches me.notes)", async () => {
      const note = await actions.createNoteAction({ title: "Llamar a Juanma" });
      expect(note).toMatchObject({ title: "Llamar a Juanma", body: "", color: "neutral", pinned: false, projectId: null });
      expect(typeof note.updatedAt).toBe("string");
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("returns { ok: false, error } instead of throwing (production strips thrown messages)", async () => {
      await expect(actionsModule.createNoteAction({})).resolves.toMatchObject({
        ok: false,
        error: expect.stringMatching(/^INVALID/),
      });
      await expect(actionsModule.toggleChecklistItemAction(randomUUID(), true)).resolves.toMatchObject({
        ok: false,
        error: expect.stringMatching(/^NOT_FOUND/),
      });
    });

    it("links a visible project", async () => {
      const note = await actions.createNoteAction({ body: "Medidas de cocina", projectId });
      expect(note.projectId).toBe(projectId);
    });

    it("rejects a note with neither title nor body", async () => {
      await expect(actions.createNoteAction({})).rejects.toThrow(/^INVALID/);
      await expect(actions.createNoteAction({ title: "  ", body: "" })).rejects.toThrow(/^INVALID/);
    });

    it("rejects a body over 20 000 characters", async () => {
      await expect(actions.createNoteAction({ body: "a".repeat(20_001) })).rejects.toThrow(/^INVALID/);
      const ok = await actions.createNoteAction({ body: "a".repeat(20_000) });
      expect(ok.body).toHaveLength(20_000);
    });

    it("rejects a project the caller can't see (missing or archived)", async () => {
      await expect(actions.createNoteAction({ title: "x", projectId: randomUUID() })).rejects.toThrow(/^INVALID/);
      await expect(actions.createNoteAction({ title: "x", projectId: archivedProjectId })).rejects.toThrow(
        /^INVALID/,
      );
    });

    it("updates a note and keeps it non-empty", async () => {
      const note = await actions.createNoteAction({ title: "Borrador" });
      const updated = await actions.updateNoteAction(note.id, { body: "Texto", color: "amber", pinned: true });
      expect(updated).toMatchObject({ id: note.id, title: "Borrador", body: "Texto", color: "amber", pinned: true });
      await expect(actions.updateNoteAction(note.id, { title: "", body: "" })).rejects.toThrow(/^INVALID/);
      await expect(actions.updateNoteAction(note.id, { body: "b".repeat(20_001) })).rejects.toThrow(/^INVALID/);
      await expect(actions.updateNoteAction(note.id, { projectId: archivedProjectId })).rejects.toThrow(/^INVALID/);
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND for a missing or malformed id", async () => {
      await expect(actions.updateNoteAction(randomUUID(), { title: "x" })).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.archiveNoteAction("no-es-un-id")).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.restoreNoteAction(randomUUID())).rejects.toThrow(/^NOT_FOUND/);
    });

    it("archives then restores the same note live again", async () => {
      const note = await actions.createNoteAction({ title: "Archivar", body: "y volver", color: "violet" });
      await actions.archiveNoteAction(note.id);
      expect((await actions.fetchNotesAction()).map((n) => n.id)).not.toContain(note.id);
      await expect(actions.updateNoteAction(note.id, { title: "x" })).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.archiveNoteAction(note.id)).rejects.toThrow(/^NOT_FOUND/);

      const restored = await actions.restoreNoteAction(note.id);
      const { updatedAt: _before, ...created } = note;
      const { updatedAt: _after, ...back } = restored;
      void _before;
      void _after;
      expect(back).toEqual(created);
      expect((await actions.fetchNotesAction()).map((n) => n.id)).toContain(note.id);
    });

    it("lists pinned notes first, then by updatedAt desc", async () => {
      as(await makeStaff("Orden notas"));
      const older = await actions.createNoteAction({ title: "Antigua" });
      const pinned = await actions.createNoteAction({ title: "Fijada", pinned: true });
      const newer = await actions.createNoteAction({ title: "Nueva" });
      await actions.updateNoteAction(older.id, { body: "tocada al final" });
      const ids = (await actions.fetchNotesAction()).map((n) => n.id);
      expect(ids).toEqual([pinned.id, older.id, newer.id]);
    });
  });

  // ── Checklists ───────────────────────────────────────────────────────────

  describe("checklists", () => {
    it("creates a checklist with its initial items in order", async () => {
      const checklist = await actions.createChecklistAction({ title: "Obra", items: ["Medir", "Cotizar"], projectId });
      expect(checklist).toMatchObject({ title: "Obra", projectId });
      expect(checklist.items.map((i) => [i.text, i.sortOrder, i.done])).toEqual([
        ["Medir", 0, false],
        ["Cotizar", 1, false],
      ]);
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects an empty title, an empty item or an invisible project", async () => {
      await expect(actions.createChecklistAction({ title: " " })).rejects.toThrow(/^INVALID/);
      await expect(actions.createChecklistAction({ title: "x", items: ["ok", " "] })).rejects.toThrow(/^INVALID/);
      await expect(actions.createChecklistAction({ title: "x", projectId: archivedProjectId })).rejects.toThrow(
        /^INVALID/,
      );
    });

    it("appends items at the end and lists items by sortOrder", async () => {
      const checklist = await actions.createChecklistAction({ title: "Compras", items: ["A"] });
      const b = await actions.addChecklistItemAction(checklist.id, "B");
      const c = await actions.addChecklistItemAction(checklist.id, "C");
      expect([b.sortOrder, c.sortOrder]).toEqual([1, 2]);
      await expect(actions.addChecklistItemAction(checklist.id, "  ")).rejects.toThrow(/^INVALID/);
      await expect(actions.addChecklistItemAction(randomUUID(), "x")).rejects.toThrow(/^NOT_FOUND/);

      const listed = (await actions.fetchChecklistsAction()).find((l) => l.id === checklist.id)!;
      expect(listed.items.map((i) => i.text)).toEqual(["A", "B", "C"]);
    });

    it("serializes concurrent appends (distinct, consecutive sortOrder)", async () => {
      const checklist = await actions.createChecklistAction({ title: "Paralelo" });
      const items = await Promise.all(["1", "2", "3", "4"].map((t) => actions.addChecklistItemAction(checklist.id, t)));
      expect(items.map((i) => i.sortOrder).sort()).toEqual([0, 1, 2, 3]);
    });

    it("toggles an item", async () => {
      const checklist = await actions.createChecklistAction({ title: "Toggle", items: ["Uno"] });
      const item = checklist.items[0]!;
      expect((await actions.toggleChecklistItemAction(item.id, true)).done).toBe(true);
      expect((await actions.toggleChecklistItemAction(item.id, false)).done).toBe(false);
      await expect(actions.toggleChecklistItemAction(randomUUID(), true)).rejects.toThrow(/^NOT_FOUND/);
    });

    it("reorders with exactly the checklist's ids", async () => {
      const checklist = await actions.createChecklistAction({ title: "Reordenar", items: ["A", "B", "C"] });
      const [a, b, c] = checklist.items.map((i) => i.id);
      await actions.reorderChecklistItemsAction(checklist.id, [c!, a!, b!]);
      const listed = (await actions.fetchChecklistsAction()).find((l) => l.id === checklist.id)!;
      expect(listed.items.map((i) => i.text)).toEqual(["C", "A", "B"]);
      expect(listed.items.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects an id list that is not exactly the checklist's items", async () => {
      const checklist = await actions.createChecklistAction({ title: "Exacto", items: ["A", "B"] });
      const other = await actions.createChecklistAction({ title: "Ajena", items: ["Z"] });
      const [a, b] = checklist.items.map((i) => i.id);
      const z = other.items[0]!.id;
      for (const ids of [[a!], [a!, b!, z], [a!, a!], [a!, z], [], [a!, "no-es-un-id"]]) {
        await expect(actions.reorderChecklistItemsAction(checklist.id, ids)).rejects.toThrow(/^INVALID/);
      }
      const listed = (await actions.fetchChecklistsAction()).find((l) => l.id === checklist.id)!;
      expect(listed.items.map((i) => i.text)).toEqual(["A", "B"]);
    });

    it("serializes concurrent reorders via lockForUpdate (one order wins whole)", async () => {
      const checklist = await actions.createChecklistAction({ title: "Carrera", items: ["A", "B", "C", "D"] });
      const ids = checklist.items.map((i) => i.id);
      const reversed = [...ids].reverse();
      const rotated = [ids[1]!, ids[2]!, ids[3]!, ids[0]!];
      await Promise.all([
        actions.reorderChecklistItemsAction(checklist.id, reversed),
        actions.reorderChecklistItemsAction(checklist.id, rotated),
      ]);
      const rows = await db
        .select({ id: schema.checklistItems.id, sortOrder: schema.checklistItems.sortOrder })
        .from(schema.checklistItems)
        .where(eq(schema.checklistItems.checklistId, checklist.id));
      const final = [...rows].sort((x, y) => x.sortOrder - y.sortOrder);
      expect(final.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3]);
      expect([reversed, rotated]).toContainEqual(final.map((r) => r.id));
    });

    it("archives a checklist out of the list", async () => {
      const checklist = await actions.createChecklistAction({ title: "Archivar lista", items: ["x"] });
      await actions.archiveChecklistAction(checklist.id);
      expect((await actions.fetchChecklistsAction()).map((l) => l.id)).not.toContain(checklist.id);
      await expect(actions.archiveChecklistAction(checklist.id)).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.addChecklistItemAction(checklist.id, "y")).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.toggleChecklistItemAction(checklist.items[0]!.id, true)).rejects.toThrow(/^NOT_FOUND/);
      await expect(actions.reorderChecklistItemsAction(checklist.id, [checklist.items[0]!.id])).rejects.toThrow(
        /^NOT_FOUND/,
      );
    });
  });

  // ── Owner-scoped instances (BE §8.0.3, §16) ──────────────────────────────

  type OwnerCase = {
    name: string;
    /** Creates a row as the owner; returns its id. */
    create(): Promise<string>;
    /** Every way another staff member could reach the row. */
    attempts: Array<[string, (id: string) => Promise<unknown>]>;
    /** Whether the row is still unchanged and visible to the owner. */
    ownerStillSees(id: string): Promise<boolean>;
  };

  const ownerCases: OwnerCase[] = [
    {
      name: "notes",
      create: async () => (await actions.createNoteAction({ title: "Privada", body: "solo mía" })).id,
      attempts: [
        ["update", (id) => actions.updateNoteAction(id, { title: "hackeada" })],
        ["archive", (id) => actions.archiveNoteAction(id)],
        ["restore", (id) => actions.restoreNoteAction(id)],
      ],
      ownerStillSees: async (id) =>
        (await actions.fetchNotesAction()).some((n) => n.id === id && n.title === "Privada"),
    },
    {
      name: "checklists",
      create: async () => (await actions.createChecklistAction({ title: "Privada", items: ["a", "b"] })).id,
      attempts: [
        ["add item", (id) => actions.addChecklistItemAction(id, "intrusa")],
        [
          "reorder",
          async (id) => {
            const rows = await db
              .select({ id: schema.checklistItems.id })
              .from(schema.checklistItems)
              .where(eq(schema.checklistItems.checklistId, id));
            return actions.reorderChecklistItemsAction(
              id,
              rows.map((r) => r.id).reverse(),
            );
          },
        ],
        ["archive", (id) => actions.archiveChecklistAction(id)],
      ],
      ownerStillSees: async (id) => {
        const list = (await actions.fetchChecklistsAction()).find((l) => l.id === id);
        return Boolean(list && list.items.map((i) => i.text).join() === "a,b");
      },
    },
    {
      name: "checklist items",
      create: async () => (await actions.createChecklistAction({ title: "Con ítem", items: ["mío"] })).items[0]!.id,
      attempts: [["toggle", (id) => actions.toggleChecklistItemAction(id, true)]],
      ownerStillSees: async (id) =>
        (await actions.fetchChecklistsAction()).some((l) => l.items.some((i) => i.id === id && !i.done)),
    },
  ];

  describe.each(ownerCases)("owner-scoped: $name", (ownerCase) => {
    it("another staff member can neither read nor write the row", async () => {
      as(ownerId);
      const id = await ownerCase.create();

      as(otherId);
      const notes = await actions.fetchNotesAction();
      const lists = await actions.fetchChecklistsAction();
      expect(notes.some((n) => n.id === id)).toBe(false);
      expect(lists.some((l) => l.id === id || l.items.some((i) => i.id === id))).toBe(false);
      for (const [, attempt] of ownerCase.attempts) {
        await expect(attempt(id)).rejects.toThrow(/^(FORBIDDEN|NOT_FOUND)/);
      }

      as(ownerId);
      expect(await ownerCase.ownerStillSees(id)).toBe(true);
    });

    it("rows are written with the session's staff id", async () => {
      as(ownerId);
      const id = await ownerCase.create();
      const [note] = await db.select({ staffId: schema.notes.staffId }).from(schema.notes).where(eq(schema.notes.id, id));
      const [list] = await db
        .select({ staffId: schema.checklists.staffId })
        .from(schema.checklists)
        .where(eq(schema.checklists.id, id));
      const [item] = await db
        .select({ staffId: schema.checklists.staffId })
        .from(schema.checklistItems)
        .innerJoin(schema.checklists, eq(schema.checklists.id, schema.checklistItems.checklistId))
        .where(eq(schema.checklistItems.id, id));
      expect((note ?? list ?? item)!.staffId).toBe(ownerId);
    });
  });

  it("an archived note of someone else can't be restored", async () => {
    as(ownerId);
    const note = await actions.createNoteAction({ title: "Archivada ajena" });
    await actions.archiveNoteAction(note.id);
    as(otherId);
    await expect(actions.restoreNoteAction(note.id)).rejects.toThrow(/^FORBIDDEN/);
    as(ownerId);
    expect((await actions.fetchNotesAction()).map((n) => n.id)).not.toContain(note.id);
  });
});
