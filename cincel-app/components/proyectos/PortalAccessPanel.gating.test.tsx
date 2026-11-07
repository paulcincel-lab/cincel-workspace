import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/portal-actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/proyectos/InvitePortalClientSheet", () => ({
  PORTAL_ERROR_MESSAGES: {},
  InvitePortalClientSheet: () => <div data-testid="invite-sheet" />,
}));
vi.mock("@/components/proyectos/PortalClientFolderHint", () => ({
  PortalClientFolderHint: () => <div data-testid="folder-hint" />,
}));
vi.mock("@/components/proyectos/PortalActivityCard", () => ({
  PortalActivityCard: () => <div data-testid="activity-card" />,
}));

import { PORTAL_NO_CLIENT_TEXT, PortalAccessPanel } from "./PortalAccessPanel";

afterEach(cleanup);

const capabilities = { manageAccess: true, disableUsers: false };

function renderPanel(props: { hasClient: boolean; canAssignClient: boolean }) {
  return render(
    <PortalAccessPanel
      projectId="p1"
      projectName="Casa Lomas"
      rows={[]}
      contacts={[]}
      capabilities={capabilities}
      {...props}
    />,
  );
}

describe("PortalAccessPanel portal gating", () => {
  it("replaces the invite sheet and the folder hint with an alert while there is no client", () => {
    renderPanel({ hasClient: false, canAssignClient: true });
    expect(screen.getByText(PORTAL_NO_CLIENT_TEXT)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Invitar cliente" })).toBeNull();
    expect(screen.queryByTestId("invite-sheet")).toBeNull();
    expect(screen.queryByTestId("folder-hint")).toBeNull();
    const link = screen.getByRole("link", { name: "Asignar cliente" });
    expect(link.getAttribute("href")).toBe("/proyectos/p1/ficha");
  });

  it("shows the same alert without the link to non-admins", () => {
    renderPanel({ hasClient: false, canAssignClient: false });
    expect(screen.getByText(PORTAL_NO_CLIENT_TEXT)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Asignar cliente" })).toBeNull();
  });

  it("shows the invite sheet and the folder hint once the project has a client", () => {
    renderPanel({ hasClient: true, canAssignClient: true });
    expect(screen.queryByText(PORTAL_NO_CLIENT_TEXT)).toBeNull();
    expect(screen.getByRole("button", { name: "Invitar cliente" })).toBeTruthy();
    expect(screen.getByTestId("invite-sheet")).toBeTruthy();
    expect(screen.getByTestId("folder-hint")).toBeTruthy();
  });
});
