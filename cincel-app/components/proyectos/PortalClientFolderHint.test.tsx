// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const actions = vi.hoisted(() => ({
  getProyectoClientesData: vi.fn(),
  getProyectoClientesActivity: vi.fn(),
  getProyectoArchivosData: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => actions);

/** The Clientes payload the tab caches; only `clientFolderUrl` matters here. */
function clientes(clientFolderUrl: string | null) {
  return {
    rows: [],
    contacts: [],
    capabilities: { manageAccess: true, disableUsers: false },
    hasClient: true,
    canAssignClient: false,
    clientFolderUrl,
  };
}

import { PortalClientFolderHint } from "./PortalClientFolderHint";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const FOLDER_URL = "https://drive.google.com/drive/folders/folder-123";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("PortalClientFolderHint", () => {
  it("shows the hint and opens the client's Drive folder in a new tab", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.tab(PROJECT_ID, "clientes"), clientes(FOLDER_URL));
    renderWithQueryClient(<PortalClientFolderHint projectId={PROJECT_ID} />, { client });

    expect(screen.getByText("Todo lo que pongas en 02 Cliente lo verán los clientes invitados a este proyecto.")).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Abrir carpeta del cliente en Drive" });
    expect(link.getAttribute("href")).toBe(FOLDER_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // Read from the cached Clientes data: no action call, no effect.
    expect(actions.getProyectoClientesData).not.toHaveBeenCalled();
  });

  it("disables the button while the folder doesn't exist yet", async () => {
    actions.getProyectoClientesData.mockResolvedValue(clientes(null));
    renderWithQueryClient(<PortalClientFolderHint projectId={PROJECT_ID} />);

    expect(await screen.findByText("La carpeta del cliente todavía no existe en Drive.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button", { name: "Abrir carpeta del cliente en Drive" });
    expect(button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true").toBe(true);
  });
});
