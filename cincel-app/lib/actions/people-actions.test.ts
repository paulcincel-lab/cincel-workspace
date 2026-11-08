// @vitest-environment node
/**
 * Personas aggregates (redesign BE §7.11): availability thresholds, occupancy,
 * task order and the action guards (FORBIDDEN, NOT_FOUND, hours privacy,
 * admin-task filtering passed to the repository). The DB side lives in
 * `people-actions.db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dayAvailability,
  dominantTramo,
  initialsOf,
  occupancyPct,
  openCounts,
  taskReason,
  toAttentionItems,
  weekAvailability,
  workWeek,
} from "@/lib/people/aggregates";

const state = vi.hoisted(() => ({
  access: "Administrador" as string,
  memberId: "11111111-1111-4111-8111-111111111111",
  canViewTeam: true,
  teamHours: true,
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: state.memberId,
      name: "Viewer",
      role: state.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "viewer@cincel.example",
    access: state.access,
  })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveTeamCapabilities: vi.fn(() => ({ canViewTeam: state.canViewTeam })),
  canViewTeamHours: vi.fn(() => state.teamHours),
}));
vi.mock("@/lib/tramos/compat", () => ({
  canSeeAdminData: vi.fn((user: { access: string }) => user.access === "Administrador"),
}));
vi.mock("@/lib/time-tracking/settings", () => ({
  TIME_TRACKING_TIME_ZONE: "America/Mexico_City",
  getTimeTrackingSettings: vi.fn(async () => ({ enabled: true })),
}));
vi.mock("@/lib/time-tracking/week-hours", () => ({
  weekHours: vi.fn(async (_db: unknown, ids: string[]) => {
    return new Map(ids.map((id) => [id, { days: [{ date: "2026-11-02", hours: 7.5 }], total: 7.5 }]));
  }),
}));
vi.mock("@/lib/vacations/approved-absences", () => ({
  approvedAbsences: vi.fn(async () => []),
}));
vi.mock("@/lib/repositories/staff-repository", () => ({
  loadStaffPositions: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { positions: [{ id: "p1", name: "Diseñadora" }], candidatePhases: [] }]))),
  toStaff: vi.fn((row: { id: string; name: string; capacity: number }) => ({ id: row.id, name: row.name, capacity: row.capacity })),
}));

const repo = vi.hoisted(() => ({
  getStaffRow: vi.fn(),
  listActiveStaffRows: vi.fn(),
  listAssignedOpenTasks: vi.fn(),
  listActiveProjectsByStaff: vi.fn(),
  staffIdsWithPhoto: vi.fn(),
  listRecentActivity: vi.fn(),
}));
vi.mock("@/lib/repositories/people-repository", () => repo);

const OTHER = "22222222-2222-4222-8222-222222222222";

function staffRow(id: string, capacity = 10) {
  return { id, name: "Ana", lastName: "López", capacity, active: true, deletedAt: null };
}

describe("availability", () => {
  it("uses capacity / 5 per day with the 60 % and 100 % thresholds", () => {
    // capacity 10 → 2 tasks a day.
    expect(dayAvailability(0, 10, false)).toBe("libre");
    expect(dayAvailability(1, 10, false)).toBe("libre"); // 50 %
    expect(dayAvailability(2, 10, false)).toBe("ocupado"); // 100 %
    expect(dayAvailability(3, 10, false)).toBe("saturado"); // 150 %
    // capacity 25 → 5 a day: 3 = 60 % (libre), 4 = 80 % (ocupado), 5 = 100 % (ocupado), 6 = 120 %.
    expect(dayAvailability(3, 25, false)).toBe("libre");
    expect(dayAvailability(4, 25, false)).toBe("ocupado");
    expect(dayAvailability(5, 25, false)).toBe("ocupado");
    expect(dayAvailability(6, 25, false)).toBe("saturado");
  });

  it("treats capacity 0 as libre without tasks and saturado with any", () => {
    expect(dayAvailability(0, 0, false)).toBe("libre");
    expect(dayAvailability(1, 0, false)).toBe("saturado");
  });

  it("shows vacaciones on approved absence days whatever the load", () => {
    expect(dayAvailability(9, 5, true)).toBe("vacaciones");
    const days = workWeek("2026-11-04");
    expect(
      weekAvailability({
        days,
        capacity: 10,
        dueDates: ["2026-11-02", "2026-11-02", "2026-11-02", "2026-11-03", "2026-11-06", null],
        absences: [{ from: "2026-11-05", to: "2026-11-10" }],
      })
    ).toEqual(["saturado", "libre", "libre", "vacaciones", "vacaciones"]);
  });

  it("returns Mon–Fri of the week, Sunday belonging to the week before", () => {
    expect(workWeek("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(workWeek("2026-11-08")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(workWeek("2026-11-02")[0]).toBe("2026-11-02");
  });
});

describe("occupancy and counts", () => {
  it("is open / capacity × 100, and 0 with capacity 0", () => {
    expect(occupancyPct(5, 10)).toBe(50);
    expect(occupancyPct(15, 10)).toBe(150);
    expect(occupancyPct(1, 3)).toBe(33);
    expect(occupancyPct(4, 0)).toBe(0);
  });

  it("counts overdue by commitment date before today", () => {
    expect(openCounts(["2026-11-01", "2026-11-04", null, "2026-11-10"], "2026-11-04")).toEqual({ open: 4, overdue: 1 });
  });

  it("derives initials and the dominant tramo", () => {
    expect(initialsOf("Ana María", "López")).toBe("AL");
    expect(initialsOf("Ana")).toBe("A");
    expect(dominantTramo(["diseno", null, "presale", "diseno"])).toBe("diseno");
    expect(dominantTramo([null])).toBeNull();
  });
});

describe("task order", () => {
  const today = "2026-11-04";
  const base = { projectName: "Casa", tramo: null, status: "pendiente" };

  it("puts overdue first (most late first), then by due date, undated last", () => {
    const items = toAttentionItems(
      [
        { ...base, id: "a", title: "Sin fecha", due: null },
        { ...base, id: "b", title: "Futura", due: "2026-11-09" },
        { ...base, id: "c", title: "Poco tarde", due: "2026-11-03" },
        { ...base, id: "d", title: "Muy tarde", due: "2026-10-20" },
        { ...base, id: "e", title: "Hoy", due: today },
      ],
      today,
      null
    );
    expect(items.map((i) => i.id)).toEqual(["d", "c", "e", "b", "a"]);
    expect(items[0]).toMatchObject({ tone: "critical", daysLate: 15, href: "/tareas?tarea=d" });
    expect(items[2]).toMatchObject({ reason: "Vence hoy", tone: "warn", daysLate: null });
  });

  it("labels blocked and dated tasks", () => {
    expect(taskReason({ status: "bloqueado", due: "2026-11-09" }, today).reason).toBe("Bloqueada");
    expect(taskReason({ status: "pendiente", due: "2026-11-09" }, today).reason).toBe("Vence 9 nov");
    expect(taskReason({ status: "pendiente", due: "2026-11-03" }, today).reason).toBe("Vencida hace 1 día");
  });
});

describe("people actions", async () => {
  const { fetchPeopleOverviewAction, fetchPersonaDetailAction } = await import("@/lib/actions/people-actions");

  beforeEach(() => {
    state.access = "Administrador";
    state.memberId = "11111111-1111-4111-8111-111111111111";
    state.canViewTeam = true;
    state.teamHours = true;
    repo.getStaffRow.mockReset().mockImplementation(async (id: string) => (id === OTHER ? staffRow(OTHER) : null));
    repo.listActiveStaffRows.mockReset().mockResolvedValue([staffRow(state.memberId), staffRow(OTHER, 0)]);
    repo.listAssignedOpenTasks.mockReset().mockImplementation(async (ids: string[]) => {
      return new Map(ids.map((id) => [id, [{ staffId: id, id: `t-${id}`, title: "T", status: "pendiente", due: null, projectName: "Casa", tramo: "diseno" }]]));
    });
    repo.listActiveProjectsByStaff.mockReset().mockImplementation(async (ids: string[]) => {
      return new Map(ids.map((id) => [id, [{ staffId: id, projectId: "p", name: "Casa", progress: 40, role: "coordinador" }]]));
    });
    repo.staffIdsWithPhoto.mockReset().mockResolvedValue(new Set());
    repo.listRecentActivity.mockReset().mockResolvedValue({ rows: [], customStatusNames: new Map() });
  });

  it("refuses viewers without team.canViewTeam", async () => {
    state.canViewTeam = false;
    await expect(fetchPeopleOverviewAction()).rejects.toThrow("FORBIDDEN");
    await expect(fetchPersonaDetailAction(OTHER)).rejects.toThrow("FORBIDDEN");
  });

  it("returns one row per active staff with occupancy", async () => {
    const rows = await fetchPeopleOverviewAction();
    expect(rows.map((r) => r.staffId)).toEqual([state.memberId, OTHER]);
    expect(rows[0]).toMatchObject({ open: 1, overdue: 0, activeProjects: 1, occupancyPct: 10, weekHours: 7.5 });
    expect(rows[1]).toMatchObject({ occupancyPct: 0 });
    expect(rows[0]!.availability).toHaveLength(5);
  });

  it("shows only the viewer's own hours without canViewTeamHours", async () => {
    state.teamHours = false;
    state.access = "Colaborador";
    const rows = await fetchPeopleOverviewAction();
    expect(rows.find((r) => r.staffId === state.memberId)!.weekHours).toBe(7.5);
    expect(rows.find((r) => r.staffId === OTHER)!.weekHours).toBeNull();

    const detail = await fetchPersonaDetailAction(OTHER);
    expect(detail.weekHours).toBeNull();
    expect(detail.person.weekHours).toBeNull();
    expect(detail.stats.map((s) => s.key)).toEqual(["abiertas", "vencidas", "proyectos_activos"]);
  });

  it("asks the repository for admin tasks only with canSeeAdminData", async () => {
    await fetchPeopleOverviewAction();
    expect(repo.listAssignedOpenTasks).toHaveBeenLastCalledWith(expect.any(Array), { includeAdmin: true });
    state.access = "Dirección";
    await fetchPeopleOverviewAction();
    expect(repo.listAssignedOpenTasks).toHaveBeenLastCalledWith(expect.any(Array), { includeAdmin: false });
  });

  it("returns NOT_FOUND for unknown or malformed ids", async () => {
    await expect(fetchPersonaDetailAction("33333333-3333-4333-8333-333333333333")).rejects.toThrow("NOT_FOUND");
    await expect(fetchPersonaDetailAction("nope")).rejects.toThrow("NOT_FOUND");
  });

  it("builds the persona detail with role sublabels and hours for team-hours viewers", async () => {
    const detail = await fetchPersonaDetailAction(OTHER);
    expect(detail.person).toMatchObject({ id: OTHER, name: "Ana López", initials: "AL", puesto: "Diseñadora", tramo: "diseno" });
    expect(detail.projects).toEqual([
      { id: "p", label: "Casa", sublabel: "coordinador", real: 40, href: "/proyectos/p" },
    ]);
    expect(detail.stats.map((s) => s.key)).toEqual(["abiertas", "vencidas", "horas_semana", "proyectos_activos"]);
    expect(detail.weekHours).toEqual([{ date: "2026-11-02", hours: 7.5 }]);
    expect(detail.tasks[0]).toMatchObject({ id: `t-${OTHER}`, assignee: { id: OTHER, name: "Ana López", initials: "AL" } });
  });

  it("returns recentActivity from the person's events, admin items only with canSeeAdminData", async () => {
    const now = Date.now();
    repo.listRecentActivity.mockResolvedValue({
      rows: [
        { id: "e1", entity: "project", entityId: "p", kind: "cambio", field: "progress", afterValue: "90", comment: null, eventAt: new Date(now - 60_000), title: "Casa Lomas", adminTask: false },
        { id: "e2", entity: "task", entityId: "t-a", kind: "comentario", field: null, afterValue: null, comment: "Listo", eventAt: new Date(now - 120_000), title: "Conciliar facturas", adminTask: true },
        { id: "e3", entity: "task", entityId: "t-1", kind: "cambio", field: "customStatusId", afterValue: "cs-qa", comment: null, eventAt: new Date(now - 180_000), title: "Plano", adminTask: false },
      ],
      customStatusNames: new Map([["cs-qa", "QA en revisión"]]),
    });

    const admin = await fetchPersonaDetailAction(OTHER);
    expect(repo.listRecentActivity).toHaveBeenLastCalledWith(OTHER, { includeAdmin: true });
    expect(admin.recentActivity.map((a) => a.text)).toEqual([
      "Movió “Casa Lomas” a 90%",
      "Comentó en “Conciliar facturas”",
      "Movió “Plano” a QA en revisión",
    ]);
    expect(admin.recentActivity[0]).toMatchObject({ id: "e1", href: "/proyectos/p" });
    expect(admin.recentActivity[0]!.when).toMatch(/^(hoy|ayer) \d{1,2}:\d{2}$/);

    state.access = "Dirección";
    const director = await fetchPersonaDetailAction(OTHER);
    expect(repo.listRecentActivity).toHaveBeenLastCalledWith(OTHER, { includeAdmin: false });
    expect(director.recentActivity.map((a) => a.id)).toEqual(["e1", "e3"]);
  });
});
