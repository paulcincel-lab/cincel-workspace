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
  requireCapabilityUser: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => session);

const loaders = vi.hoisted(() => ({
  loadAjustesEstatus: vi.fn(),
  loadAjustesPermisos: vi.fn(),
}));
vi.mock("@/lib/loaders/ajustes", () => loaders);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({
  getAjustesEstatusPageData: vi.fn(),
  getAjustesPermisosPageData: vi.fn(),
}));

vi.mock("@/components/ajustes/EstatusSettings", () => ({ EstatusSettings: () => null }));
vi.mock("@/components/ajustes/PermisosSettings", () => ({ PermisosSettings: () => null }));

import AjustesEstatusLayout from "./estatus/layout";
import AjustesEstatusPage from "./estatus/page";
import AjustesPermisosLayout from "./permisos/layout";
import AjustesPermisosPage from "./permisos/page";
import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import type { QueryClient } from "@tanstack/react-query";

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
  type HydratedPage = ReactElement<{ qc: QueryClient; children: ReactElement }>;
  const ADMIN = user("Administrador");

  beforeEach(() => {
    vi.clearAllMocks();
    session.requireCapabilityUser.mockResolvedValue(ADMIN);
  });

  it("/ajustes/estatus prefetches the statuses for the viewer and hydrates them", async () => {
    const statuses = [{ id: "s1", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 }];
    loaders.loadAjustesEstatus.mockResolvedValueOnce({ statuses });

    const page = (await AjustesEstatusPage()) as HydratedPage;

    expect(page.type).toBe(Hydrate);
    expect(page.props.children.type).toBe(EstatusSettings);
    expect(loaders.loadAjustesEstatus).toHaveBeenCalledWith(ADMIN);
    expect(page.props.qc.getQueryData(qk.ajustes.page("estatus"))).toEqual({ statuses });
    // The status catalog is seeded from the same rows.
    expect(page.props.qc.getQueryData(qk.catalog.taskStatuses())).toEqual(statuses);
  });

  it("/ajustes/permisos prefetches the summary for the viewer and hydrates it", async () => {
    const data = {
      staff: [{ id: "a1", name: "Alejandro", lastName: null, active: true, access: "Administrador" }],
      defaultPermissions: { Dirección: {} },
      permissions: { Dirección: {} },
      hasCustom: false,
    };
    loaders.loadAjustesPermisos.mockResolvedValueOnce(data);

    const page = (await AjustesPermisosPage()) as HydratedPage;

    expect(page.type).toBe(Hydrate);
    expect(page.props.children.type).toBe(PermisosSettings);
    expect(loaders.loadAjustesPermisos).toHaveBeenCalledWith(ADMIN);
    expect(page.props.qc.getQueryData(qk.ajustes.page("permisos"))).toEqual(data);
  });

  it("/ajustes/permisos still renders when the loader fails (the client query shows the error)", async () => {
    loaders.loadAjustesPermisos.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const page = (await AjustesPermisosPage()) as HydratedPage;
    expect(page.props.children.type).toBe(PermisosSettings);
    expect(page.props.qc.getQueryData(qk.ajustes.page("permisos"))).toBeUndefined();
  });
});
