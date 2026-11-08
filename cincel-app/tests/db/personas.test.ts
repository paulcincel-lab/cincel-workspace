// @vitest-environment node
/**
 * Personas (Query Migration 6, #940) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 *
 * - `/personas` (Equipo page data + counts, as the page prefetches them)
 *   runs ≤ 10 statements (`countQueries`).
 * - `contactsRepository.countByType()` and the `listContacts` type filter:
 *   each contacts tab ships only its own types.
 * - The counts equal today's `loadPersonasTabCounts` lengths
 *   (`countPersonasTabs` over the full staff and contact lists).
 * - `saveMemberAction` saves in one transaction: a failing step saves nothing.
 * - Viewers without the Personas capability get FORBIDDEN (or null), and a
 *   viewer without `canSeeAdminData` / `canViewTeamHours` gets another
 *   person's detail without hours or admin tasks.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns the Personas capabilities off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noTeam: false, noClients: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveTeamCapabilities: (user: Parameters<typeof actual.resolveTeamCapabilities>[0]) => {
      const caps = actual.resolveTeamCapabilities(user);
      return perms.noTeam ? { ...caps, canViewTeam: false } : caps;
    },
    resolveClientsCapabilities: (user: Parameters<typeof actual.resolveClientsCapabilities>[0]) => {
      const caps = actual.resolveClientsCapabilities(user);
      return perms.noClients ? { ...caps, canViewClients: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Personas (test DB)", async () => {
  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const contactsRepository = await import("@/lib/repositories/contacts-repository");
  const { listStaff } = await import("@/lib/repositories/staff-repository");
  const { countPersonasTabs } = await import("@/lib/personas/team");
  const { loadPersonasCounts, loadPersonasEquipo } = await import("@/lib/loaders/personas");
  const pageData = await import("@/lib/actions/page-data/personas-actions");
  const { fetchPersonaDetailAction } = await import("@/lib/actions/people-actions");
  const { saveMemberAction } = await import("@/lib/actions/staff-actions");

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], positions: [] as string[] };
  let adminId = "";
  let colaboradorId = "";
  let workerId = "";
  let positionId = "";

  const admin = () => ({ id: adminId, access: "Administrador" as const });
  const colaborador = () => ({ id: colaboradorId, access: "Colaborador" as const });

  const emptyProfile = {
    birthDate: null,
    nationality: null,
    address: null,
    maritalStatus: null,
    homePhone: null,
    personalEmail: null,
    curp: null,
    rfc: null,
    emergencyContactName: null,
    emergencyContactRelation: null,
    emergencyContactPhone: null,
    emergencyContactAddress: null,
  };

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin personas ${run}`, email: `admin-personas-${run}@cincel.example`, role: "Administrador", capacity: 10 },
        { name: `Colab personas ${run}`, email: `colab-personas-${run}@cincel.example`, role: "Colaborador", capacity: 10 },
        { name: `Worker personas ${run}`, email: `worker-personas-${run}@cincel.example`, role: "Colaborador", capacity: 10 },
      ])
      .returning({ id: schema.staff.id });
    [adminId, colaboradorId, workerId] = members.map((m) => m.id);
    ids.staff.push(...members.map((m) => m.id));

    const contacts = await db
      .insert(schema.contacts)
      .values([
        { type: "cliente" as const, name: `Cliente personas ${run}` },
        { type: "socio" as const, name: `Socio personas ${run}` },
        { type: "proveedor" as const, name: `Contratista personas ${run}` },
        { type: "proveedor" as const, name: `Tienda personas ${run}` },
        { type: "cliente" as const, name: `Cliente borrado ${run}`, deletedAt: new Date() },
      ])
      .returning({ id: schema.contacts.id });
    ids.contacts.push(...contacts.map((c) => c.id));
    await db.insert(schema.providerProfiles).values([
      { contactId: contacts[2]!.id, subtype: "contratista" as const },
      { contactId: contacts[3]!.id, subtype: "tienda" as const },
    ]);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Personas ${run}`, status: "activo", managerId: workerId })
      .returning({ id: schema.projects.id });
    ids.projects.push(project.id);
    await db.insert(schema.tasks).values([
      { projectId: project.id, kind: "usuario" as const, title: `Abierta ${run}`, createdById: adminId, managerId: workerId },
      { projectId: project.id, kind: "admin" as const, title: `Admin ${run}`, createdById: adminId, managerId: workerId },
    ]);

    const [position] = await db
      .insert(schema.positions)
      .values({ name: `Puesto personas ${run}` })
      .returning({ id: schema.positions.id });
    positionId = position.id;
    ids.positions.push(position.id);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    const created = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(inArray(schema.staff.email, [`nuevo-${run}@cincel.example`, `falla-${run}@cincel.example`]));
    ids.staff.push(...created.map((s) => s.id));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    if (ids.positions.length) await db.delete(schema.positions).where(inArray(schema.positions.id, ids.positions));
  });

  beforeEach(() => {
    perms.noTeam = false;
    perms.noClients = false;
  });

  it("/personas: Equipo page data + counts run ≤ 10 statements", async () => {
    const user = await asViewer(admin(), () => requireCapabilityUser());
    const { result, count } = await countQueries(async () => {
      const equipo = await loadPersonasEquipo(user);
      const counts = await loadPersonasCounts(user, { activeStaff: equipo.people.length });
      return { equipo, counts };
    });
    expect(count).toBeLessThanOrEqual(10);
    expect(result.equipo.people.map((p) => p.id)).toEqual(expect.arrayContaining([adminId, colaboradorId, workerId]));
    expect(result.counts.equipo).toBe(result.equipo.people.length);
  });

  it("countByType groups the live contacts, contratistas by subtype", async () => {
    const counts = await contactsRepository.countByType();
    const live = await db
      .select({ type: schema.contacts.type })
      .from(schema.contacts)
      .where(isNull(schema.contacts.deletedAt));
    expect(counts.cliente).toBe(live.filter((c) => c.type === "cliente").length);
    expect(counts.socio).toBe(live.filter((c) => c.type === "socio").length);
    expect(counts.proveedor).toBe(live.filter((c) => c.type === "proveedor").length);
    const contratistas = await db
      .select({ id: schema.providerProfiles.contactId })
      .from(schema.providerProfiles)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.providerProfiles.contactId))
      .where(and(isNull(schema.contacts.deletedAt), eq(schema.providerProfiles.subtype, "contratista")));
    expect(counts.contratista).toBe(contratistas.length);
  });

  it.each([
    ["clientes", ["cliente"]],
    ["contratistas", ["proveedor"]],
    ["proveedores", ["proveedor"]],
  ] as const)("the %s tab ships only its own contact types", async (tab, types) => {
    const data = await asViewer(admin(), () => pageData.getPersonasContactsPageData({ tab }));
    expect(data.contacts.length).toBeGreaterThan(0);
    expect(new Set(data.contacts.map((c) => c.type))).toEqual(new Set(types));
    if (tab === "contratistas") expect(data.contacts.every((c) => c.provider?.subtype === "contratista")).toBe(true);
    const names = data.contacts.map((c) => c.name);
    expect(names).not.toContain(`Cliente borrado ${run}`);
    expect(names).not.toContain(`Socio personas ${run}`);
  });

  it("counts equal today's loadPersonasTabCounts lengths", async () => {
    const counts = await asViewer(admin(), () => pageData.getPersonasCountsAction({}));
    const today = countPersonasTabs(await listStaff(), await contactsRepository.listContacts());
    expect(counts).toEqual(today);
  });

  it("saveMemberAction creates the person, profile, puestos and access in one save", async () => {
    const result = await asViewer(admin(), () =>
      saveMemberAction({
        staffId: null,
        staff: {
          name: `Nuevo ${run}`,
          lastName: "Pérez",
          role: "Colaborador",
          email: `nuevo-${run}@cincel.example`,
          phone: null,
          capacity: 8,
          availability: "Disponible",
        },
        profile: { ...emptyProfile, nationality: "Mexicana" },
        positionIds: [positionId],
        credential: { enableAccess: true, temporaryPassword: `Temporal-${run}` },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ name: `Nuevo ${run}`, profile: { nationality: "Mexicana" } });
    expect(result.data.positions?.map((p) => p.id)).toEqual([positionId]);
    expect(result.data.access).toMatchObject({ enabled: true, mustChangePassword: true });
  });

  it("saveMemberAction rolls the whole save back when a step fails", async () => {
    const result = await asViewer(admin(), () =>
      saveMemberAction({
        staffId: null,
        staff: {
          name: `Falla ${run}`,
          lastName: "López",
          role: "Colaborador",
          email: `falla-${run}@cincel.example`,
          phone: null,
          capacity: 8,
          availability: "Disponible",
        },
        profile: emptyProfile,
        // An unknown puesto fails the puestos step after the person and profile were written.
        positionIds: [randomUUID()],
      }),
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^NOT_FOUND/) });
    const rows = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(eq(schema.staff.email, `falla-${run}@cincel.example`));
    expect(rows).toEqual([]);
  });

  it("saveMemberAction refuses a viewer without team.canCreateCollaborator", async () => {
    const result = await asViewer(colaborador(), () =>
      saveMemberAction({
        staffId: null,
        staff: { name: `Nadie ${run}`, lastName: "X", email: `nadie-${run}@cincel.example`, phone: null, capacity: 8, availability: null },
        profile: emptyProfile,
      }),
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });
  });

  describe("viewers without the Personas capability", () => {
    it("get FORBIDDEN from the Equipo page data and the persona detail", async () => {
      perms.noTeam = true;
      await expect(asViewer(colaborador(), () => pageData.getPersonasEquipoPageData({}))).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(colaborador(), () => fetchPersonaDetailAction({ staffId: workerId }))).rejects.toThrow(
        "FORBIDDEN",
      );
    });

    it("get FORBIDDEN from the contacts page data", async () => {
      perms.noClients = true;
      await expect(asViewer(colaborador(), () => pageData.getPersonasContactsPageData({ tab: "clientes" }))).rejects.toThrow(
        "FORBIDDEN",
      );
    });

    it("get FORBIDDEN from the counts with neither capability, 0 for the closed tabs otherwise", async () => {
      perms.noClients = true;
      const counts = await asViewer(colaborador(), () => pageData.getPersonasCountsAction({}));
      expect(counts).toMatchObject({ clientes: 0, contratistas: 0, proveedores: 0 });
      perms.noTeam = true;
      await expect(asViewer(colaborador(), () => pageData.getPersonasCountsAction({}))).rejects.toThrow("FORBIDDEN");
    });

    it("a guest gets FORBIDDEN", async () => {
      await expect(asViewer(null, () => pageData.getPersonasEquipoPageData({}))).rejects.toThrow("FORBIDDEN");
      await expect(asViewer(null, () => pageData.getPersonasCountsAction({}))).rejects.toThrow("FORBIDDEN");
    });
  });

  it("another person's detail carries only what canSeeAdminData and canViewTeamHours allow", async () => {
    const asAdmin = await asViewer(admin(), () => fetchPersonaDetailAction({ staffId: workerId }));
    expect(asAdmin?.tasks.map((t) => t.title)).toContain(`Admin ${run}`);

    const asColaborador = await asViewer(colaborador(), () => fetchPersonaDetailAction({ staffId: workerId }));
    expect(asColaborador).not.toBeNull();
    expect(asColaborador!.tasks.map((t) => t.title)).not.toContain(`Admin ${run}`);
    expect(asColaborador!.weekHours).toBeNull();
    expect(asColaborador!.person.weekHours).toBeNull();
  });

  it("the persona detail is null for an unknown person", async () => {
    await expect(asViewer(admin(), () => fetchPersonaDetailAction({ staffId: randomUUID() }))).resolves.toBeNull();
  });
});
