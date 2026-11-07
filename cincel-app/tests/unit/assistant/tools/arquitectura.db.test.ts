// @vitest-environment node
/**
 * Herramientas de arquitectura against a real Postgres (redesign BE §9.9,
 * §10.3): a confirmed `site_photo_log` writes one project bitácora comment
 * "… (vía asistente)" with the caller as actor; read tools write nothing.
 * Runs only when TEST_DATABASE_URL points at a migrated database.
 *
 * The project actions run with their real repositories; only the session,
 * the capability resolvers (all granted), revalidation and Drive are mocked.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

const session = vi.hoisted(() => ({ actor: null as null | { id: string; name: string; email: string } }));

function sessionUser() {
  const actor = session.actor;
  if (!actor) throw new Error("no test actor");
  return {
    member: {
      id: actor.id,
      name: actor.name,
      role: "Jefe de Construcción",
      area: "Construcción",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: actor.email,
      phone: "",
    },
    email: actor.email,
    access: "Jefe de Construcción" as const,
  };
}

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityUser: vi.fn(async () => sessionUser()),
}));

const allGranted = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (key === "statusScope" ? "all" : key === "then" ? undefined : true),
  });
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => allGranted(),
  resolveActivitiesCapabilities: () => allGranted(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("@/lib/assistant/vision", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/vision")>()),
  driveCallerFor: vi.fn(async () => ({ ok: false, error: "NEEDS_CONSENT", message: "sin Drive" })),
}));

describe.skipIf(!url)("Herramientas de arquitectura bitácora (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { tools } = await import("@/lib/assistant/tools/arquitectura");

  const ids = { staff: [] as string[], projects: [] as string[] };
  let projectId = "";
  let projectName = "";

  function tool(name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found.definition;
  }

  async function projectHistory() {
    return db.select().from(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
  }

  beforeAll(async () => {
    const email = `arq-${run}@cincel.example`;
    const [staffRow] = await db
      .insert(schema.staff)
      .values({ name: `Arq ${run}`, email, role: "Jefe de Construcción", active: true })
      .returning({ id: schema.staff.id });
    ids.staff.push(staffRow.id);
    session.actor = { id: staffRow.id, name: `Arq ${run}`, email };

    projectName = `Obra arquitectura ${run}`;
    const [projectRow] = await db.insert(schema.projects).values({ name: projectName }).returning({ id: schema.projects.id });
    ids.projects.push(projectRow.id);
    projectId = projectRow.id;
  });

  afterAll(async () => {
    if (ids.projects.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  const ctx = () => ({
    user: sessionUser() as never,
    context: { route: `/proyectos/${projectId}`, projectId },
    threadId: randomUUID(),
  });

  it("read tools write nothing to history_events", async () => {
    const zoning = tool("zoning_check");
    const result = (await zoning.run(ctx(), zoning.schema.parse({ project: projectName }))) as { ok: boolean; complete: boolean };
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    const report = tool("progress_report");
    await report.run(ctx(), report.schema.parse({ period: "semana" }));
    expect(await projectHistory()).toHaveLength(0);
  });

  it("site_photo_log writes one project comment (vía asistente) with the caller as actor", async () => {
    const photoLog = tool("site_photo_log");
    const result = (await photoLog.run(
      ctx(),
      photoLog.schema.parse({ project: projectName, photos: ["foto-a", "https://drive.google.com/file/d/foto-b/view"], notes: "Cimbra lista" }),
    )) as { ok: boolean; logged: boolean; proposals: unknown };
    expect(result).toMatchObject({ ok: true, logged: true, proposals: null });

    const rows = await projectHistory();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.entity).toBe("project");
    expect(row.kind).toBe("comentario");
    expect(row.actorId).toBe(session.actor?.id);
    expect(row.comment).toMatch(/^Bitácora de obra: 2 fotos — Cimbra lista\./);
    expect(row.comment).toContain("https://drive.google.com/file/d/foto-b/view");
    expect(row.comment?.endsWith("(vía asistente)")).toBe(true);
  });
});
