import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, getScheduleForProjectMock } = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getScheduleForProjectMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: requireCapabilityUserMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: (user: { access?: string } | null) => ({
    canViewProjects: user?.access !== "no-access",
  }),
}));

vi.mock("@/lib/repositories/schedule-repository", () => ({
  getScheduleForProject: getScheduleForProjectMock,
}));

import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  getScheduleForProjectMock.mockReset();
});

describe("GET /api/proyectos/[id]/cronograma/export", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(new Request("http://test"), ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("403 without canViewProjects", async () => {
    requireCapabilityUserMock.mockResolvedValue({ access: "no-access" });
    const res = await GET(new Request("http://test"), ctx("p1"));
    expect(res.status).toBe(403);
  });

  it("404 when the project has no schedule", async () => {
    requireCapabilityUserMock.mockResolvedValue({ access: "Colaborador" });
    getScheduleForProjectMock.mockResolvedValue(null);
    const res = await GET(new Request("http://test"), ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("returns the legacy export shape from real schedule data", async () => {
    requireCapabilityUserMock.mockResolvedValue({ access: "Colaborador" });
    getScheduleForProjectMock.mockResolvedValue({
      project: { id: "p1", name: "Test", address: null },
      schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
      tasks: [
        { id: "t1", stableKey: "PB-a", legacyId: null, planta: "PB", seccion: "Preliminares", responsable: null, inicio: "2026-01-01", fin: "2026-01-02", tarea: "A", status: "done", flagged: true },
        { id: "t2", stableKey: "PB-b", legacyId: null, planta: "PB", seccion: "Preliminares", responsable: null, inicio: "2026-01-01", fin: "2026-01-02", tarea: "B", status: "progress", flagged: false },
        { id: "t3", stableKey: "PB-c", legacyId: null, planta: "PB", seccion: "Preliminares", responsable: null, inicio: "2026-01-01", fin: "2026-01-02", tarea: "C", status: "pending", flagged: false },
      ],
      payments: [],
      imprevistos: [{ id: "i1", fecha: "2026-07-28", texto: "Algo" }],
      adicionales: [],
    });

    const res = await GET(new Request("http://test"), ctx("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.done).toEqual({ "PB-a": "done", "PB-b": "progress" });
    expect(body.flags).toEqual({ "PB-a": true });
    expect(body.imprevistos).toEqual([{ id: "i1", fecha: "2026-07-28", texto: "Algo" }]);
    expect(body.offset).toBe(0);
    expect(typeof body.today).toBe("string");
  });
});
