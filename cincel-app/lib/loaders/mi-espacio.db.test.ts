// @vitest-environment node
/**
 * `/mi-espacio` page data against a real Postgres (Query Migration Phase 7,
 * #941, plan §4.8 rules 2–3): `getMiEspacioPageData` returns only the
 * caller's notifications, Gmail threads, reminders, checklists and notes;
 * notes and checklists are bounded pages that page on with their cursors; a
 * guest gets FORBIDDEN. Runs only when TEST_DATABASE_URL points at a migrated
 * database (`npm run db:migrate`). Every row belongs to per-run staff that is
 * deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asViewer, type TestViewer } from "@/lib/query/test-utils";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const READ = "https://www.googleapis.com/auth/gmail.readonly";
const COMPOSE = "https://www.googleapis.com/auth/gmail.compose";

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("getMiEspacioPageData (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const pageData = await import("@/lib/actions/page-data/mi-espacio-actions");
  const { CHECKLISTS_PAGE_SIZE, NOTES_PAGE_SIZE } = await import("@/lib/my-space/notes-checklists");

  const staffIds: string[] = [];
  let ana = "";
  let beto = "";

  const viewer = (id: string): TestViewer => ({ id, access: "Colaborador" });

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Mi espacio datos ${run} ${label}`, googleSub: `mi-espacio-${run}-${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function seedNotes(staffId: string, n: number, prefix: string) {
    await db.insert(schema.notes).values(
      Array.from({ length: n }, (_, i) => ({
        staffId,
        title: `${prefix} ${i}`,
        body: "",
        updatedAt: new Date(Date.UTC(2026, 10, 1, 12, 0, i)),
      })),
    );
  }

  async function seedChecklists(staffId: string, n: number, prefix: string) {
    const rows = await db
      .insert(schema.checklists)
      .values(
        Array.from({ length: n }, (_, i) => ({
          staffId,
          title: `${prefix} ${i}`,
          createdAt: new Date(Date.UTC(2026, 10, 1, 12, 0, i)),
        })),
      )
      .returning({ id: schema.checklists.id });
    await db
      .insert(schema.checklistItems)
      .values(rows.map((row, i) => ({ checklistId: row.id, text: `${prefix} punto ${i}`, sortOrder: 0 })));
  }

  async function seedEverything(staffId: string, prefix: string) {
    await db.insert(schema.notifications).values({ staffId, kind: "sistema", title: `${prefix} aviso`, inApp: true });
    await db
      .insert(schema.reminders)
      .values({ staffId, text: `${prefix} recordatorio`, dueAt: new Date(Date.now() + 60 * 60_000) });
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: `${staffId}@cincel.example`,
      accessToken: "enc-access",
      refreshToken: "enc-refresh",
      scope: `openid email ${READ} ${COMPOSE}`,
      googleSub: `mi-espacio-${run}-${prefix}`,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await db.insert(schema.gmailAccounts).values({ staffId });
    await db.insert(schema.gmailThreads).values({
      staffId,
      id: `hilo-${prefix}`,
      subject: `${prefix} correo`,
      fromName: "Luis",
      fromEmail: "luis@cliente.mx",
      snippet: "Hola",
      receivedAt: new Date(Date.UTC(2026, 10, 2, 15, 0, 0)),
    });
  }

  beforeAll(async () => {
    ana = await makeStaff("ana");
    beto = await makeStaff("beto");
    await seedEverything(ana, "Ana");
    await seedEverything(beto, "Beto");
    await seedNotes(ana, NOTES_PAGE_SIZE + 3, "Ana nota");
    await seedNotes(beto, 2, "Beto nota");
    await seedChecklists(ana, CHECKLISTS_PAGE_SIZE + 2, "Ana lista");
    await seedChecklists(beto, 1, "Beto lista");
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("returns only the caller's own rows", async () => {
    const data = await asViewer(viewer(beto), () => pageData.getMiEspacioPageData({}));

    expect(data.notifications.items.map((n) => n.title)).toEqual(["Beto aviso"]);
    expect(data.reminders.map((r) => r.text)).toEqual(["Beto recordatorio"]);
    expect(data.notes.map((n) => n.title).sort()).toEqual(["Beto nota 0", "Beto nota 1"]);
    expect(data.checklists.map((c) => c.title)).toEqual(["Beto lista 0"]);
    expect(data.gmail?.threads.map((t) => t.id)).toEqual(["hilo-Beto"]);

    const text = JSON.stringify(data);
    expect(text).not.toContain("Ana");
  });

  it("bounds notes and checklists to one page and pages on with the cursor", async () => {
    const data = await asViewer(viewer(ana), () => pageData.getMiEspacioPageData({}));

    expect(data.notes).toHaveLength(NOTES_PAGE_SIZE);
    expect(data.notesCursor).toBe(String(NOTES_PAGE_SIZE));
    expect(data.checklists).toHaveLength(CHECKLISTS_PAGE_SIZE);
    expect(data.checklistsCursor).toBe(String(CHECKLISTS_PAGE_SIZE));
    expect(data.checklists.every((c) => c.items.length === 1)).toBe(true);

    const moreNotes = await asViewer(viewer(ana), () =>
      pageData.fetchMiEspacioNotesPage({ cursor: data.notesCursor }),
    );
    expect(moreNotes.items).toHaveLength(3);
    expect(moreNotes.nextCursor).toBeNull();
    const allNotes = [...data.notes, ...moreNotes.items].map((n) => n.id);
    expect(new Set(allNotes).size).toBe(NOTES_PAGE_SIZE + 3);

    const moreLists = await asViewer(viewer(ana), () =>
      pageData.fetchMiEspacioChecklistsPage({ cursor: data.checklistsCursor }),
    );
    expect(moreLists.items).toHaveLength(2);
    expect(moreLists.nextCursor).toBeNull();
  });

  it("pages never cross owners", async () => {
    const page = await asViewer(viewer(beto), () => pageData.fetchMiEspacioNotesPage({ cursor: "0" }));
    expect(page.items.every((n) => n.title.startsWith("Beto"))).toBe(true);
  });

  it("rejects a malformed cursor with INVALID", async () => {
    await expect(
      asViewer(viewer(ana), () => pageData.fetchMiEspacioNotesPage({ cursor: "nope" })),
    ).rejects.toThrow(/^INVALID/);
  });

  it("FORBIDDEN for a guest", async () => {
    await expect(asViewer(null, () => pageData.getMiEspacioPageData({}))).rejects.toThrow(/FORBIDDEN/);
    await expect(asViewer(null, () => pageData.fetchMiEspacioNotesPage({}))).rejects.toThrow(/FORBIDDEN/);
  });
});
