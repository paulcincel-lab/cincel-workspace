// @vitest-environment node
/**
 * Gmail sync against a real Postgres (redesign BE §8.6) with an in-memory
 * Gmail: first sync, history sync, 404 fallback, trim to 500, project
 * suggestion, reconnect and owner isolation. Runs only when
 * TEST_DATABASE_URL points at a migrated database; every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

type FakeMessage = { id: string; from: string; subject: string; snippet: string; at: number; labels: string[] };

describe.skipIf(!url)("syncGmail (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { syncGmail, GMAIL_CACHE_LIMIT } = await import("./sync");
  const { connectGmailAccount } = await import("./accounts");
  const { GmailError } = await import("./client");
  type GmailApi = import("./client").GmailApi;

  const ids = { staff: [] as string[], projects: [] as string[] };
  let staffA = "";
  let staffB = "";
  let roble = "";
  let olderRoble = "";

  // ── In-memory Gmail ─────────────────────────────────────────────────────
  let mailbox: Map<string, FakeMessage[]>;
  let historyId = 1000;
  let historyResult: { history: unknown[]; historyId: string } | Error | null = null;
  const calls = { listThreads: 0, listHistory: [] as string[], getThread: 0 };

  const addThread = (id: string, m: Omit<FakeMessage, "id" | "labels"> & { labels?: string[] }) => {
    mailbox.set(id, [...(mailbox.get(id) ?? []), { id: `${id}-m${(mailbox.get(id)?.length ?? 0) + 1}`, labels: ["INBOX", "UNREAD"], ...m }]);
    historyId += 1;
  };

  const fakeApi: GmailApi = {
    async listThreads({ q, maxResults = 50, pageToken }) {
      calls.listThreads++;
      expect(q).toBe("in:inbox");
      const inbox = [...mailbox.entries()]
        .filter(([, msgs]) => msgs.some((m) => m.labels.includes("INBOX")))
        .sort((a, b) => Math.max(...b[1].map((m) => m.at)) - Math.max(...a[1].map((m) => m.at)));
      const start = pageToken ? Number(pageToken) : 0;
      const page = inbox.slice(start, start + maxResults);
      const next = start + maxResults < inbox.length ? String(start + maxResults) : undefined;
      return { threads: page.map(([id]) => ({ id, historyId: String(historyId) })), nextPageToken: next };
    },
    async getThread(id) {
      calls.getThread++;
      const msgs = mailbox.get(id);
      if (!msgs) throw new GmailError("NOT_FOUND", 404);
      return {
        id,
        historyId: String(historyId),
        messages: msgs.map((m) => ({
          id: m.id,
          threadId: id,
          labelIds: m.labels,
          snippet: m.snippet,
          internalDate: String(m.at),
          payload: {
            headers: [
              { name: "Subject", value: m.subject },
              { name: "From", value: m.from },
            ],
          },
        })),
      };
    },
    async listHistory(start) {
      calls.listHistory.push(start);
      if (historyResult instanceof Error) throw historyResult;
      return historyResult ?? { history: [], historyId: String(historyId) };
    },
    markThreadRead: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    sendDraft: vi.fn(),
    getAttachment: vi.fn(),
  };

  const deps = { api: fakeApi, now: () => new Date("2026-11-07T12:00:00Z") };

  const threadsOf = (staffId: string) =>
    db.select().from(schema.gmailThreads).where(eq(schema.gmailThreads.staffId, staffId));
  const accountOf = async (staffId: string) =>
    (await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, staffId)))[0];

  beforeAll(async () => {
    const staffRows = await db
      .insert(schema.staff)
      .values([
        { name: `Gmail A ${run}`, email: `gmail-a-${run}@cincel.example` },
        { name: `Gmail B ${run}`, email: `gmail-b-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    [staffA, staffB] = staffRows.map((r) => r.id);
    ids.staff.push(staffA, staffB);

    const projectRows = await db
      .insert(schema.projects)
      .values([
        { name: `Roble ${run}`, updatedAt: new Date("2026-11-05T10:00:00Z") },
        { name: `Casa Roble ${run}`, updatedAt: new Date("2026-10-01T10:00:00Z") },
        { name: `Cerrado ${run}`, status: "completado" },
      ])
      .returning({ id: schema.projects.id });
    [roble, olderRoble] = projectRows.map((r) => r.id);
    ids.projects.push(...projectRows.map((r) => r.id));
  });

  afterAll(async () => {
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
  });

  beforeEach(async () => {
    mailbox = new Map();
    historyResult = null;
    calls.listThreads = 0;
    calls.listHistory = [];
    calls.getThread = 0;
    await db.delete(schema.gmailThreads).where(inArray(schema.gmailThreads.staffId, [staffA, staffB]));
    await db.delete(schema.gmailAccounts).where(inArray(schema.gmailAccounts.staffId, [staffA, staffB]));
    await connectGmailAccount(db, staffA);
  });

  it("first sync stores up to 100 inbox threads, the history id and clears the error", async () => {
    for (let i = 0; i < 130; i++) {
      addThread(`t${i}`, { from: `"Proveedor ${i}" <p${i}@proveedor.example>`, subject: `Asunto ${i}`, snippet: `s ${i}`, at: 1_700_000_000_000 + i * 1000 });
    }
    addThread("archived", { from: "x@y.example", subject: "Viejo", snippet: "", at: 1_800_000_000_000, labels: ["CATEGORY_UPDATES"] });
    await db.update(schema.gmailAccounts).set({ lastError: "rate_limited:2" }).where(eq(schema.gmailAccounts.staffId, staffA));

    const result = await syncGmail(db, staffA, deps);
    expect(result.synced).toBe(100);
    const rows = await threadsOf(staffA);
    expect(rows).toHaveLength(100);
    // The newest 100 of the inbox: t30..t129.
    expect(rows.map((r) => r.id)).toContain("t129");
    expect(rows.map((r) => r.id)).not.toContain("t29");
    expect(rows.map((r) => r.id)).not.toContain("archived");
    const t5 = rows.find((r) => r.id === "t129")!;
    expect(t5).toMatchObject({ subject: "Asunto 129", fromName: "Proveedor 129", fromEmail: "p129@proveedor.example", unread: true });
    expect(t5.labels).toEqual(expect.arrayContaining(["INBOX", "UNREAD"]));

    const account = await accountOf(staffA);
    expect(account.historyId).toBe(String(historyId));
    expect(account.lastSyncedAt?.toISOString()).toBe("2026-11-07T12:00:00.000Z");
    expect(account.lastError).toBeNull();
    expect(account.nextSyncAfter).toBeNull();
    expect(calls.listHistory).toHaveLength(0);
  });

  it("a second run uses history.list from the stored history id", async () => {
    addThread("a1", { from: "a@x.example", subject: "Uno", snippet: "", at: 1_700_000_000_000 });
    await syncGmail(db, staffA, deps);
    const first = (await accountOf(staffA)).historyId!;
    const listsBefore = calls.listThreads;

    addThread("a2", { from: "b@x.example", subject: "Dos", snippet: "", at: 1_700_000_100_000 });
    historyResult = {
      history: [{ id: String(historyId), messagesAdded: [{ message: { id: "a2-m1", threadId: "a2" } }] }],
      historyId: String(historyId),
    };
    const result = await syncGmail(db, staffA, deps);
    expect(calls.listHistory).toEqual([first]);
    expect(calls.listThreads).toBe(listsBefore);
    expect(result.synced).toBe(1);
    expect((await threadsOf(staffA)).map((r) => r.id).sort()).toEqual(["a1", "a2"]);
    expect((await accountOf(staffA)).historyId).toBe(String(historyId));
  });

  it("drops a thread that left the inbox, unless it is linked to a project", async () => {
    addThread("keep", { from: "a@x.example", subject: "Linked", snippet: "", at: 1_700_000_000_000 });
    addThread("drop", { from: "a@x.example", subject: "Unlinked", snippet: "", at: 1_700_000_000_500 });
    await syncGmail(db, staffA, deps);
    await db
      .update(schema.gmailThreads)
      .set({ projectId: roble })
      .where(and(eq(schema.gmailThreads.staffId, staffA), eq(schema.gmailThreads.id, "keep")));
    for (const id of ["keep", "drop"]) for (const m of mailbox.get(id)!) m.labels = ["IMPORTANT"];
    historyResult = {
      history: [
        { id: "1", labelsRemoved: [{ message: { id: "keep-m1", threadId: "keep" }, labelIds: ["INBOX"] }] },
        { id: "2", labelsRemoved: [{ message: { id: "drop-m1", threadId: "drop" }, labelIds: ["INBOX"] }] },
      ],
      historyId: String(historyId + 1),
    };
    await syncGmail(db, staffA, deps);
    const rows = await threadsOf(staffA);
    expect(rows.map((r) => r.id)).toEqual(["keep"]);
    expect(rows[0].labels).toEqual(["IMPORTANT"]);
    expect(rows[0].projectId).toBe(roble);
  });

  it("a history 404 falls back to a full list", async () => {
    addThread("f1", { from: "a@x.example", subject: "Uno", snippet: "", at: 1_700_000_000_000 });
    await db.update(schema.gmailAccounts).set({ historyId: "1" }).where(eq(schema.gmailAccounts.staffId, staffA));
    historyResult = new GmailError("NOT_FOUND", 404);
    const result = await syncGmail(db, staffA, deps);
    expect(calls.listHistory).toEqual(["1"]);
    expect(calls.listThreads).toBeGreaterThan(0);
    expect(result.synced).toBe(1);
    expect((await accountOf(staffA)).historyId).toBe(String(historyId));
  });

  it("trims the cache to the newest 500 rows of the staff member only", async () => {
    const old = Array.from({ length: 510 }, (_, i) => ({
      id: `old-${i}`,
      staffId: staffA,
      receivedAt: new Date(1_600_000_000_000 + i * 1000),
    }));
    await db.insert(schema.gmailThreads).values(old);
    await db.insert(schema.gmailThreads).values({ id: "old-0", staffId: staffB, receivedAt: new Date(1_500_000_000_000) });
    addThread("fresh", { from: "a@x.example", subject: "Nuevo", snippet: "", at: 1_700_000_000_000 });

    await syncGmail(db, staffA, deps);
    const rows = await threadsOf(staffA);
    expect(rows).toHaveLength(GMAIL_CACHE_LIMIT);
    const kept = new Set(rows.map((r) => r.id));
    expect(kept.has("fresh")).toBe(true);
    expect(kept.has("old-509")).toBe(true);
    // 511 rows → the 11 oldest go.
    expect(kept.has("old-10")).toBe(false);
    expect(kept.has("old-11")).toBe(true);
    // Another staff member's cache is untouched.
    expect((await threadsOf(staffB)).map((r) => r.id)).toEqual(["old-0"]);
  });

  it("suggests the most recently updated active project and never links it", async () => {
    addThread("s1", { from: "a@x.example", subject: `Planos casa roble ${run}`, snippet: "", at: 1_700_000_000_000 });
    addThread("s2", { from: "a@x.example", subject: "Hola", snippet: `Te mando lo de Cerrado ${run} hoy`, at: 1_700_000_000_100 });
    addThread("s3", { from: "a@x.example", subject: "Hola", snippet: `Avance de ROBLE ${run.toUpperCase()}.`, at: 1_700_000_000_200 });
    await syncGmail(db, staffA, deps);
    const rows = new Map((await threadsOf(staffA)).map((r) => [r.id, r]));
    // "Casa Roble <run>" and "Roble <run>" both match; "Roble <run>" was updated last.
    expect(rows.get("s1")?.suggestedProjectId).toBe(roble);
    expect(rows.get("s1")?.suggestedProjectId).not.toBe(olderRoble);
    // A completed project is not a candidate.
    expect(rows.get("s2")?.suggestedProjectId).toBeNull();
    // Snippet match (≥ 8 chars).
    expect(rows.get("s3")?.suggestedProjectId).toBe(roble);
    for (const row of rows.values()) expect(row.projectId).toBeNull();
  });

  it("refuses a disconnected account and creates no rows", async () => {
    addThread("x1", { from: "a@x.example", subject: "Uno", snippet: "", at: 1_700_000_000_000 });
    await db
      .update(schema.gmailAccounts)
      .set({ disconnectedAt: new Date() })
      .where(eq(schema.gmailAccounts.staffId, staffA));
    await expect(syncGmail(db, staffA, deps)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    await expect(syncGmail(db, staffB, deps)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    expect(await threadsOf(staffA)).toHaveLength(0);
    expect(calls.getThread).toBe(0);
  });

  it("reconnecting clears disconnected_at, resets history_id and runs a full first sync", async () => {
    addThread("r1", { from: "a@x.example", subject: "Uno", snippet: "", at: 1_700_000_000_000 });
    await db
      .update(schema.gmailAccounts)
      .set({ disconnectedAt: new Date(), historyId: "77", lastError: "invalid_grant" })
      .where(eq(schema.gmailAccounts.staffId, staffA));

    await connectGmailAccount(db, staffA);
    const account = await accountOf(staffA);
    expect(account.disconnectedAt).toBeNull();
    expect(account.historyId).toBeNull();
    expect(account.lastError).toBeNull();

    await syncGmail(db, staffA, deps);
    expect(calls.listHistory).toHaveLength(0);
    expect(calls.listThreads).toBeGreaterThan(0);
    expect((await threadsOf(staffA)).map((r) => r.id)).toEqual(["r1"]);
  });

  it("the same Gmail thread id is cached separately per staff member", async () => {
    addThread("shared", { from: "a@x.example", subject: "Para A", snippet: "", at: 1_700_000_000_000 });
    await connectGmailAccount(db, staffB);
    await syncGmail(db, staffA, deps);
    mailbox.get("shared")![0].subject = "Para B";
    await syncGmail(db, staffB, deps);
    expect((await threadsOf(staffA))[0].subject).toBe("Para A");
    expect((await threadsOf(staffB))[0].subject).toBe("Para B");
  });
});
