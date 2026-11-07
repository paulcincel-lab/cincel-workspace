import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectIfRedesignOff: vi.fn(async () => undefined),
  canViewTeam: true,
  fetchStaffAction: vi.fn(),
  fetchPeopleOverviewAction: vi.fn(),
  fetchContactsAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("@/lib/ui/redesign-redirect", () => ({ redirectIfRedesignOff: m.redirectIfRedesignOff }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => ({ access: "Colaborador" })) }));
vi.mock("@/lib/auth/permissions", () => ({ resolveTeamCapabilities: () => ({ canViewTeam: m.canViewTeam, canCreateCollaborator: true }) }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: m.fetchStaffAction }));
vi.mock("@/lib/actions/people-actions", () => ({ fetchPeopleOverviewAction: m.fetchPeopleOverviewAction }));
vi.mock("@/lib/actions/contacts-actions", () => ({ fetchContactsAction: m.fetchContactsAction }));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/tramos/compat", () => ({
  listTramos: vi.fn(async () => [
    { id: "w2", key: "diseno", name: "Diseño", sortOrder: 1 },
    { id: "w3", key: "construccion", name: "Construcción", sortOrder: 2 },
  ]),
}));
vi.mock("@/components/personas/EquipoView", () => ({ EquipoView: () => null }));
vi.mock("@/components/shell/StyleProvider", () => ({ StyleProvider: () => null }));

import { EquipoView, type EquipoViewProps } from "@/components/personas/EquipoView";
import { EQUIPO_OVERVIEW_NO_HOURS, EQUIPO_STAFF } from "@/components/personas/fixtures/equipo";
import { StyleProvider } from "@/components/shell/StyleProvider";

import PersonasEquipoPage from "./page";

const run = (sp: Record<string, string> = {}) => PersonasEquipoPage({ searchParams: Promise.resolve(sp) });

beforeEach(() => {
  m.notFound.mockClear();
  m.redirectIfRedesignOff.mockClear();
  m.canViewTeam = true;
  m.fetchStaffAction.mockReset().mockResolvedValue(EQUIPO_STAFF);
  m.fetchPeopleOverviewAction.mockReset().mockResolvedValue(EQUIPO_OVERVIEW_NO_HOURS);
  m.fetchContactsAction.mockReset().mockResolvedValue([
    { type: "cliente", providerProfile: null },
    { type: "proveedor", providerProfile: { subtype: "contratista" } },
    { type: "proveedor", providerProfile: { subtype: "tienda" } },
  ]);
});

describe("/personas", () => {
  it("checks the redesign flag with the page path before loading anything", async () => {
    await run({ estilo: "esencial" });
    expect(m.redirectIfRedesignOff).toHaveBeenCalledWith("/personas", { estilo: "esencial" });
    expect(m.redirectIfRedesignOff.mock.invocationCallOrder[0]).toBeLessThan(
      m.fetchStaffAction.mock.invocationCallOrder[0],
    );
  });

  it("is not found without team.canViewTeam", async () => {
    m.canViewTeam = false;
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.fetchStaffAction).not.toHaveBeenCalled();
  });

  it("passes the joined people, emails and tab counts to the view", async () => {
    const element = (await run()) as ReactElement<EquipoViewProps>;
    expect(element.type).toBe(EquipoView);
    const { people, emails, counts } = element.props;
    expect(people.map((p) => p.name)).toEqual(["Ana Ruiz", "Bruno Soto", "Carla Méndez"]);
    expect(people.map((p) => p.open)).toEqual([6, 2, 0]);
    expect(people.every((p) => p.weekHours === null)).toBe(true);
    expect(people.map((p) => p.tramo)).toEqual(["diseno", "construccion", null]);
    expect(emails[EQUIPO_STAFF[0].id]).toBe("ana@cincel.mx");
    expect(counts).toEqual({ equipo: 3, clientes: 1, contratistas: 1, proveedores: 2 });
    expect(element.props.canCreate).toBe(true);
  });

  it("still renders the team when the overview action fails or returns nothing", async () => {
    m.fetchPeopleOverviewAction.mockRejectedValue(new Error("boom"));
    const element = (await run()) as ReactElement<EquipoViewProps>;
    expect(element.props.people).toHaveLength(3);
    expect(element.props.people.every((p) => p.open === 0 && p.weekHours === null)).toBe(true);
  });

  it("wraps the view in a StyleProvider override for ?estilo=", async () => {
    const element = (await run({ estilo: "analitico" })) as ReactElement<{ style: string; isOverridden: boolean }>;
    expect(element.type).toBe(StyleProvider);
    expect(element.props).toMatchObject({ style: "analitico", isOverridden: true });
  });

  it("ignores an unknown ?estilo= value", async () => {
    const element = (await run({ estilo: "otro" })) as ReactElement;
    expect(element.type).toBe(EquipoView);
  });
});
