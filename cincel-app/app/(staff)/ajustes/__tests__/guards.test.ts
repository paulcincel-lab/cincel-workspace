import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

const cookieJar = vi.hoisted(() => ({ token: "token-1" as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieJar.token ? { value: cookieJar.token } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

const viewer = vi.hoisted(() => ({ access: "Colaborador" as string | null, role: "Colaborador", mustChangePassword: false }));
vi.mock("@/lib/auth/access-role", () => ({ staffAccessRole: () => viewer.access }));

vi.mock("@/lib/repositories/auth-repository", () => ({
  findSessionByToken: vi.fn(async () => ({
    id: "session-1",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    user: {
      id: "staff-1",
      name: "Prueba",
      email: "prueba@example.test",
      role: viewer.role,
      area: null,
      active: true,
      mustChangePassword: viewer.mustChangePassword,
      googleLinked: false,
    },
    staffAccess: { googleSub: null, accessCheckedAt: null, accessRevokedAt: null },
  })),
  deleteStaffSessions: vi.fn(),
  createSessionRecord: vi.fn(),
  deleteSessionByToken: vi.fn(),
}));

vi.mock("@/lib/auth/access-recheck", () => ({
  accessRecheckHours: () => 24,
  isAccessCheckDue: () => false,
  recheckStaffAccess: vi.fn(),
}));

const permissionSpies = vi.hoisted(() => ({
  canManageTimeTracking: null as unknown as ReturnType<typeof vi.fn>,
  canViewTeamHours: null as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  permissionSpies.canManageTimeTracking = vi.fn(actual.canManageTimeTracking);
  permissionSpies.canViewTeamHours = vi.fn(actual.canViewTeamHours);
  return {
    ...actual,
    canManageTimeTracking: permissionSpies.canManageTimeTracking,
    canViewTeamHours: permissionSpies.canViewTeamHours,
  };
});

import AjustesPage from "../page";
import AjustesGeneralLayout from "../(admin)/general/layout";
import AjustesTemaLayout from "../(admin)/tema/layout";
import AjustesHorarioLayout from "../(admin)/horario/layout";
import AjustesTramosLayout from "../(admin)/tramos/layout";
import AjustesPuestosLayout from "../(admin)/puestos/layout";
import AjustesEstatusLayout from "../(admin)/estatus/layout";
import AjustesPermisosLayout from "../(admin)/permisos/layout";
import AjustesMondayLayout from "../(admin)/monday/layout";
import AjustesGoogleLayout from "../(admin)/google/layout";

type SegmentLayout = (props: { children: ReactNode }) => Promise<ReactElement>;

const SEGMENTS: Record<string, SegmentLayout> = {
  general: AjustesGeneralLayout,
  tema: AjustesTemaLayout,
  horario: AjustesHorarioLayout,
  tramos: AjustesTramosLayout,
  puestos: AjustesPuestosLayout,
  estatus: AjustesEstatusLayout,
  permisos: AjustesPermisosLayout,
  monday: AjustesMondayLayout,
  google: AjustesGoogleLayout,
};

function as(access: string, role = access) {
  viewer.access = access;
  viewer.role = role;
}

async function renderSegment(segment: string): Promise<ReactElement<{ children: ReactNode }>> {
  return (await SEGMENTS[segment]({ children: "contenido" })) as ReactElement<{ children: ReactNode }>;
}

beforeEach(() => {
  cookieJar.token = "token-1";
  viewer.mustChangePassword = false;
  as("Colaborador");
  navigation.notFound.mockClear();
  navigation.redirect.mockClear();
  permissionSpies.canManageTimeTracking.mockClear();
  permissionSpies.canViewTeamHours.mockClear();
});

describe("/ajustes segment guards", () => {
  it.each(["permisos", "general", "estatus"])("returns 404 on /ajustes/%s for a non-admin", async (segment) => {
    await expect(renderSegment(segment)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigation.notFound).toHaveBeenCalledTimes(1);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it.each(Object.keys(SEGMENTS))("returns 404 on /ajustes/%s for a non-admin", async (segment) => {
    await expect(renderSegment(segment)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(Object.keys(SEGMENTS))("renders /ajustes/%s for an Administrador", async (segment) => {
    as("Administrador");
    const element = await renderSegment(segment);
    expect(element.props.children).toBe("contenido");
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it.each(["permisos", "estatus", "monday", "google", "tramos", "puestos"])(
    "keeps /ajustes/%s for Administrador only (Dirección gets 404)",
    async (segment) => {
      as("Dirección", "Dirección");
      await expect(renderSegment(segment)).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );

  it("lets Dirección open /ajustes/horario through canViewTeamHours", async () => {
    as("Dirección", "Dirección");
    const element = await renderSegment("horario");
    expect(element.props.children).toBe("contenido");
  });

  it("admits /ajustes/horario with canManageTimeTracking alone", async () => {
    // A Colaborador has neither capability; grant only the settings one.
    permissionSpies.canManageTimeTracking.mockReturnValueOnce(true);
    const element = await renderSegment("horario");
    expect(element.props.children).toBe("contenido");
  });

  it("admits /ajustes/horario with canViewTeamHours alone", async () => {
    permissionSpies.canManageTimeTracking.mockReturnValueOnce(false);
    permissionSpies.canViewTeamHours.mockReturnValueOnce(true);
    const element = await renderSegment("horario");
    expect(element.props.children).toBe("contenido");
  });

  it("returns 404 on /ajustes/horario with neither capability", async () => {
    permissionSpies.canManageTimeTracking.mockReturnValueOnce(false);
    permissionSpies.canViewTeamHours.mockReturnValueOnce(false);
    await expect(renderSegment("horario")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a guest to /login instead of answering 404", async () => {
    cookieJar.token = null;
    await expect(renderSegment("permisos")).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it("sends a first-access account to /change-password", async () => {
    viewer.mustChangePassword = true;
    await expect(renderSegment("general")).rejects.toThrow("NEXT_REDIRECT:/change-password");
  });
});

describe("/ajustes", () => {
  it("redirects to /ajustes/apariencia", () => {
    expect(() => AjustesPage()).toThrow("NEXT_REDIRECT:/ajustes/apariencia");
    expect(navigation.redirect).toHaveBeenLastCalledWith("/ajustes/apariencia");
  });
});
