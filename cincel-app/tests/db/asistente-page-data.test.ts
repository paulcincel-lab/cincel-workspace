// @vitest-environment node
/**
 * Asistente page data (Query Migration Phase 10, #944) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every staff row it creates is deleted afterwards
 * (threads and messages cascade).
 *
 * - Another user's thread id → `fetchAssistantThreadAction` null and
 *   `getAsistentePageData` `missingThread: true`, never the messages.
 * - The page data lists only the caller's threads (the dehydrated state is
 *   public HTML).
 * - `listAssistantThreadMessages` returns the last N displayable messages,
 *   oldest first.
 * - `lookupAssistantContextAction` returns exactly `{ id, label }`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("asistente page data (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const repo = await import("@/lib/repositories/assistant-repository");
  const { fetchAssistantThreadAction, getAsistentePageData, lookupAssistantContextAction } = await import(
    "@/lib/actions/page-data/asistente-actions"
  );

  const staffIds: string[] = [];
  let ownerId = "";
  let otherId = "";
  let ownThread = "";
  let foreignThread = "";

  const owner = () => ({ id: ownerId, access: "Administrador" as const });

  async function makeStaff(label: string, lastName: string | null = null): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Asistente ${run} ${label}`, lastName, email: `asistente-${run}-${label}@cincel.example` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function makeThread(staffId: string, title: string): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.assistantThreads).values({ id, staffId, title, context: { route: "/inicio" } });
    return id;
  }

  beforeAll(async () => {
    ownerId = await makeStaff("dueno");
    otherId = await makeStaff("otro", "Pérez");
    ownThread = await makeThread(ownerId, "Propio");
    foreignThread = await makeThread(otherId, "Ajeno");
    const base = Date.now();
    await db.insert(schema.assistantMessages).values([
      { id: "f1", threadId: foreignThread, role: "user", parts: [{ type: "text", text: "Secreto" }], createdAt: new Date(base) },
      { id: "o1", threadId: ownThread, role: "user", parts: [{ type: "text", text: "Hola" }], createdAt: new Date(base) },
      { id: "o2", threadId: ownThread, role: "tool", parts: [], createdAt: new Date(base + 1) },
      { id: "o3", threadId: ownThread, role: "assistant", parts: [{ type: "text", text: "¿Qué necesitas?" }], createdAt: new Date(base + 2) },
      { id: "o4", threadId: ownThread, role: "user", parts: [{ type: "text", text: "Un resumen" }], createdAt: new Date(base + 3) },
    ]);
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("fetchAssistantThreadAction: another user's thread is null, never its messages", async () => {
    expect(await asViewer(owner(), () => fetchAssistantThreadAction(foreignThread))).toBeNull();
    expect(await asViewer(owner(), () => fetchAssistantThreadAction(randomUUID()))).toBeNull();
    expect(await asViewer(owner(), () => fetchAssistantThreadAction("no-es-uuid"))).toBeNull();
    // Still readable by its owner.
    const own = await asViewer({ id: otherId, access: "Colaborador" }, () => fetchAssistantThreadAction(foreignThread));
    expect(own?.messages.map((m) => m.id)).toEqual(["f1"]);
  });

  it("getAsistentePageData: another user's ?thread= is missing; only the caller's threads are listed", async () => {
    const data = await asViewer(owner(), () => getAsistentePageData({ threadId: foreignThread }));
    expect(data.initialThread).toBeNull();
    expect(data.missingThread).toBe(true);
    const ids = data.threads.map((t) => t.id);
    expect(ids).toContain(ownThread);
    expect(ids).not.toContain(foreignThread);
    expect(JSON.stringify(data)).not.toContain("Secreto");
  });

  it("getAsistentePageData: the caller's ?thread= with its messages, tool rows left out", async () => {
    const data = await asViewer(owner(), () => getAsistentePageData({ threadId: ownThread }));
    expect(data.missingThread).toBe(false);
    expect(data.initialThread).toMatchObject({ id: ownThread, title: "Propio" });
    expect(data.initialThread?.messages.map((m) => m.id)).toEqual(["o1", "o3", "o4"]);
  });

  it("getAsistentePageData: no ?thread= is not missing", async () => {
    const data = await asViewer(owner(), () => getAsistentePageData({ threadId: null }));
    expect(data).toMatchObject({ initialThread: null, missingThread: false });
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getAsistentePageData({ threadId: null }))).rejects.toThrow("FORBIDDEN");
    await expect(asViewer(null, () => fetchAssistantThreadAction(ownThread))).rejects.toThrow("FORBIDDEN");
  });

  it("listAssistantThreadMessages pages the last N displayable messages, oldest first", async () => {
    const rows = await repo.listAssistantThreadMessages(db, ownThread, { limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(["o3", "o4"]);
    const all = await repo.listAssistantThreadMessages(db, ownThread);
    expect(all.map((r) => r.id)).toEqual(["o1", "o3", "o4"]);
    expect(repo.ASSISTANT_THREAD_MESSAGES_PAGE).toBeGreaterThan(0);
  });

  it("lookupAssistantContextAction returns only { id, label }", async () => {
    const person = await asViewer(owner(), () => lookupAssistantContextAction({ personId: otherId }));
    expect(person).toEqual({ id: otherId, label: `Asistente ${run} otro Pérez` });
    expect(Object.keys(person ?? {}).sort()).toEqual(["id", "label"]);
    expect(await asViewer(owner(), () => lookupAssistantContextAction({ personId: randomUUID() }))).toBeNull();
    expect(await asViewer(owner(), () => lookupAssistantContextAction({}))).toBeNull();
  });
});
