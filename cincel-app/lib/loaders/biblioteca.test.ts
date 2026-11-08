// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const mocks = vi.hoisted(() => ({
  readMyVacations: vi.fn(),
  readTeamAbsences: vi.fn(),
  readPendingVacationRequests: vi.fn(),
  readVacationSettings: vi.fn(),
  loadBibliotecaData: vi.fn(),
  IMPLEMENTED: {
    fetchMyVacationsAction: true,
    fetchTeamAbsencesAction: true,
    fetchPendingVacationRequestsAction: true,
    fetchVacationSettingsAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/vacations/reads", () => ({
  readMyVacations: mocks.readMyVacations,
  readTeamAbsences: mocks.readTeamAbsences,
  readPendingVacationRequests: mocks.readPendingVacationRequests,
  readVacationSettings: mocks.readVacationSettings,
}));
vi.mock("@/lib/biblioteca/load", () => ({ loadBibliotecaData: mocks.loadBibliotecaData }));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({ IMPLEMENTED: mocks.IMPLEMENTED }));

import { loadMisVacacionesPageData } from "./biblioteca";

function user(access: string, id = "me"): AuthenticatedUser {
  return {
    member: { id, name: "Ana", role: access, area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "",
    access,
  } as AuthenticatedUser;
}

const LIBRARY = { viewerId: "me", capabilities: {}, links: [], driveEnabled: false };
const NOW = new Date("2026-11-07T18:00:00.000Z");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.IMPLEMENTED)) mocks.IMPLEMENTED[key] = true;
  mocks.readMyVacations.mockResolvedValue({ balance: { entitled: 12, taken: 0, pending: 0, available: 12 }, requests: [] });
  mocks.readTeamAbsences.mockResolvedValue([]);
  mocks.readPendingVacationRequests.mockResolvedValue([]);
  mocks.readVacationSettings.mockResolvedValue({ daysPerYear: 12, overrides: [] });
  mocks.loadBibliotecaData.mockResolvedValue(LIBRARY);
});

describe("loadMisVacacionesPageData", () => {
  it("starts every read before any of them answers (one wave)", async () => {
    const reads = [
      mocks.readMyVacations,
      mocks.readTeamAbsences,
      mocks.loadBibliotecaData,
      mocks.readPendingVacationRequests,
      mocks.readVacationSettings,
    ];
    const gates = reads.map(() => deferred<unknown>());
    reads.forEach((read, i) => read.mockReturnValue(gates[i].promise));

    const loading = loadMisVacacionesPageData(user("Administrador"), { month: "2026-11" }, NOW);
    await Promise.resolve();
    for (const read of reads) expect(read).toHaveBeenCalledTimes(1);

    gates[0].resolve({ balance: { entitled: 12, taken: 0, pending: 0, available: 12 }, requests: [] });
    gates[1].resolve([]);
    gates[2].resolve(LIBRARY);
    gates[3].resolve([]);
    gates[4].resolve({ daysPerYear: 12, overrides: [] });
    await expect(loading).resolves.toMatchObject({ month: "2026-11", deciders: { viewerStaffId: "me" } });
  });

  it("uses the Mexico City month when none is given and reads the mis-vacaciones documents", async () => {
    const data = await loadMisVacacionesPageData(user("Colaborador"), {}, new Date("2026-12-01T03:00:00.000Z"));
    expect(data.month).toBe("2026-11");
    expect(data.year).toBe(2026);
    expect(mocks.readTeamAbsences).toHaveBeenCalledWith(expect.anything(), "2026-11");
    expect(mocks.loadBibliotecaData).toHaveBeenCalledWith(expect.anything(), "mis-vacaciones");
    expect(data.library).toBe(LIBRARY);
  });

  it("returns deciders: null for a non-decider and never reads pending requests or settings", async () => {
    const data = await loadMisVacacionesPageData(user("Colaborador"), { month: "2026-11" }, NOW);
    expect(data.deciders).toBeNull();
    expect(mocks.readPendingVacationRequests).not.toHaveBeenCalled();
    expect(mocks.readVacationSettings).not.toHaveBeenCalled();
  });

  it("drops the decider's own pending request", async () => {
    mocks.readPendingVacationRequests.mockResolvedValue([
      { id: "r1", staffId: "s2", name: "Juan", from: "2026-12-01", to: "2026-12-02", kind: "vacaciones", comment: "", status: "pendiente", days: 2 },
      { id: "r2", staffId: "me", name: "Ana", from: "2026-12-03", to: "2026-12-03", kind: "personal", comment: "", status: "pendiente", days: 1 },
    ]);
    const data = await loadMisVacacionesPageData(user("Dirección"), { month: "2026-11" }, NOW);
    expect(data.deciders?.requests.map((r) => r.id)).toEqual(["r1"]);
  });

  it("returns null sections while the reads are stubs", async () => {
    mocks.IMPLEMENTED.fetchMyVacationsAction = false;
    mocks.IMPLEMENTED.fetchTeamAbsencesAction = false;
    mocks.IMPLEMENTED.fetchVacationSettingsAction = false;
    const data = await loadMisVacacionesPageData(user("Administrador"), { month: "2026-11" }, NOW);
    expect(data.mine).toBeNull();
    expect(data.absences).toBeNull();
    expect(data.deciders?.settings).toBeNull();
    expect(mocks.readMyVacations).not.toHaveBeenCalled();
    expect(mocks.readTeamAbsences).not.toHaveBeenCalled();
    expect(mocks.readVacationSettings).not.toHaveBeenCalled();
  });
});
