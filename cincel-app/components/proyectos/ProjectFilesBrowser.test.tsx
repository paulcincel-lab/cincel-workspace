// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ retryProjectFolderAction: vi.fn() }));
vi.mock("@/lib/actions/projects-actions", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { StaffFileItem, StaffFilesResult } from "@/lib/types/workspace-access";

import { ProjectFilesBrowser, formatSize } from "./ProjectFilesBrowser";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const ARCHIVOS = `/proyectos/${PROJECT_ID}/archivos`;

function item(overrides: Partial<StaffFileItem>): StaffFileItem {
  return {
    id: "f1",
    name: "plano.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    modifiedAt: "2026-10-01T12:00:00.000Z",
    iconLink: null,
    webViewLink: "https://drive.google.com/file/d/f1/view",
    kind: "file",
    ...overrides,
  };
}

const rootOk: StaffFilesResult = {
  status: "ok",
  folderId: "root",
  breadcrumbs: [{ id: "root", name: "P-001 · Casa Ruiz" }],
  items: [
    item({ id: "int", name: "01 Interno", kind: "folder", mimeType: "application/vnd.google-apps.folder", sizeBytes: null }),
    item({ id: "cli", name: "02 Cliente", kind: "folder", mimeType: "application/vnd.google-apps.folder", sizeBytes: null }),
    item({ id: "inb", name: "03 Del cliente", kind: "folder", mimeType: "application/vnd.google-apps.folder", sizeBytes: null }),
    item({}),
  ],
};

const nestedOk: StaffFilesResult = {
  status: "ok",
  folderId: "sub",
  breadcrumbs: [
    { id: "root", name: "P-001 · Casa Ruiz" },
    { id: "cli", name: "02 Cliente" },
    { id: "sub", name: "Renders" },
  ],
  items: [item({ id: "r1", name: "Renders", kind: "folder", sizeBytes: null })],
};

function renderBrowser(result: StaffFilesResult, canRetry = true) {
  return render(<ProjectFilesBrowser projectId={PROJECT_ID} result={result} canRetry={canRetry} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ProjectFilesBrowser", () => {
  it("shows the pending folder with Reintentar carpeta for users who can edit the project", () => {
    renderBrowser({ status: "pending" });
    expect(screen.getByText("Creando la carpeta del proyecto…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar carpeta" })).toBeTruthy();
  });

  it("hides Reintentar carpeta without canEditProjectGeneral", () => {
    renderBrowser({ status: "pending" }, false);
    expect(screen.getByText("Creando la carpeta del proyecto…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar carpeta" })).toBeNull();
  });

  it("shows the failure with its error and retries the folder", async () => {
    actions.retryProjectFolderAction.mockResolvedValue({ ok: true, status: "ready" });
    renderBrowser({ status: "failed", error: "Drive quota exceeded" });

    expect(screen.getByText("No se pudo crear la carpeta del proyecto en Drive.")).toBeTruthy();
    expect(screen.getByText("Drive quota exceeded")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carpeta" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.retryProjectFolderAction).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("shows the retry error when the action refuses", async () => {
    actions.retryProjectFolderAction.mockResolvedValue({ ok: false, error: "forbidden" });
    renderBrowser({ status: "failed" });

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carpeta" }));
    expect(await screen.findByText("No tienes permiso para crear la carpeta.")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("links Conectar Google Drive to the Drive consent start with a return to this tab", () => {
    renderBrowser({ status: "needs_consent" });
    const link = screen.getByRole("link", { name: "Conectar Google Drive" });
    expect(link.getAttribute("href")).toBe(
      `/api/auth/google/start?scope=drive&return_to=${encodeURIComponent(ARCHIVOS)}`
    );
  });

  it("explains a folder the staff member can't open in Drive", () => {
    renderBrowser({ status: "no_drive_access" });
    expect(screen.getByText("No tienes acceso a esta carpeta en Drive.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists the root folder with subfolder hints, file links and Abrir en Drive", () => {
    renderBrowser(rootOk);

    expect(screen.getByText("Solo el equipo")).toBeTruthy();
    expect(screen.getByText("Lo ven los clientes invitados")).toBeTruthy();
    expect(screen.getByText("Archivos que envían los clientes")).toBeTruthy();

    const folder = screen.getByRole("link", { name: "02 Cliente" });
    expect(folder.getAttribute("href")).toBe(`${ARCHIVOS}?folder=cli`);

    const file = screen.getByRole("link", { name: "plano.pdf" });
    expect(file.getAttribute("href")).toBe("https://drive.google.com/file/d/f1/view");
    expect(file.getAttribute("target")).toBe("_blank");
    expect(file.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("2 KB")).toBeTruthy();

    const drive = screen.getByRole("link", { name: "Abrir en Drive" });
    expect(drive.getAttribute("href")).toBe("https://drive.google.com/drive/folders/root");
    expect(drive.getAttribute("target")).toBe("_blank");
  });

  it("navigates up through the breadcrumb and shows no hints below the root", () => {
    renderBrowser(nestedOk);

    const nav = screen.getByRole("navigation");
    expect(nav.textContent).toContain("P-001 · Casa Ruiz");
    expect(screen.getByRole("link", { name: "P-001 · Casa Ruiz" }).getAttribute("href")).toBe(ARCHIVOS);
    expect(screen.getByRole("link", { name: "02 Cliente" }).getAttribute("href")).toBe(`${ARCHIVOS}?folder=cli`);
    // The current folder is the last crumb and isn't a link.
    expect(screen.getAllByText("Renders").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Renders" })?.getAttribute("href")).toBe(`${ARCHIVOS}?folder=r1`);
    expect(screen.queryByText("Lo ven los clientes invitados")).toBeNull();
    // Abrir en Drive always opens the project folder.
    expect(screen.getByRole("link", { name: "Abrir en Drive" }).getAttribute("href")).toBe(
      "https://drive.google.com/drive/folders/root"
    );
  });

  it("shows an empty folder", () => {
    renderBrowser({ status: "ok", folderId: "root", breadcrumbs: [{ id: "root", name: "Proyecto" }], items: [] });
    expect(screen.getByText("Esta carpeta está vacía.")).toBeTruthy();
  });
});

describe("formatSize", () => {
  it("formats bytes for the size column", () => {
    expect(formatSize(null)).toBe("—");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5 MB");
  });
});
