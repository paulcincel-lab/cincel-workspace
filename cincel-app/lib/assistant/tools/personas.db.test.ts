// @vitest-environment node
/**
 * Personas, clientes y proveedores assistant tools against a real Postgres
 * (redesign BE §9.9): `invite_client_to_portal` and `request_quotes` write
 * the contact history comment "<summary> (vía asistente)" with the caller as
 * actor, and a supplier whose mail failed gets nothing. Mail is replaced by a
 * spy (nothing is sent) and Gmail is reported as not connected, so the SMTP
 * fallback runs. Runs only when TEST_DATABASE_URL points at a migrated
 * database; every row a test creates carries a per-run marker and is deleted
 * afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const mail = vi.hoisted(() => ({
  sendMail: vi.fn(async (_message: { to: string | string[] }) => ({ sent: true as boolean })),
}));
vi.mock("@/lib/email", () => mail);
vi.mock("@/lib/assistant/owner-mail", () => ({ loadOwnerMail: vi.fn(async () => false) }));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Personas, clientes y proveedores assistant tools (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { tools } = await import("./personas");

  let staffId = "";
  let projectId = "";
  const contactIds: string[] = [];
  const projectName = `Casa Personas ${run}`;
  const clientName = `Familia Personas ${run}`;
  const supplierName = `Cementos Personas ${run}`;
  const mutedSupplierName = `Aceros Personas ${run}`;

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Admin personas ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    staffId = member!.id;
    session.memberId = staffId;

    const inserted = await db
      .insert(schema.contacts)
      .values([
        { type: "cliente", name: clientName, email: `cliente-${run}@example.com` },
        { type: "proveedor", name: supplierName, email: `ventas-${run}@example.com` },
        { type: "proveedor", name: mutedSupplierName, email: `compras-${run}@example.com` },
      ])
      .returning({ id: schema.contacts.id });
    contactIds.push(...inserted.map((row) => row.id));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: projectName, clientId: contactIds[0] })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
  });

  afterAll(async () => {
    if (staffId) {
      await db.delete(schema.portalAuditEvents).where(eq(schema.portalAuditEvents.staffId, staffId));
    }
    if (projectId) {
      await db.delete(schema.projectPortalAccess).where(eq(schema.projectPortalAccess.projectId, projectId));
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    }
    if (contactIds.length) {
      await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.contactId, contactIds));
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, contactIds));
      await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
    }
    if (staffId) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.actorId, staffId));
      await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
    }
  });

  beforeEach(() => {
    mail.sendMail.mockReset();
    mail.sendMail.mockResolvedValue({ sent: true });
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

  function tool(name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found.definition;
  }

  async function contactHistory(contactId: string) {
    return db
      .select({
        kind: schema.historyEvents.kind,
        comment: schema.historyEvents.comment,
        actorId: schema.historyEvents.actorId,
      })
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entity, "contact"), eq(schema.historyEvents.entityId, contactId)));
  }

  it("invite_client_to_portal grants access and writes the contact comment “(vía asistente)” as the caller", async () => {
    const result = await tool("invite_client_to_portal").run(ctx(), { client: clientName, project: projectName } as never);
    expect(result).toMatchObject({ ok: true, client: clientName, project: projectName });

    const access = await db
      .select({ id: schema.projectPortalAccess.id })
      .from(schema.projectPortalAccess)
      .where(eq(schema.projectPortalAccess.projectId, projectId));
    expect(access).toHaveLength(1);

    expect(await contactHistory(contactIds[0])).toEqual([
      {
        kind: "comentario",
        comment: `Invitar a ${clientName} al portal del proyecto ${projectName} (vía asistente)`,
        actorId: staffId,
      },
    ]);
  });

  it("request_quotes writes one comment per supplier mailed and none for a failed mail", async () => {
    mail.sendMail.mockImplementation(async (message: { to: string | string[] }) => ({
      sent: message.to !== `compras-${run}@example.com`,
    }));
    const result = (await tool("request_quotes").run(ctx(), {
      item: "Cemento gris",
      quantity: "120 bultos",
      suppliers: [supplierName, mutedSupplierName],
      deadline: "2099-01-15",
    } as never)) as { ok: boolean; requestId: string };
    expect(result.ok).toBe(true);
    expect(result.requestId).toMatch(/^COT-[A-Z0-9]{6}$/);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);

    const rows = await contactHistory(contactIds[1]);
    expect(rows).toEqual([
      {
        kind: "comentario",
        comment: `Solicitud de cotización ${result.requestId} (enviada por correo): 120 bultos de Cemento gris, fecha límite 2099-01-15 (vía asistente)`,
        actorId: staffId,
      },
    ]);
    expect(await contactHistory(contactIds[2])).toEqual([]);
  });
});
