// @vitest-environment node
/**
 * Gmail actions against a real Postgres with a mocked Gmail client (redesign
 * BE §7.6, §8.6, §16): status, cached threads, live thread read, sync rate
 * limit, link, task from mail, draft reuse, confirm/expired send and
 * disconnect. Every read and write touches only the caller's rows. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { lockTramoCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "", email: "ana@cincel.example" }));
const caps = vi.hoisted(() => ({ canViewProjects: true, canCreateActivity: true }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Ana",
      role: "Colaborador",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: session.email,
      phone: "",
    },
    email: session.email,
    access: "Colaborador",
  })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canViewProjects: caps.canViewProjects }),
  resolveActivitiesCapabilities: () => ({ canCreateActivity: caps.canCreateActivity }),
}));

const gmail = vi.hoisted(() => ({
  api: {
    listThreads: vi.fn(),
    getThread: vi.fn(),
    listHistory: vi.fn(),
    markThreadRead: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    sendDraft: vi.fn(),
    getAttachment: vi.fn(),
  },
  sendDraft: vi.fn(),
  syncGmail: vi.fn(),
}));
vi.mock("@/lib/gmail/client", () => ({
  gmailClient: vi.fn(async () => gmail.api),
  sendDraft: gmail.sendDraft,
}));
vi.mock("@/lib/gmail/sync", () => ({ syncGmail: gmail.syncGmail }));

const READ = "https://www.googleapis.com/auth/gmail.readonly";
const COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
const MODIFY = "https://www.googleapis.com/auth/gmail.modify";
const GMAIL_SCOPE = `openid email profile ${READ} ${COMPOSE}`;

const run = randomUUID().slice(0, 8);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function rawThread(id: string, opts: { unread?: boolean } = {}) {
  return {
    id,
    messages: [
      {
        id: `${id}m1`,
        threadId: id,
        labelIds: ["INBOX", ...(opts.unread === false ? [] : ["UNREAD"])],
        snippet: "Te envío el plano",
        internalDate: String(Date.UTC(2026, 10, 2, 15, 0, 0)),
        payload: {
          partId: "",
          mimeType: "multipart/mixed",
          headers: [
            { name: "Subject", value: "Plano cocina" },
            { name: "From", value: '"Luis Pérez" <luis@cliente.mx>' },
            { name: "To", value: "Ana <ana@cincel.example>, obra@cincel.example" },
            { name: "Message-ID", value: "<m1@cliente.mx>" },
          ],
          parts: [
            {
              partId: "0",
              mimeType: "multipart/alternative",
              parts: [
                { partId: "0.0", mimeType: "text/plain", body: { size: 18, data: b64("Te envío el plano") } },
                {
                  partId: "0.1",
                  mimeType: "text/html",
                  body: { size: 60, data: b64('<p onclick="x()">Te envío <b>el plano</b></p><script>alert(1)</script>') },
                },
              ],
            },
            {
              partId: "1",
              mimeType: "application/pdf",
              filename: "plano.pdf",
              headers: [{ name: "Content-Disposition", value: 'attachment; filename="plano.pdf"' }],
              body: { attachmentId: "ANGjdJ-fresh", size: 1234 },
            },
          ],
        },
      },
    ],
  };
}

describe.skipIf(!url)("gmail actions (test DB)", async () => {
  // Reads the tramo catalog (and creates a tramo when the DB has none): one catalog file at a time.
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockTramoCatalog(url!);
  }, 300_000);

  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = await import("@/lib/actions/gmail-actions");
  const { issueConfirmToken } = await import("@/lib/gmail/confirm-token");

  const staffIds: string[] = [];
  const projectIds: string[] = [];
  let createdWorkflowId: string | null = null;
  let me = "";
  let other = "";
  let projectId = "";

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Gmail ${run} ${label}`, googleSub: `gmail-${run}-${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function grant(staffId: string, scope: string) {
    await db.delete(schema.googleOauthAccounts).where(eq(schema.googleOauthAccounts.staffId, staffId));
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: `${staffId}@cincel.example`,
      accessToken: "enc-access",
      refreshToken: "enc-refresh",
      scope,
      googleSub: `gmail-${run}-${staffId}`,
      expiresAt: new Date(Date.now() + 3600_000),
    });
  }

  async function connect(staffId: string, values: Partial<typeof schema.gmailAccounts.$inferInsert> = {}) {
    await db.delete(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, staffId));
    await db.insert(schema.gmailAccounts).values({ staffId, ...values });
  }

  async function cacheThread(staffId: string, id: string, values: Partial<typeof schema.gmailThreads.$inferInsert> = {}) {
    await db.insert(schema.gmailThreads).values({
      staffId,
      id,
      subject: "Plano cocina",
      fromName: "Luis Pérez",
      fromEmail: "luis@cliente.mx",
      snippet: "Te envío el plano",
      receivedAt: new Date(Date.UTC(2026, 10, 2, 15, 0, 0)),
      ...values,
    });
  }

  beforeAll(async () => {
    me = await makeStaff("me");
    other = await makeStaff("other");
    let [workflow] = await db
      .select({ id: schema.workflows.id })
      .from(schema.workflows)
      .where(and(isNull(schema.workflows.deletedAt), eq(schema.workflows.active, true)))
      .limit(1);
    if (!workflow) {
      [workflow] = await db
        .insert(schema.workflows)
        .values({ key: `gmail-${run}`, name: `Tramo ${run}`, sortOrder: 990 })
        .returning({ id: schema.workflows.id });
      createdWorkflowId = workflow!.id;
    }
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Casa Gmail ${run}`, currentWorkflowId: workflow!.id })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    projectIds.push(projectId);
  });

  afterAll(async () => {
    try {
      if (projectIds.length) {
        const taskRows = await db
          .select({ id: schema.tasks.id })
          .from(schema.tasks)
          .where(inArray(schema.tasks.projectId, projectIds));
        const taskIds = taskRows.map((t) => t.id);
        if (taskIds.length) {
          await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
          await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
        }
        await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, projectIds));
        await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
      }
      if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
      if (createdWorkflowId) await db.delete(schema.workflows).where(eq(schema.workflows.id, createdWorkflowId));
    } finally {
      await unlockCatalog?.();
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("SESSION_SECRET", "gmail-test-secret");
    session.memberId = me;
    caps.canViewProjects = true;
    caps.canCreateActivity = true;
    for (const id of [me, other]) {
      await db.delete(schema.gmailThreads).where(eq(schema.gmailThreads.staffId, id));
      await grant(id, GMAIL_SCOPE);
      await connect(id);
    }
    await db.update(schema.projects).set({ deletedAt: null }).where(eq(schema.projects.id, projectId));
    gmail.api.getThread.mockImplementation(async (id: string) => rawThread(id));
    gmail.api.markThreadRead.mockResolvedValue(undefined);
    gmail.syncGmail.mockImplementation(async (executor: typeof db, staffId: string) => {
      await executor
        .update(schema.gmailAccounts)
        .set({ lastSyncedAt: new Date(), lastError: null })
        .where(eq(schema.gmailAccounts.staffId, staffId));
      return { synced: 3 };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("fetchGmailStatusAction", () => {
    it("reports connected with both scopes", async () => {
      const at = new Date(Date.UTC(2026, 10, 3, 12, 0, 0));
      await connect(me, { lastSyncedAt: at, lastError: null });
      await expect(actions.fetchGmailStatusAction()).resolves.toEqual({
        connected: true,
        scopeOk: true,
        lastSyncedAt: at.toISOString(),
        lastError: null,
      });
    });

    it("is not connected without a Gmail grant or without a sync row", async () => {
      await grant(me, "openid email profile");
      expect((await actions.fetchGmailStatusAction()).connected).toBe(false);
      await grant(me, GMAIL_SCOPE);
      await db.delete(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, me));
      expect((await actions.fetchGmailStatusAction()).connected).toBe(false);
    });

    it("reports scopeOk false with only one Gmail scope", async () => {
      await grant(me, `openid ${COMPOSE}`);
      await expect(actions.fetchGmailStatusAction()).resolves.toMatchObject({ connected: true, scopeOk: false });
    });

    it("is not connected after disconnectGmailAction", async () => {
      await actions.disconnectGmailAction();
      expect((await actions.fetchGmailStatusAction()).connected).toBe(false);
      await expect(actions.fetchGmailThreadsAction({})).rejects.toThrow(/^NOT_CONNECTED/);
      await expect(actions.fetchGmailThreadAction("t1")).rejects.toThrow(/^NOT_CONNECTED/);
    });
  });

  describe("fetchGmailThreadsAction", () => {
    it("pages the caller's cache by 30, newest first, and never returns another staff member's rows", async () => {
      for (let i = 0; i < 35; i++) {
        await cacheThread(me, `t${String(i).padStart(2, "0")}`, {
          receivedAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000),
        });
      }
      await cacheThread(other, "foreign", { receivedAt: new Date(Date.UTC(2027, 0, 1)) });

      const first = await actions.fetchGmailThreadsAction({});
      expect(first.threads).toHaveLength(30);
      expect(first.threads[0]!.id).toBe("t34");
      expect(first.threads[0]!.from).toBe("Luis Pérez <luis@cliente.mx>");
      expect(first.nextCursor).not.toBeNull();

      const second = await actions.fetchGmailThreadsAction({ cursor: first.nextCursor! });
      expect(second.threads.map((t) => t.id)).toEqual(["t04", "t03", "t02", "t01", "t00"]);
      expect(second.nextCursor).toBeNull();
      expect([...first.threads, ...second.threads].some((t) => t.id === "foreign")).toBe(false);
    });

    it("matches subject, sender and snippet case-insensitively, wildcards literally", async () => {
      await cacheThread(me, "a", { subject: "Cotización CASA Roble" });
      await cacheThread(me, "b", { subject: "Otro", fromName: "Roberta", fromEmail: "rob@x.mx" });
      await cacheThread(me, "c", { subject: "Otro", snippet: "medidas del roble" });
      await cacheThread(me, "d", { subject: "100% listo" });
      await cacheThread(other, "e", { subject: "roble ajeno" });

      const ids = async (query: string) => (await actions.fetchGmailThreadsAction({ query })).threads.map((t) => t.id).sort();
      expect(await ids("roble")).toEqual(["a", "c"]);
      expect(await ids("ROB")).toEqual(["a", "b", "c"]);
      expect(await ids("%")).toEqual(["d"]);
    });

    it("SCOPE_MISSING without gmail.readonly", async () => {
      await grant(me, `openid ${COMPOSE}`);
      await expect(actions.fetchGmailThreadsAction({})).rejects.toThrow(/^SCOPE_MISSING/);
    });

    it("INVALID for a malformed cursor", async () => {
      await expect(actions.fetchGmailThreadsAction({ cursor: "nope" })).rejects.toThrow(/^INVALID/);
    });
  });

  describe("fetchGmailThreadAction", () => {
    it("returns sanitized html and attachments, marks the thread read in the cache", async () => {
      await cacheThread(me, "t1", { unread: true, projectId });
      const result = await actions.fetchGmailThreadAction("t1");

      expect(gmail.api.getThread).toHaveBeenCalledWith("t1", "full");
      expect(result.thread).toMatchObject({ id: "t1", unread: false, projectId });
      expect(result.messages).toHaveLength(1);
      const [message] = result.messages;
      expect(message!.html).toContain("<b>el plano</b>");
      expect(message!.html).not.toMatch(/script|onclick/);
      expect(message!.text).toBe("Te envío el plano");
      expect(message!.from).toBe("Luis Pérez <luis@cliente.mx>");
      expect(message!.to).toEqual(["Ana <ana@cincel.example>", "obra@cincel.example"]);
      expect(result.attachments).toEqual([
        { messageId: "t1m1", attachmentId: "t1~1", name: "plano.pdf", mime: "application/pdf", size: 1234 },
      ]);

      const [row] = await db
        .select({ unread: schema.gmailThreads.unread })
        .from(schema.gmailThreads)
        .where(and(eq(schema.gmailThreads.staffId, me), eq(schema.gmailThreads.id, "t1")));
      expect(row!.unread).toBe(false);
    });

    it("marks the thread read in Gmail when the grant allows label changes", async () => {
      await grant(me, `${GMAIL_SCOPE} ${MODIFY}`);
      await cacheThread(me, "t1", { unread: true });
      await actions.fetchGmailThreadAction("t1");
      expect(gmail.api.markThreadRead).toHaveBeenCalledWith("t1");
    });

    it("leaves Gmail labels alone with a read-only grant (the call would be refused)", async () => {
      await cacheThread(me, "t1", { unread: true });
      await actions.fetchGmailThreadAction("t1");
      expect(gmail.api.markThreadRead).not.toHaveBeenCalled();
    });

    it("never touches another staff member's cached row with the same id", async () => {
      await cacheThread(other, "t1", { unread: true, projectId });
      const result = await actions.fetchGmailThreadAction("t1");
      expect(result.thread.projectId).toBeNull();
      const [row] = await db
        .select({ unread: schema.gmailThreads.unread })
        .from(schema.gmailThreads)
        .where(and(eq(schema.gmailThreads.staffId, other), eq(schema.gmailThreads.id, "t1")));
      expect(row!.unread).toBe(true);
    });

    it("NOT_FOUND when the thread isn't in the caller's mailbox", async () => {
      gmail.api.getThread.mockRejectedValue(new Error("NOT_FOUND"));
      await expect(actions.fetchGmailThreadAction("ajeno")).rejects.toThrow(/^NOT_FOUND/);
    });
  });

  describe("syncGmailAction", () => {
    it("RATE_LIMITED the second time within 30 s", async () => {
      await expect(actions.syncGmailAction()).resolves.toEqual({ synced: 3 });
      await expect(actions.syncGmailAction()).rejects.toThrow(/^RATE_LIMITED/);
      expect(gmail.syncGmail).toHaveBeenCalledTimes(1);
    });

    it("RATE_LIMITED during a backoff", async () => {
      await connect(me, { nextSyncAfter: new Date(Date.now() + 5 * 60_000) });
      await expect(actions.syncGmailAction()).rejects.toThrow(/^RATE_LIMITED/);
      expect(gmail.syncGmail).not.toHaveBeenCalled();
    });

    it("syncs again once 30 s have passed", async () => {
      await connect(me, { lastSyncedAt: new Date(Date.now() - 31_000) });
      await expect(actions.syncGmailAction()).resolves.toEqual({ synced: 3 });
    });

    it("NOT_CONNECTED after a disconnect", async () => {
      await actions.disconnectGmailAction();
      await expect(actions.syncGmailAction()).rejects.toThrow(/^NOT_CONNECTED/);
    });
  });

  describe("linkGmailThreadToProjectAction", () => {
    const comments = () =>
      db
        .select({ comment: schema.historyEvents.comment, actorId: schema.historyEvents.actorId })
        .from(schema.historyEvents)
        .where(and(eq(schema.historyEvents.entity, "project"), eq(schema.historyEvents.entityId, projectId)));

    it("links with a project history comment, and unlinks with null", async () => {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
      await cacheThread(me, "t1");

      await actions.linkGmailThreadToProjectAction("t1", projectId);
      expect(await comments()).toEqual([{ comment: "Correo vinculado: Plano cocina", actorId: me }]);
      let [row] = await db
        .select({ projectId: schema.gmailThreads.projectId })
        .from(schema.gmailThreads)
        .where(and(eq(schema.gmailThreads.staffId, me), eq(schema.gmailThreads.id, "t1")));
      expect(row!.projectId).toBe(projectId);

      await actions.linkGmailThreadToProjectAction("t1", null);
      [row] = await db
        .select({ projectId: schema.gmailThreads.projectId })
        .from(schema.gmailThreads)
        .where(and(eq(schema.gmailThreads.staffId, me), eq(schema.gmailThreads.id, "t1")));
      expect(row!.projectId).toBeNull();
      expect(await comments()).toHaveLength(1);
    });

    it("FORBIDDEN for a project the caller cannot see", async () => {
      await cacheThread(me, "t1");
      caps.canViewProjects = false;
      await expect(actions.linkGmailThreadToProjectAction("t1", projectId)).rejects.toThrow(/^FORBIDDEN/);
    });

    it("NOT_FOUND for another staff member's thread or a deleted project", async () => {
      await cacheThread(other, "t9");
      await expect(actions.linkGmailThreadToProjectAction("t9", projectId)).rejects.toThrow(/^NOT_FOUND/);

      await cacheThread(me, "t1");
      await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
      await expect(actions.linkGmailThreadToProjectAction("t1", projectId)).rejects.toThrow(/^NOT_FOUND/);
    });
  });

  describe("createTaskFromGmailThreadAction", () => {
    it("creates the task with the subject as title and the mail in the notes, and links the thread", async () => {
      await cacheThread(me, "t1");
      const { taskId } = await actions.createTaskFromGmailThreadAction("t1", { projectId });

      const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
      expect(task!.title).toBe("Plano cocina");
      expect(task!.projectId).toBe(projectId);
      expect(task!.kind).toBe("usuario");
      expect(task!.createdById).toBe(me);
      expect(task!.notes).toContain("Luis Pérez <luis@cliente.mx>");
      expect(task!.notes).toContain("Te envío el plano");
      expect(task!.notes).toContain("https://mail.google.com/mail/?authuser=ana%40cincel.example#all/t1");

      const [row] = await db
        .select({ projectId: schema.gmailThreads.projectId })
        .from(schema.gmailThreads)
        .where(and(eq(schema.gmailThreads.staffId, me), eq(schema.gmailThreads.id, "t1")));
      expect(row!.projectId).toBe(projectId);
    });

    it("uses the given title", async () => {
      await cacheThread(me, "t2");
      const { taskId } = await actions.createTaskFromGmailThreadAction("t2", { projectId, title: "Revisar plano" });
      const [task] = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
      expect(task!.title).toBe("Revisar plano");
    });

    it("FORBIDDEN without canCreateActivity or without project access", async () => {
      await cacheThread(me, "t1");
      caps.canCreateActivity = false;
      await expect(actions.createTaskFromGmailThreadAction("t1", { projectId })).rejects.toThrow(/^FORBIDDEN/);
      caps.canCreateActivity = true;
      caps.canViewProjects = false;
      await expect(actions.createTaskFromGmailThreadAction("t1", { projectId })).rejects.toThrow(/^FORBIDDEN/);
    });

    it("NOT_FOUND for another staff member's thread; NOT_CONNECTED when disconnected", async () => {
      await cacheThread(other, "t9");
      await expect(actions.createTaskFromGmailThreadAction("t9", { projectId })).rejects.toThrow(/^NOT_FOUND/);
      await actions.disconnectGmailAction();
      await expect(actions.createTaskFromGmailThreadAction("t9", { projectId })).rejects.toThrow(/^NOT_CONNECTED/);
    });
  });

  describe("drafts and send", () => {
    const draft = { to: ["luis@cliente.mx"], subject: "Re: Plano cocina", body: "Gracias, **revisamos**." };

    it("creates a draft, then updates the same one with a fresh token", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 7, 10, 0, 0)));
      gmail.api.createDraft.mockResolvedValue({ id: "d1" });
      gmail.api.updateDraft.mockResolvedValue({ id: "d1" });

      const first = await actions.createGmailDraftAction(draft);
      expect(first.draftId).toBe("d1");
      expect(first.expiresAt).toBe(new Date(Date.UTC(2026, 10, 7, 10, 10, 0)).toISOString());
      expect(gmail.api.createDraft).toHaveBeenCalledTimes(1);
      const raw = Buffer.from(gmail.api.createDraft.mock.calls[0]![0] as string, "base64url").toString("utf8");
      expect(raw).toMatch(/^To: luis@cliente\.mx/m);

      vi.setSystemTime(new Date(Date.UTC(2026, 10, 7, 10, 1, 0)));
      const second = await actions.createGmailDraftAction({ ...draft, body: "Gracias.", draftId: "d1" });
      expect(gmail.api.createDraft).toHaveBeenCalledTimes(1);
      expect(gmail.api.updateDraft).toHaveBeenCalledWith("d1", expect.any(String), undefined);
      expect(second.draftId).toBe("d1");
      expect(second.confirmToken).not.toBe(first.confirmToken);
    });

    it("replies in the thread with In-Reply-To", async () => {
      gmail.api.createDraft.mockResolvedValue({ id: "d2" });
      await actions.createGmailDraftAction({ ...draft, replyToThreadId: "t1" });
      expect(gmail.api.getThread).toHaveBeenCalledWith("t1", "metadata");
      const [rawArg, threadArg] = gmail.api.createDraft.mock.calls[0]!;
      expect(threadArg).toBe("t1");
      expect(Buffer.from(rawArg as string, "base64url").toString("utf8")).toMatch(/^In-Reply-To: <m1@cliente\.mx>/m);
    });

    it("NOT_FOUND for an unknown or foreign draftId", async () => {
      gmail.api.updateDraft.mockRejectedValue(new Error("NOT_FOUND"));
      await expect(actions.createGmailDraftAction({ ...draft, draftId: "ajeno" })).rejects.toThrow(/^NOT_FOUND/);
    });

    it("INVALID without recipients; SCOPE_MISSING without gmail.compose", async () => {
      await expect(actions.createGmailDraftAction({ ...draft, to: [] })).rejects.toThrow(/^INVALID/);
      await grant(me, `openid ${READ}`);
      await expect(actions.createGmailDraftAction(draft)).rejects.toThrow(/^SCOPE_MISSING/);
    });

    it("CONFIRM_REQUIRED for a missing or mismatched token", async () => {
      await expect(actions.sendGmailDraftAction("d1", "")).rejects.toThrow(/^CONFIRM_REQUIRED/);
      const forOther = issueConfirmToken("gmail-test-secret", other, "d1").confirmToken;
      await expect(actions.sendGmailDraftAction("d1", forOther)).rejects.toThrow(/^CONFIRM_REQUIRED/);
      const forOtherDraft = issueConfirmToken("gmail-test-secret", me, "d2").confirmToken;
      await expect(actions.sendGmailDraftAction("d1", forOtherDraft)).rejects.toThrow(/^CONFIRM_REQUIRED/);
      expect(gmail.sendDraft).not.toHaveBeenCalled();
    });

    it("EXPIRED after 10 minutes", async () => {
      const old = issueConfirmToken("gmail-test-secret", me, "d1", Date.now() - 10 * 60_000 - 1000).confirmToken;
      await expect(actions.sendGmailDraftAction("d1", old)).rejects.toThrow(/^EXPIRED/);
      expect(gmail.sendDraft).not.toHaveBeenCalled();
    });

    it("sends with a valid token through sendDraft(staffId, draftId)", async () => {
      gmail.api.createDraft.mockResolvedValue({ id: "d1" });
      gmail.sendDraft.mockResolvedValue({ messageId: "msg-1" });
      const { draftId, confirmToken } = await actions.createGmailDraftAction(draft);
      await expect(actions.sendGmailDraftAction(draftId, confirmToken)).resolves.toEqual({ messageId: "msg-1" });
      expect(gmail.sendDraft).toHaveBeenCalledWith(me, "d1");
    });

    it("NOT_CONNECTED after a disconnect", async () => {
      const { confirmToken } = issueConfirmToken("gmail-test-secret", me, "d1");
      await actions.disconnectGmailAction();
      await expect(actions.sendGmailDraftAction("d1", confirmToken)).rejects.toThrow(/^NOT_CONNECTED/);
    });
  });

  describe("disconnectGmailAction", () => {
    it("deletes only the caller's cache, sets disconnected_at and keeps the Google token", async () => {
      await cacheThread(me, "t1");
      await cacheThread(me, "t2");
      await cacheThread(other, "t1");
      const [tokenBefore] = await db
        .select()
        .from(schema.googleOauthAccounts)
        .where(eq(schema.googleOauthAccounts.staffId, me));

      await actions.disconnectGmailAction();

      const mine = await db.select().from(schema.gmailThreads).where(eq(schema.gmailThreads.staffId, me));
      const theirs = await db.select().from(schema.gmailThreads).where(eq(schema.gmailThreads.staffId, other));
      expect(mine).toHaveLength(0);
      expect(theirs).toHaveLength(1);

      const [account] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, me));
      expect(account!.disconnectedAt).toBeInstanceOf(Date);
      const [otherAccount] = await db
        .select()
        .from(schema.gmailAccounts)
        .where(eq(schema.gmailAccounts.staffId, other));
      expect(otherAccount!.disconnectedAt).toBeNull();

      const [tokenAfter] = await db
        .select()
        .from(schema.googleOauthAccounts)
        .where(eq(schema.googleOauthAccounts.staffId, me));
      expect(tokenAfter!.accessToken).toBe(tokenBefore!.accessToken);
      expect(tokenAfter!.refreshToken).toBe(tokenBefore!.refreshToken);
      expect(tokenAfter!.scope).toBe(tokenBefore!.scope);
    });

    it("works for an account that never synced", async () => {
      await db.delete(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, me));
      await actions.disconnectGmailAction();
      const [account] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, me));
      expect(account!.disconnectedAt).toBeInstanceOf(Date);
    });
  });
});
