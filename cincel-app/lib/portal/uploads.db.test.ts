// @vitest-environment node
/**
 * Mis envíos query against a real Postgres (BE §B.4.7). Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("listOwnPortalUploads (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { listOwnPortalUploads } = await import("@/lib/portal/uploads");

  const ids = { staff: "", contacts: [] as string[], projects: [] as string[], users: [] as string[] };
  let me = "";
  let other = "";
  let projectA = "";
  let projectB = "";

  async function event(values: {
    portalUserId: string;
    projectId: string;
    fileName: string;
    action: "upload" | "download" | "preview";
    at: Date;
    sizeBytes?: number | null;
  }) {
    await db.insert(schema.portalFileEvents).values({ driveFileId: `drive-${randomUUID()}`, ...values });
  }

  beforeAll(async () => {
    const [staffRow] = await db
      .insert(schema.staff)
      .values({ name: `Uploads ${run}`, email: `uploads-${run}@staff.example`, role: "Colaborador" })
      .returning({ id: schema.staff.id });
    ids.staff = staffRow.id;

    const [clientA, clientB] = await db
      .insert(schema.contacts)
      .values([
        { type: "cliente", name: `Cliente A ${run}` },
        { type: "cliente", name: `Cliente B ${run}` },
      ])
      .returning({ id: schema.contacts.id });
    ids.contacts.push(clientA.id, clientB.id);

    const [pa, pb] = await db
      .insert(schema.projects)
      .values([
        { name: `Casa A ${run}`, clientId: clientA.id },
        { name: `Casa B ${run}`, clientId: clientA.id },
      ])
      .returning({ id: schema.projects.id });
    projectA = pa.id;
    projectB = pb.id;
    ids.projects.push(pa.id, pb.id);

    const [u1, u2] = await db
      .insert(schema.portalUsers)
      .values([
        { email: `yo-${run}@cliente.example`, name: "Yo", contactId: clientA.id, invitedByStaffId: ids.staff, status: "active" },
        { email: `otro-${run}@cliente.example`, name: "Otro", contactId: clientB.id, invitedByStaffId: ids.staff,
          status: "active" },
      ])
      .returning({ id: schema.portalUsers.id });
    me = u1.id;
    other = u2.id;
    ids.users.push(u1.id, u2.id);

    await event({ portalUserId: me, projectId: projectA, fileName: "planos.pdf", action: "upload", sizeBytes: 1200,
      at: new Date("2026-10-01T10:00:00Z") });
    await event({ portalUserId: me, projectId: projectA, fileName: "fotos.zip", action: "upload", sizeBytes: null,
      at: new Date("2026-10-02T10:00:00Z") });
    // Not mine: another client on the same project.
    await event({ portalUserId: other, projectId: projectA, fileName: "ajeno.pdf", action: "upload",
      at: new Date("2026-10-03T10:00:00Z") });
    // Mine, but another project.
    await event({ portalUserId: me, projectId: projectB, fileName: "otro-proyecto.pdf", action: "upload",
      at: new Date("2026-10-04T10:00:00Z") });
    // Mine, but a staff file I downloaded or previewed.
    await event({ portalUserId: me, projectId: projectA, fileName: "contrato.pdf", action: "download",
      at: new Date("2026-10-05T10:00:00Z") });
    await event({ portalUserId: me, projectId: projectA, fileName: "render.png", action: "preview",
      at: new Date("2026-10-06T10:00:00Z") });
  });

  afterAll(async () => {
    if (ids.users.length) {
      await db.delete(schema.portalFileEvents).where(inArray(schema.portalFileEvents.portalUserId, ids.users));
      await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, ids.users));
    }
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff) await db.delete(schema.staff).where(eq(schema.staff.id, ids.staff));
  });

  it("returns only the caller's own uploads for that project, newest first", async () => {
    const uploads = await listOwnPortalUploads(me, projectA);
    expect(uploads.map((u) => u.fileName)).toEqual(["fotos.zip", "planos.pdf"]);
    expect(uploads[1]).toMatchObject({ sizeBytes: 1200, at: "2026-10-01T10:00:00.000Z" });
    expect(uploads[0].sizeBytes).toBeNull();
  });

  it("never returns other clients' uploads or the files the caller downloaded or previewed", async () => {
    const names = (await listOwnPortalUploads(me, projectA)).map((u) => u.fileName);
    expect(names).not.toContain("ajeno.pdf");
    expect(names).not.toContain("contrato.pdf");
    expect(names).not.toContain("render.png");
    expect(names).not.toContain("otro-proyecto.pdf");
  });

  it("scopes the other client to their own uploads", async () => {
    expect((await listOwnPortalUploads(other, projectA)).map((u) => u.fileName)).toEqual(["ajeno.pdf"]);
    expect(await listOwnPortalUploads(other, projectB)).toEqual([]);
  });

  it("exposes no Drive file id", async () => {
    const [upload] = await listOwnPortalUploads(me, projectB);
    expect(Object.keys(upload).sort()).toEqual(["at", "fileName", "id", "sizeBytes"]);
  });
});
