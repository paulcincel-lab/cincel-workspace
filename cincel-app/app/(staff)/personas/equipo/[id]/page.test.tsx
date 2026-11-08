import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const loadPersonaDetail = vi.hoisted(() => vi.fn());
const USER = vi.hoisted(() => ({ member: { id: "s-viewer" }, email: "", access: "Colaborador" }));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => USER) }));
vi.mock("./load-persona-detail", () => ({ loadPersonaDetail }));
vi.mock("@/components/personas/PersonaDetail", () => ({ PersonaDetailScreen: () => null }));
// One request-scoped client per test (React `cache` does not memoize outside a server render).
const server = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/query/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/server")>()),
  getQueryClient: () => server.client,
}));

import { PersonaDetailScreen } from "@/components/personas/PersonaDetail";
import { personaDetailFixture } from "@/components/personas/persona-detail.fixtures";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

import PersonaDetallePage from "./page";

beforeEach(() => {
  notFound.mockClear();
  loadPersonaDetail.mockReset();
  server.client = createTestQueryClient();
});

type HydrateElement = ReactElement<{ children: ReactElement<{ staffId: string }> }>;

describe("/personas/equipo/[id]", () => {
  it("prefetches personas.detail(id) for the viewer and renders the screen under Hydrate", async () => {
    const detail = personaDetailFixture({ canSeeAdminData: false, canViewHours: false });
    loadPersonaDetail.mockResolvedValue(detail);
    const element = (await PersonaDetallePage({ params: Promise.resolve({ id: "s-paul" }) })) as HydrateElement;
    expect(loadPersonaDetail).toHaveBeenCalledWith(USER, "s-paul");
    expect(element.props.children.type).toBe(PersonaDetailScreen);
    expect(element.props.children.props).toEqual({ staffId: "s-paul" });
    const client = server.client as ReturnType<typeof createTestQueryClient>;
    expect(client.getQueryData(qk.personas.detail("s-paul"))).toBe(detail);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("shows the standard not-found state when there is no detail", async () => {
    loadPersonaDetail.mockResolvedValue(null);
    await expect(PersonaDetallePage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
