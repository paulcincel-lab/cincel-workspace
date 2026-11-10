import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  canViewActivities: true,
  user: { member: { id: "s-viewer" }, email: "", access: "Colaborador" },
  loadTareasPage: vi.fn(),
  appearance: { style: "esencial" as string | null },
  org: { styleDefault: "visual", allowUserOverride: true },
  client: null as unknown,
}));

vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => m.user) }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: m.canViewActivities }),
}));
vi.mock("@/lib/loaders/tareas", () => ({ loadTareasPage: m.loadTareasPage }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () => m.appearance,
  getStoredOrgAppearance: async () => m.org,
}));
// One request-scoped client per test (React `cache` does not memoize outside a server render).
vi.mock("@/lib/query/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/server")>()),
  getQueryClient: () => m.client,
}));
vi.mock("@/components/tareas/TareasClient", () => ({ TareasClient: () => null }));

import { TareasClient } from "@/components/tareas/TareasClient";
import { Hydrate } from "@/lib/query/hydrate";
import { createTestQueryClient } from "@/lib/query/test-utils";

import TareasPage from "./page";

const run = (searchParams: Record<string, string> = {}) => TareasPage({ searchParams: Promise.resolve(searchParams) });

/** The style of the bundle the page prefetched. */
const loadedStyle = () => (m.loadTareasPage.mock.calls.at(-1)?.[1] as { estilo: string }).estilo;

const BUNDLE = { facets: { total: 0, byTramo: {}, projects: [] }, tramos: [], staff: [] };

beforeEach(() => {
  m.notFound.mockClear();
  m.canViewActivities = true;
  m.appearance = { style: "esencial" };
  m.org = { styleDefault: "visual", allowUserOverride: true };
  m.client = createTestQueryClient();
  m.loadTareasPage.mockReset().mockResolvedValue(BUNDLE);
});

describe("/tareas", () => {
  it("is not found without the Tareas capability", async () => {
    m.canViewActivities = false;
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.loadTareasPage).not.toHaveBeenCalled();
  });

  it("renders TareasClient under Hydrate", async () => {
    const element = (await run()) as ReactElement<{ children: ReactElement }>;
    expect(element.type).toBe(Hydrate);
    expect(element.props.children.type).toBe(TareasClient);
  });

  it("prefetches the viewer's style without ?estilo=", async () => {
    await run();
    expect(loadedStyle()).toBe("esencial");
  });

  it.each(["visual", "esencial", "analitico"])("prefetches the ?estilo=%s layout", async (estilo) => {
    await run({ estilo });
    expect(loadedStyle()).toBe(estilo);
  });

  it("uses the organization's default when it allows no personal style", async () => {
    m.org = { styleDefault: "analitico", allowUserOverride: false };
    await run();
    expect(loadedStyle()).toBe("analitico");
  });

  it("keys the bundle by the filters only: the old view params pick nothing", async () => {
    await run({ vista: "lista", cal: "dia", fecha: "2026-11-06", tramo: "diseno" });
    const key = m.loadTareasPage.mock.calls.at(-1)?.[1];
    expect(key).toEqual({ estilo: "esencial", tramo: "diseno", proyecto: null, responsable: null, estado: null, q: null });
  });
});
