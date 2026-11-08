// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
// The sheet loads its "Datos de monday" through a query, so it renders under a QueryClientProvider.
import { renderWithQueryClient as render } from "@/lib/query/test-utils";

import type { ContactDetail } from "@/lib/types/core";

vi.mock("@/lib/actions/import-actions", () => ({
  getImportDataAction: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactHistoryAction: vi.fn().mockResolvedValue([]),
}));

import { ClientDetailSheet } from "./ClientDetailSheet";

const noop = () => {};

function makeContact(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    name: "Familia Ruiz",
    type: "cliente",
    kind: "particular",
    email: null,
    phone: null,
    notes: null,
    acquisitionChannel: null,
    people: [],
    tags: [],
    providerProfile: null,
    stats: {
      totalProjects: 3,
      activeProjects: 2,
      firstWorkDate: "2025-01-10",
      totalContractedMxn: "0",
    },
    projects: [],
    ...overrides,
  } as unknown as ContactDetail;
}

const PROJECTS: ContactDetail["projects"] = [
  { id: "00000000-0000-4000-8000-0000000000d1", name: "Casa Madrid", status: "activo", startDate: "2025-02-01" },
  { id: "00000000-0000-4000-8000-0000000000d2", name: "Local Espiropapa", status: "pausado", startDate: null },
];

function renderSheet(contact: ContactDetail, isAdmin: boolean) {
  return render(
    <ClientDetailSheet
      contact={contact}
      onClose={noop}
      onEdit={noop}
      onDelete={noop}
      canEdit={false}
      canDelete={false}
      isAdmin={isAdmin}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("ClientDetailSheet projects section", () => {
  it("shows only the active-project count to non-admins", async () => {
    renderSheet(makeContact(), false);
    expect(await screen.findByText("2 proyectos activos")).toBeTruthy();
    expect(screen.queryByText("Sin proyectos.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ficha de proyecto" })).toBeNull();
  });

  it("never renders project names for non-admins, even if some are passed", async () => {
    renderSheet(makeContact({ projects: PROJECTS }), false);
    expect(await screen.findByText("2 proyectos activos")).toBeTruthy();
    expect(screen.queryByText("Casa Madrid")).toBeNull();
    expect(screen.queryByText("Local Espiropapa")).toBeNull();
    expect(screen.queryByRole("link", { name: "Ficha de proyecto" })).toBeNull();
  });

  it("uses the singular and falls back to zero without stats", async () => {
    renderSheet(makeContact({ stats: { totalProjects: 1, activeProjects: 1, firstWorkDate: null, totalContractedMxn: "0" } }), false);
    expect(await screen.findByText("1 proyecto activo")).toBeTruthy();
    cleanup();
    renderSheet(makeContact({ stats: null }), false);
    expect(await screen.findByText("0 proyectos activos")).toBeTruthy();
  });

  it("shows the full project list with links to admins", async () => {
    renderSheet(makeContact({ projects: PROJECTS }), true);
    expect(await screen.findByText("Casa Madrid")).toBeTruthy();
    expect(screen.getByText("Local Espiropapa")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Ficha de proyecto" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/proyectos/00000000-0000-4000-8000-0000000000d1/ficha",
      "/proyectos/00000000-0000-4000-8000-0000000000d2/ficha",
    ]);
    expect(screen.queryByText("2 proyectos activos")).toBeNull();
  });

  it("shows the empty state to admins when the client has no projects", async () => {
    renderSheet(makeContact({ projects: [] }), true);
    await waitFor(() => expect(screen.getByText("Sin proyectos.")).toBeTruthy());
  });
});
