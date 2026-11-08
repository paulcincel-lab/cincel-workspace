import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  canViewTeam: true,
  user: { member: { id: "s-viewer" }, email: "", access: "Colaborador" },
  loadPersonasEquipo: vi.fn(),
  loadPersonasCounts: vi.fn(),
  client: null as unknown,
}));

vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => m.user) }));
vi.mock("@/lib/auth/permissions", () => ({ resolveTeamCapabilities: () => ({ canViewTeam: m.canViewTeam }) }));
vi.mock("@/lib/loaders/personas", () => ({
  loadPersonasEquipo: m.loadPersonasEquipo,
  loadPersonasCounts: m.loadPersonasCounts,
}));
// One request-scoped client per test (React `cache` does not memoize outside a server render).
vi.mock("@/lib/query/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/server")>()),
  getQueryClient: () => m.client,
}));
vi.mock("@/components/personas/EquipoView", () => ({ PersonasEquipoScreen: () => null }));

import { PersonasEquipoScreen } from "@/components/personas/EquipoView";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

import PersonasEquipoPage from "./page";

const run = () => PersonasEquipoPage();
const client = () => m.client as ReturnType<typeof createTestQueryClient>;

const EQUIPO = {
  people: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
  emails: { s1: "ana@cincel.mx" },
  canCreate: true,
};
const COUNTS = { equipo: 3, clientes: 1, contratistas: 1, proveedores: 2 };

beforeEach(() => {
  m.notFound.mockClear();
  m.canViewTeam = true;
  m.client = createTestQueryClient();
  m.loadPersonasEquipo.mockReset().mockResolvedValue(EQUIPO);
  m.loadPersonasCounts.mockReset().mockResolvedValue(COUNTS);
});

describe("/personas", () => {
  it("is not found without team.canViewTeam", async () => {
    m.canViewTeam = false;
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.loadPersonasEquipo).not.toHaveBeenCalled();
  });

  it("prefetches personas.equipo and personas.counts for the viewer and renders the screen under Hydrate", async () => {
    const element = (await run()) as ReactElement<{ children: ReactElement }>;
    expect(element.type).toBe(Hydrate);
    expect(element.props.children.type).toBe(PersonasEquipoScreen);
    expect(m.loadPersonasEquipo).toHaveBeenCalledWith(m.user);
    expect(client().getQueryData(qk.personas.equipo())).toEqual(EQUIPO);
    expect(client().getQueryData(qk.personas.counts())).toEqual(COUNTS);
  });

  it("hands the counts loader the active team it just listed (no second COUNT)", async () => {
    await run();
    expect(m.loadPersonasCounts).toHaveBeenCalledWith(m.user, { activeStaff: 3 });
  });

  it("renders the screen with no style wrapper (useStyle reads ?estilo= from the URL)", async () => {
    const element = (await run()) as ReactElement;
    expect(element.type).toBe(Hydrate);
  });
});
