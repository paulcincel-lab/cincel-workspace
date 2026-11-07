// @vitest-environment node
/**
 * Workspace search against a real Postgres (redesign BE §7.3, §8.9): ranking,
 * capability scoping, owner-only notes and the admin-only filter. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row carries a per-run marker, which is also the query, and is deleted
 * afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().replace(/-/g, "").slice(0, 8);
const m = `qz${run}`;

describe.skipIf(!url)("searchWorkspace (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { searchWorkspace } = await import("@/lib/search/search");

  const ids = {
    staff: [] as string[],
    projects: [] as string[],
    tasks: [] as string[],
    contacts: [] as string[],
    notes: [] as string[],
    files: [] as string[],
    links: [] as string[],
  };

  let ownerId = "";
  let otherId = "";
  let inactiveId = "";
  const projectIds: Record<string, string> = {};
  let userTaskNewId = "";
  let userTaskOldId = "";
  let adminTaskId = "";
  let clientId = "";
  let providerId = "";
  let ownNoteId = "";
  let otherNoteId = "";
  let fileId = "";

  function user(id: string, access: string): AuthenticatedUser {
    return {
      member: {
        id,
        name: "Prueba",
        role: access,
        area: "",
        capacity: 0,
        availability: "",
        active: true,
        institutionalEmail: "",
        phone: "",
      },
      email: `${id}@cincel.test`,
      access: access as SystemAccessRole,
    } as AuthenticatedUser;
  }

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Dueña ${m}`, lastName: "López", role: "Colaborador" },
        { name: `Otra ${run}`, role: "Colaborador" },
        { name: `Inactiva ${m}`, role: "Colaborador", active: false },
      ])
      .returning({ id: schema.staff.id });
    ownerId = members[0]!.id;
    otherId = members[1]!.id;
    inactiveId = members[2]!.id;
    ids.staff.push(ownerId, otherId, inactiveId);

    const projectRows = await db
      .insert(schema.projects)
      .values([
        { name: m },
        { name: `Diseño ${m}` },
        { name: `${m} norte` },
        { name: `Casa ${m}` },
        { name: `Casa${m}x` },
      ])
      .returning({ id: schema.projects.id, name: schema.projects.name });
    for (const p of projectRows) {
      projectIds[p.name] = p.id;
      ids.projects.push(p.id);
    }
    const projectId = projectIds[`Casa ${m}`]!;

    const taskRows = await db
      .insert(schema.tasks)
      .values([
        {
          projectId,
          kind: "usuario",
          title: `Revisar ${m}`,
          createdById: ownerId,
          commitmentDate: "2026-11-12",
          updatedAt: new Date("2026-11-05T10:00:00Z"),
        },
        {
          projectId,
          kind: "usuario",
          title: `Revisar ${m}`,
          createdById: ownerId,
          updatedAt: new Date("2026-10-01T10:00:00Z"),
        },
        { projectId, kind: "admin", title: `Asignar cliente ${m}`, createdById: ownerId },
        { projectId, kind: "usuario", title: `Archivada ${m}`, createdById: ownerId, archived: true },
      ])
      .returning({ id: schema.tasks.id });
    userTaskNewId = taskRows[0]!.id;
    userTaskOldId = taskRows[1]!.id;
    adminTaskId = taskRows[2]!.id;
    ids.tasks.push(...taskRows.map((t) => t.id));

    const contactRows = await db
      .insert(schema.contacts)
      .values([
        { type: "cliente", name: `Cliente ${m}` },
        { type: "proveedor", name: `Proveedor ${m}` },
      ])
      .returning({ id: schema.contacts.id });
    clientId = contactRows[0]!.id;
    providerId = contactRows[1]!.id;
    ids.contacts.push(clientId, providerId);

    const noteRows = await db
      .insert(schema.notes)
      .values([
        { staffId: ownerId, title: "", body: `Ideas ${m}\nmás texto` },
        { staffId: otherId, title: `Ajena ${m}` },
      ])
      .returning({ id: schema.notes.id });
    ownNoteId = noteRows[0]!.id;
    otherNoteId = noteRows[1]!.id;
    ids.notes.push(ownNoteId, otherNoteId);

    const [file] = await db
      .insert(schema.driveFiles)
      .values({
        googleFileId: `g-${run}`,
        fileName: `Plano ${m}.pdf`,
        webViewLink: `https://drive.google.com/file/d/g-${run}/view`,
      })
      .returning({ id: schema.driveFiles.id });
    fileId = file!.id;
    ids.files.push(fileId);
    const [link] = await db
      .insert(schema.projectLinks)
      .values({ projectId, kind: "interno", title: "Plano", url: `https://drive.google.com/file/d/g-${run}`, driveFileId: fileId })
      .returning({ id: schema.projectLinks.id });
    ids.links.push(link!.id);
  });

  afterAll(async () => {
    if (ids.links.length) await db.delete(schema.projectLinks).where(inArray(schema.projectLinks.id, ids.links));
    if (ids.files.length) await db.delete(schema.driveFiles).where(inArray(schema.driveFiles.id, ids.files));
    if (ids.notes.length) await db.delete(schema.notes).where(inArray(schema.notes.id, ids.notes));
    if (ids.tasks.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids.tasks));
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("returns all five types with their url patterns", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: m, limit: 50 });
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get(projectIds[`Casa ${m}`]!)).toMatchObject({
      type: "proyecto",
      url: `/proyectos/${projectIds[`Casa ${m}`]}`,
      subtitle: "Sin tramo · Activo",
    });
    expect(byId.get(userTaskNewId)).toMatchObject({
      type: "tarea",
      url: `/tareas/${userTaskNewId}`,
      subtitle: `Casa ${m} · 12 nov 2026`,
    });
    expect(byId.get(ownerId)).toMatchObject({
      type: "persona",
      title: `Dueña ${m} López`,
      url: `/personas/equipo/${ownerId}`,
    });
    expect(byId.get(providerId)).toMatchObject({
      type: "persona",
      subtitle: "Proveedor",
      url: `/personas/clientes?contacto=${providerId}`,
    });
    expect(byId.get(clientId)).toMatchObject({ type: "persona", subtitle: "Cliente" });
    expect(byId.get(fileId)).toMatchObject({
      type: "archivo",
      title: `Plano ${m}.pdf`,
      subtitle: `Casa ${m}`,
      url: `https://drive.google.com/file/d/g-${run}/view`,
    });
    expect(byId.get(ownNoteId)).toMatchObject({
      type: "nota",
      title: `Ideas ${m}`,
      url: `/mi-espacio/notas/${ownNoteId}`,
    });
    expect(results.some((r) => (r.type as string) === "accion")).toBe(false);
  });

  it("ranks exact > prefix > word-start > contains, case and accent insensitive", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: m, types: ["proyecto"] });
    const order = results.map((r) => r.title);
    expect(order).toHaveLength(5);
    expect(order[0]).toBe(m);
    expect(order[1]).toBe(`${m} norte`);
    expect(order.indexOf(`${m} norte`)).toBeLessThan(order.indexOf(`Casa ${m}`));
    expect(order.indexOf(`Casa ${m}`)).toBeLessThan(order.indexOf(`Casa${m}x`));
    expect(order.indexOf(`Diseño ${m}`)).toBeLessThan(order.indexOf(`Casa${m}x`));

    const exact = await searchWorkspace(user(ownerId, "Administrador"), { query: `DISENO ${m}`, types: ["proyecto"] });
    expect(exact[0]?.title).toBe(`Diseño ${m}`);
  });

  it("breaks score ties by recency", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: `revisar ${m}`, types: ["tarea"] });
    const order = results.map((r) => r.id);
    expect(order.indexOf(userTaskNewId)).toBeLessThan(order.indexOf(userTaskOldId));
  });

  it("respects the limit and keeps every type with results", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: m, limit: 5 });
    expect(results).toHaveLength(5);
    expect(new Set(results.map((r) => r.type))).toEqual(new Set(["proyecto", "tarea", "persona", "archivo", "nota"]));
  });

  it("filters by type", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: m, types: ["nota", "archivo"] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.type === "nota" || r.type === "archivo")).toBe(true);
  });

  it("never returns admin tasks or client contacts to a non-admin", async () => {
    for (const access of ["Colaborador", "Dirección"]) {
      const results = await searchWorkspace(user(ownerId, access), { query: m, limit: 50 });
      const found = results.map((r) => r.id);
      expect(found).not.toContain(adminTaskId);
      expect(found).not.toContain(clientId);
      expect(results.some((r) => r.subtitle === "Cliente")).toBe(false);
      expect(found).toContain(userTaskNewId);
    }
    const admin = await searchWorkspace(user(ownerId, "Administrador"), { query: m, limit: 50 });
    expect(admin.map((r) => r.id)).toEqual(expect.arrayContaining([adminTaskId, clientId]));
  });

  it("shows contacts only with clients.canViewClients", async () => {
    const direccion = await searchWorkspace(user(ownerId, "Dirección"), { query: m, limit: 50 });
    expect(direccion.map((r) => r.id)).toContain(providerId);
    const colaborador = await searchWorkspace(user(ownerId, "Colaborador"), { query: m, limit: 50 });
    expect(colaborador.map((r) => r.id)).not.toContain(providerId);
    // Staff stay visible.
    expect(colaborador.map((r) => r.id)).toContain(ownerId);
  });

  it("returns only the caller's own notes", async () => {
    const owner = await searchWorkspace(user(ownerId, "Administrador"), { query: m, types: ["nota"] });
    expect(owner.map((r) => r.id)).toEqual([ownNoteId]);
    const other = await searchWorkspace(user(otherId, "Colaborador"), { query: m, types: ["nota"] });
    expect(other.map((r) => r.id)).toEqual([otherNoteId]);
  });

  it("leaves out inactive staff and archived tasks", async () => {
    const results = await searchWorkspace(user(ownerId, "Administrador"), { query: m, limit: 50 });
    const titles = results.map((r) => r.title);
    expect(results.map((r) => r.id)).not.toContain(inactiveId);
    expect(titles).not.toContain(`Archivada ${m}`);
  });
});
