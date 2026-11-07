import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactDetail } from "@/lib/types/core";

const CONTACT = "55555555-5555-4555-8555-555555555555";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "actor" },
    access: session.access,
  })),
}));

const canView = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveClientsCapabilities: () => ({ canViewClients: canView.value }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const repo = vi.hoisted(() => ({ getContact: vi.fn() }));
vi.mock("@/lib/repositories/contacts-repository", () => repo);

import { fetchContactAction } from "./contacts-actions";

const contact = {
  id: CONTACT,
  type: "cliente",
  name: "Familia Pérez",
  people: [],
  tags: [],
  providerProfile: null,
  stats: {
    totalProjects: 2,
    activeProjects: 1,
    firstWorkDate: "2025-03-01",
    totalContractedMxn: "1500000",
  },
  projects: [
    { id: "p1", name: "Casa Pérez", status: "activo", startDate: "2025-03-01" },
    { id: "p2", name: "Cocina Pérez", status: "completado", startDate: null },
  ],
} as unknown as ContactDetail;

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Colaborador";
  canView.value = true;
  repo.getContact.mockResolvedValue(contact);
});

describe("fetchContactAction", () => {
  it("hides the client's projects from non-administrators", async () => {
    const out = await fetchContactAction(CONTACT);
    expect(out?.projects).toEqual([]);
    expect(out?.stats).toEqual(contact.stats);
    expect(out?.name).toBe("Familia Pérez");
  });

  it("hides them from Dirección too", async () => {
    session.access = "Dirección";
    await expect(fetchContactAction(CONTACT)).resolves.toMatchObject({ projects: [] });
  });

  it("shows the projects to administrators", async () => {
    session.access = "Administrador";
    await expect(fetchContactAction(CONTACT)).resolves.toEqual(contact);
  });

  it("returns null without clients access", async () => {
    canView.value = false;
    await expect(fetchContactAction(CONTACT)).resolves.toBeNull();
    expect(repo.getContact).not.toHaveBeenCalled();
  });

  it("returns null for a missing contact", async () => {
    repo.getContact.mockResolvedValue(null);
    await expect(fetchContactAction(CONTACT)).resolves.toBeNull();
  });
});
