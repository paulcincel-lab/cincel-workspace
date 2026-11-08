import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  // Next's own control-flow errors pass through; anything else is swallowed by the caller.
  unstable_rethrow: vi.fn((err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_")) throw err;
  }),
}));
vi.mock("next/navigation", () => navigation);

const viewer = vi.hoisted(() => ({ current: null as AuthenticatedUser | null }));
const session = vi.hoisted(() => ({
  requirePageCapability: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => session);


const statusActions = vi.hoisted(() => ({ fetchTaskStatusesAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/task-statuses-actions", () => statusActions);

const staffActions = vi.hoisted(() => ({ fetchStaffAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/staff-actions", () => staffActions);

vi.mock("@/components/ajustes/EstatusSettings", () => ({ EstatusSettings: () => null }));
vi.mock("@/components/ajustes/PermisosSettings", () => ({ PermisosSettings: () => null }));

import AjustesEstatusLayout from "./estatus/layout";
import AjustesEstatusPage from "./estatus/page";
import AjustesPermisosLayout from "./permisos/layout";
import AjustesPermisosPage from "./permisos/page";
import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { PermisosSettings } from "@/components/ajustes/PermisosSettings";

type SegmentLayout = (props: { children: ReactNode }) => Promise<ReactNode>;

function user(access: string, role = access): AuthenticatedUser {
  return {
    member: {
      id: "staff-1",
      name: "Prueba",
      role,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "prueba@example.test",
      phone: "",
    },
    email: "prueba@example.test",
    access,
  } as unknown as AuthenticatedUser;
}

/** Like the real guard: no capability → notFound(). */
function guardLikeTheRealOne() {
  session.requirePageCapability.mockImplementation(async (cap: (u: AuthenticatedUser) => boolean) => {
    if (!viewer.current || !cap(viewer.current)) navigation.notFound();
    return viewer.current;
  });
}

const SEGMENTS: Array<[string, SegmentLayout]> = [
  ["estatus", AjustesEstatusLayout as SegmentLayout],
  ["permisos", AjustesPermisosLayout as SegmentLayout],
];

describe("Ajustes › Estatus / Permisos segment guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewer.current = null;
    guardLikeTheRealOne();
  });

  describe.each(SEGMENTS)("/ajustes/%s", (_segment, Layout) => {
    it("renders the page for an Administrador", async () => {
      viewer.current = user("Administrador");
      const child = <p>contenido</p>;
      await expect(Layout({ children: child })).resolves.toBe(child);
      expect(navigation.notFound).not.toHaveBeenCalled();
    });

    it.each(["Dirección", "Jefe de Taller", "Colaborador", "Otros"])("is a 404 for %s", async (access) => {
      viewer.current = user(access);
      await expect(Layout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
      expect(navigation.notFound).toHaveBeenCalled();
    });

    it("passes a capability that admits only the Administrador access", async () => {
      viewer.current = user("Administrador");
      await Layout({ children: null });
      const cap = session.requirePageCapability.mock.calls[0][0] as (u: AuthenticatedUser) => boolean;
      expect(cap(user("Administrador"))).toBe(true);
      expect(cap(user("Dirección"))).toBe(false);
      expect(cap(user("Colaborador", "Administrador"))).toBe(false);
    });

    it("is a 404 when the guard fails with any other error", async () => {
      session.requirePageCapability.mockRejectedValueOnce(new Error("FORBIDDEN"));
      await expect(Layout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
      expect(navigation.notFound).toHaveBeenCalledTimes(1);
    });

    it("keeps Next's redirect to /login", async () => {
      session.requirePageCapability.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));
      await expect(Layout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(navigation.notFound).not.toHaveBeenCalled();
    });
  });
});

describe("Ajustes › Estatus / Permisos pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("/ajustes/estatus hands the statuses to the client", async () => {
    const statuses = [{ id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 }];
    statusActions.fetchTaskStatusesAction.mockResolvedValueOnce(statuses as never);

    const page = (await AjustesEstatusPage()) as ReactElement<{ initialStatuses: unknown }>;

    expect(page.type).toBe(EstatusSettings);
    expect(page.props.initialStatuses).toEqual(statuses);
  });

  it("/ajustes/permisos hands staff + defaults to the client", async () => {
    const staff = [{ id: "a1", name: "Alejandro", role: "Administrador" }];
    staffActions.fetchStaffAction.mockResolvedValueOnce(staff as never);

    const page = (await AjustesPermisosPage()) as ReactElement<{ initialStaff: unknown; defaultPermissions: unknown }>;

    expect(staffActions.fetchStaffAction).toHaveBeenCalledWith({ includeInactive: true });
    expect(page.type).toBe(PermisosSettings);
    expect(page.props.initialStaff).toEqual(staff);
    expect(page.props.defaultPermissions).toHaveProperty("Dirección");
  });

  it("/ajustes/permisos still renders when the staff list can't be read", async () => {
    staffActions.fetchStaffAction.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const page = (await AjustesPermisosPage()) as ReactElement<{ initialStaff: unknown }>;
    expect(page.props.initialStaff).toEqual([]);
  });
});
