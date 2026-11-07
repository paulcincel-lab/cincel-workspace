// @vitest-environment node
/**
 * Correo / Gmail assistant tools against a real Postgres (redesign BE §9.9):
 * `link_email_to_project` writes the project history comment
 * "<summary> (vía asistente)" with the caller as actor; `draft_email` and
 * `send_email` (owner-only Gmail data) write nothing to `history_events`.
 * Gmail itself is replaced by spies (the Gmail API is never called). Runs only
 * when TEST_DATABASE_URL points at a migrated database; every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
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

const gmail = vi.hoisted(() => ({
  fetchGmailStatusAction: vi.fn(),
  fetchGmailThreadsAction: vi.fn(),
  fetchGmailThreadAction: vi.fn(),
  linkGmailThreadToProjectAction: vi.fn(async () => undefined),
  createGmailDraftAction: vi.fn(async () => ({ draftId: "d-1", confirmToken: "t", expiresAt: "x" })),
}));
vi.mock("@/lib/actions/gmail-actions", () => gmail);

const sendDraft = vi.hoisted(() => vi.fn(async () => ({ messageId: "m-1" })));
vi.mock("@/lib/gmail/client", () => ({ sendDraft }));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Correo / Gmail assistant tools (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const correo = await import("./correo");

  let staffId = "";
  let projectId = "";
  const projectName = `Casa Correo ${run}`;

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Admin correo ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    staffId = member!.id;
    session.memberId = staffId;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: projectName })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
  });

  afterAll(async () => {
    if (projectId) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    }
    if (staffId) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.actorId, staffId));
      await db.delete(schema.staff).where(inArray(schema.staff.id, [staffId]));
    }
  });

  function ctx() {
    return {
      user: {
        member: { id: staffId, name: "Admin", role: "Administrador", active: true },
        email: "admin@cincel.example",
        access: "Administrador",
      } as never,
      context: { route: "/inicio" },
      threadId: randomUUID(),
    };
  }

  async function historyOfActor() {
    return db
      .select({
        entity: schema.historyEvents.entity,
        entityId: schema.historyEvents.entityId,
        kind: schema.historyEvents.kind,
        comment: schema.historyEvents.comment,
        actorId: schema.historyEvents.actorId,
      })
      .from(schema.historyEvents)
      .where(eq(schema.historyEvents.actorId, staffId));
  }

  it("draft_email and send_email write nothing to history_events", async () => {
    const draft = await correo.runDraftEmail(ctx(), { to: ["luis@cliente.example"], subject: "Hola", body: "Texto" });
    expect(draft).toMatchObject({ ok: true, draftId: "d-1" });
    const sent = await correo.runSendEmail(ctx(), { draftId: "d-1" });
    expect(sent).toMatchObject({ ok: true, messageId: "m-1" });
    expect(sendDraft).toHaveBeenCalledWith(staffId, "d-1");
    expect(await historyOfActor()).toEqual([]);
  });

  it("link_email_to_project writes the project comment “(vía asistente)” as the caller", async () => {
    const result = await correo.runLinkEmailToProject(ctx(), { threadId: `thread-${run}`, project: projectName });
    expect(result).toMatchObject({ ok: true, project: projectName });
    expect(gmail.linkGmailThreadToProjectAction).toHaveBeenCalledWith(`thread-${run}`, projectId);

    const rows = await db
      .select({
        kind: schema.historyEvents.kind,
        comment: schema.historyEvents.comment,
        actorId: schema.historyEvents.actorId,
      })
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entity, "project"), eq(schema.historyEvents.entityId, projectId)));
    expect(rows).toEqual([
      {
        kind: "comentario",
        comment: `Vincular un correo al proyecto ${projectName} (vía asistente)`,
        actorId: staffId,
      },
    ]);
  });
});
