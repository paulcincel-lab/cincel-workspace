// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { testUser } from "@/tests/unit/fixtures/horario";

/** FE §8: settings = Administrador; team report = Administrador or Dirección. */
vi.mock("@/lib/auth/permissions", () => ({
  canManageTimeTracking: (user: AuthenticatedUser | null) => user?.access === "Administrador",
  canViewTeamHours: (user: AuthenticatedUser | null) => user?.access === "Administrador" || user?.access === "Dirección",
}));

const NOT_FOUND = "NEXT_NOT_FOUND";
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
  // Next's own control-flow errors pass through the segment guard.
  unstable_rethrow: vi.fn((err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_")) throw err;
  }),
}));
vi.mock("next/navigation", () => navigation);

const session = vi.hoisted(() => ({ current: null as AuthenticatedUser | null }));
vi.mock("@/lib/auth/session", () => ({
  requirePageCapability: vi.fn(async (cap: (user: AuthenticatedUser) => boolean) => {
    if (!session.current || !cap(session.current)) navigation.notFound();
    return session.current;
  }),
}));

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchTimeTrackingSettingsAction: true,
    saveTimeTrackingSettingsAction: true,
    fetchMyTodayAction: true,
    clockInAction: true,
    pauseWorkAction: true,
    resumeWorkAction: true,
    clockOutAction: true,
    fetchTeamHoursAction: true,
    fetchMyWeekHoursAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => flags);
vi.mock("@/lib/actions/time-tracking-actions", () => ({}));

import HorarioSegmentLayout from "./layout";
import { requirePageCapability } from "@/lib/auth/session";
import { horarioControlSection } from "@/lib/shell/settings-sections/horario/control";
import { horarioHorasEquipoSection } from "@/lib/shell/settings-sections/horario/horas-equipo";
import { horarioReglasSection } from "@/lib/shell/settings-sections/horario/reglas";
import { horarioVistaPreviaSection } from "@/lib/shell/settings-sections/horario/vista-previa";
import { canOpenHorario } from "@/lib/shell/settings-sections/horario/access";

const OTHER_ROLES = ["Jefe de Taller", "Jefe de Construcción", "Arquitecto Senior", "Arquitecto Junior", "Colaborador", "Pasante / Servicio Social", "Otros"];

beforeEach(() => {
  session.current = null;
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/ajustes/horario segment guard", () => {
  it("guards the segment with canOpenHorario", async () => {
    session.current = testUser("Administrador");
    await HorarioSegmentLayout({ children: null });
    expect(requirePageCapability).toHaveBeenCalledWith(canOpenHorario);
  });

  it.each(["Administrador", "Dirección"])("admits %s", async (access) => {
    session.current = testUser(access);
    await expect(HorarioSegmentLayout({ children: "contenido" })).resolves.toBe("contenido");
  });

  it.each(OTHER_ROLES)("404 for %s", async (access) => {
    session.current = testUser(access);
    await expect(HorarioSegmentLayout({ children: null })).rejects.toThrow(NOT_FOUND);
  });
});

describe("/ajustes/horario sections check their own capability", () => {
  const sections = [horarioControlSection, horarioReglasSection, horarioVistaPreviaSection, horarioHorasEquipoSection];
  const visibleFor = (access: string) => sections.filter((s) => s.visible(testUser(access))).map((s) => s.name);

  it("Administrador sees every section", () => {
    expect(visibleFor("Administrador")).toEqual(["control", "reglas", "vista-previa", "horas-equipo"]);
  });

  it("Dirección sees the read-only rules and the report", () => {
    expect(visibleFor("Dirección")).toEqual(["reglas", "horas-equipo"]);
  });

  it.each(OTHER_ROLES)("%s sees nothing", (access) => {
    expect(visibleFor(access)).toEqual([]);
  });

  it("hides the report while fetchTeamHoursAction is a stub", () => {
    flags.IMPLEMENTED.fetchTeamHoursAction = false;
    expect(visibleFor("Administrador")).toEqual(["control", "reglas", "vista-previa"]);
  });

  it("hides the settings sections while fetchTimeTrackingSettingsAction is a stub", () => {
    flags.IMPLEMENTED.fetchTimeTrackingSettingsAction = false;
    expect(visibleFor("Administrador")).toEqual(["horas-equipo"]);
  });

  it("keeps the registry order", () => {
    expect(sections.map((s) => s.order)).toEqual([10, 20, 30, 40]);
    expect(sections.every((s) => s.page === "horario")).toBe(true);
  });
});
