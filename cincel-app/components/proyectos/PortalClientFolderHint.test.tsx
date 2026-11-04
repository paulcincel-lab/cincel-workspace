// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const actions = vi.hoisted(() => ({ getProjectClientFolderUrlAction: vi.fn() }));
vi.mock("@/lib/actions/portal-actions", () => actions);

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
    actions.getProjectClientFolderUrlAction.mockResolvedValue(FOLDER_URL);
    render(<PortalClientFolderHint projectId={PROJECT_ID} />);

    expect(screen.getByText("Todo lo que pongas en 02 Cliente lo verán los clientes invitados a este proyecto.")).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Abrir carpeta del cliente en Drive" });
    expect(link.getAttribute("href")).toBe(FOLDER_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(actions.getProjectClientFolderUrlAction).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("disables the button while the folder doesn't exist yet", async () => {
    actions.getProjectClientFolderUrlAction.mockResolvedValue(null);
    render(<PortalClientFolderHint projectId={PROJECT_ID} />);

    expect(await screen.findByText("La carpeta del cliente todavía no existe en Drive.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button", { name: "Abrir carpeta del cliente en Drive" });
    expect(button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true").toBe(true);
  });
});
