// @vitest-environment happy-dom
/**
 * Personas · Equipo on the client (Query Migration 6): the signed-in user
 * comes from the session store, the hydrated page data renders without a
 * request, the editor reads the puestos catalog only while open, and a save
 * never refreshes the router.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  drawer: null as null | { show: boolean; positionOptions: unknown[]; canRecheckAccess: boolean; onSave(): void },
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  fetchPositionsAction: vi.fn(async () => [{ id: "p1", name: "Residente", active: true, phases: [] }]),
  getPersonasEquipoPageData: vi.fn(),
  getPersonasCountsAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffDetailAction: vi.fn(), saveMemberAction: vi.fn() }));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: m.fetchPositionsAction }));
vi.mock("@/lib/actions/page-data/personas-actions", () => ({
  getPersonasEquipoPageData: m.getPersonasEquipoPageData,
  getPersonasCountsAction: m.getPersonasCountsAction,
  getPersonasContactsPageData: vi.fn(),
}));
vi.mock("@/components/equipo/MemberEditorDrawer", () => ({
  MemberEditorDrawer: (props: NonNullable<typeof m.drawer>) => {
    m.drawer = props;
    return null;
  },
}));
vi.mock("@/components/personas/TeamGrid", () => ({ TeamGrid: () => <div data-testid="team-grid" /> }));
vi.mock("@/components/personas/AvailabilityWeek", () => ({ AvailabilityWeek: () => null }));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetSessionStoreForTests } from "@/lib/stores/session-store";
import { seedSessionUser } from "@/tests/helpers/session-user";

import { EquipoView, PersonasEquipoScreen } from "./EquipoView";
import { PERSONAS_COUNTS } from "./personas-contacts.fixtures";

const PEOPLE = [{ id: "s1", name: "Ana Ruiz", initials: "AR", puesto: null, tramo: null, open: 0, overdue: 0, weekHours: null, href: "/personas/equipo/s1" }];

beforeEach(() => {
  resetSessionStoreForTests();
  m.drawer = null;
  m.fetchPositionsAction.mockClear();
  m.getPersonasEquipoPageData.mockReset();
  m.getPersonasCountsAction.mockReset();
  m.router.refresh.mockReset();
});

afterEach(cleanup);

describe("EquipoView", () => {
  it("reads the signed-in user from the session store (Administrador: recheck and puestos link)", () => {
    seedSessionUser({ member: { id: "s-admin", name: "Ana" }, access: "Administrador" });
    renderWithQueryClient(<EquipoView people={PEOPLE} emails={{}} counts={PERSONAS_COUNTS} canCreate />);
    expect(screen.getByRole("button", { name: "Agregar persona" })).toBeTruthy();
    expect(m.drawer!.canRecheckAccess).toBe(true);
  });

  it("gives a Colaborador session no Administrador controls", () => {
    seedSessionUser({ member: { id: "s-colab", name: "Bruno" }, access: "Colaborador" });
    renderWithQueryClient(<EquipoView people={PEOPLE} emails={{}} counts={PERSONAS_COUNTS} canCreate />);
    expect(m.drawer!.canRecheckAccess).toBe(false);
  });

  it("reads the puestos catalog only while the editor is open", async () => {
    seedSessionUser({ member: { id: "s-admin", name: "Ana" }, access: "Administrador" });
    renderWithQueryClient(<EquipoView people={PEOPLE} emails={{}} counts={PERSONAS_COUNTS} canCreate />);
    expect(m.drawer!.show).toBe(false);
    expect(m.fetchPositionsAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
    await waitFor(() => expect(m.drawer!.positionOptions).toHaveLength(1));
    expect(m.drawer!.show).toBe(true);
    expect(m.fetchPositionsAction).toHaveBeenCalledTimes(1);
  });

  it("never refreshes the router", () => {
    seedSessionUser({ member: { id: "s-admin", name: "Ana" }, access: "Administrador" });
    renderWithQueryClient(<EquipoView people={PEOPLE} emails={{}} counts={PERSONAS_COUNTS} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
    act(() => m.drawer!.onSave());
    expect(m.router.refresh).not.toHaveBeenCalled();
  });
});

describe("PersonasEquipoScreen", () => {
  it("renders the hydrated page data and counts without a request", () => {
    seedSessionUser({ member: { id: "s-admin", name: "Ana" }, access: "Administrador" });
    const client = createTestQueryClient();
    client.setQueryData(qk.personas.equipo(), { people: PEOPLE, emails: {}, canCreate: false });
    client.setQueryData(qk.personas.counts(), PERSONAS_COUNTS);
    renderWithQueryClient(<PersonasEquipoScreen />, { client });
    expect(screen.getByTestId("team-grid")).toBeTruthy();
    expect(m.getPersonasEquipoPageData).not.toHaveBeenCalled();
    expect(m.getPersonasCountsAction).not.toHaveBeenCalled();
  });
});
