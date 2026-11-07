import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResourceLink } from "@/lib/types/resource";

const mocks = vi.hoisted(() => ({
  fetchMyVacationsAction: vi.fn(),
  fetchTeamAbsencesAction: vi.fn(),
  fetchResourceLinksAction: vi.fn(),
  requireCapabilityUser: vi.fn(),
  IMPLEMENTED: { fetchMyVacationsAction: true, fetchTeamAbsencesAction: true } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/vacations-actions", () => ({
  fetchMyVacationsAction: mocks.fetchMyVacationsAction,
  fetchTeamAbsencesAction: mocks.fetchTeamAbsencesAction,
}));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({ IMPLEMENTED: mocks.IMPLEMENTED }));
vi.mock("@/lib/actions/resources-actions", () => ({ fetchResourceLinksAction: mocks.fetchResourceLinksAction }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: mocks.requireCapabilityUser }));

import { loadMisVacaciones, vacationDocuments } from "./load-mis-vacaciones";

function link(id: string, personalFor: ResourceLink["personalFor"], section: ResourceLink["section"] = "mis-vacaciones"): ResourceLink {
  return {
    id,
    templateKey: null,
    title: `Documento ${id}`,
    section,
    subsection: null,
    linkType: "drive_file",
    appliesTo: "general",
    url: `https://drive.google.com/file/d/${id}/view`,
    status: "vigente",
    owner: null,
    personalFor,
    sortOrder: 0,
    drive: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

const LINKS = [
  link("shared", null),
  link("mine", { id: "me", name: "Ana" }),
  link("other", { id: "s2", name: "Juan" }),
  link("wrong-section", null, "formacion"),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.IMPLEMENTED.fetchMyVacationsAction = true;
  mocks.IMPLEMENTED.fetchTeamAbsencesAction = true;
  mocks.requireCapabilityUser.mockResolvedValue({ member: { id: "me" }, email: "", access: "Colaborador" });
  mocks.fetchResourceLinksAction.mockResolvedValue(LINKS);
  mocks.fetchMyVacationsAction.mockResolvedValue({ balance: { entitled: 12, taken: 0, pending: 0, available: 12 }, requests: [] });
  mocks.fetchTeamAbsencesAction.mockResolvedValue([]);
});

describe("vacationDocuments", () => {
  it("keeps shared rows and the viewer's own personal rows of mis-vacaciones only", () => {
    expect(vacationDocuments(LINKS, "me").map((d) => d.id)).toEqual(["shared", "mine"]);
  });
});

describe("loadMisVacaciones", () => {
  it("loads the balance, the month's absences and the section documents", async () => {
    const data = await loadMisVacaciones(new Date("2026-11-07T18:00:00.000Z"));

    expect(data.month).toBe("2026-11");
    expect(data.year).toBe(2026);
    expect(data.mine?.balance.available).toBe(12);
    expect(data.absences).toEqual([]);
    expect(mocks.fetchTeamAbsencesAction).toHaveBeenCalledWith({ month: "2026-11" });
    expect(mocks.fetchResourceLinksAction).toHaveBeenCalledWith({ section: "mis-vacaciones" });
    expect(data.documents.map((d) => d.id)).toEqual(["shared", "mine"]);
  });

  it("uses the Mexico City day for the month", async () => {
    const data = await loadMisVacaciones(new Date("2026-12-01T03:00:00.000Z"));
    expect(data.month).toBe("2026-11");
  });

  it("returns null sections while the reads are not implemented", async () => {
    mocks.IMPLEMENTED.fetchMyVacationsAction = false;
    mocks.IMPLEMENTED.fetchTeamAbsencesAction = false;

    const data = await loadMisVacaciones(new Date("2026-11-07T18:00:00.000Z"));

    expect(data.mine).toBeNull();
    expect(data.absences).toBeNull();
    expect(mocks.fetchMyVacationsAction).not.toHaveBeenCalled();
    expect(mocks.fetchTeamAbsencesAction).not.toHaveBeenCalled();
    expect(data.documents).toHaveLength(2);
  });
});
