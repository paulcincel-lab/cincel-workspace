// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { PortalFileDTO, PortalFolderDTO } from "@/lib/types/portal";

import PortalFileBrowser, {
  canPreview,
  formatFileSize,
  PORTAL_EXPORT_TOO_LARGE,
  PORTAL_FILES_EMPTY,
  PORTAL_FILES_ERROR,
  PORTAL_FILES_NOT_FOUND,
  PORTAL_FILES_PENDING,
  portalFilesUrl,
} from "./PortalFileBrowser";

const PID = "11111111-1111-4111-8111-111111111111";

const file = (over: Partial<PortalFileDTO>): PortalFileDTO => ({
  id: "f1",
  name: "Plano.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  modifiedAt: "2026-10-01T12:00:00.000Z",
  kind: "file",
  deliveredAs: "original",
  ...over,
});

const root: PortalFolderDTO = {
  folderId: "root",
  breadcrumbs: [{ id: "root", name: "02 Cliente" }],
  items: [
    file({ id: "d1", name: "Renders", mimeType: "application/vnd.google-apps.folder", sizeBytes: null, kind: "folder" }),
    file({ id: "f1", name: "Plano.pdf" }),
    file({ id: "f2", name: "Foto.jpg", mimeType: "image/jpeg" }),
    file({ id: "f3", name: "Presupuesto.xlsx", mimeType: "application/vnd.ms-excel" }),
    file({ id: "f4", name: "Memoria", mimeType: "application/vnd.google-apps.document", sizeBytes: null, deliveredAs: "pdf" }),
    file({ id: "f5", name: "Logo.svg", mimeType: "image/svg+xml" }),
  ],
};

const renders: PortalFolderDTO = {
  folderId: "d1",
  breadcrumbs: [
    { id: "root", name: "02 Cliente" },
    { id: "d1", name: "Renders" },
  ],
  items: [file({ id: "r1", name: "Sala.png", mimeType: "image/png" })],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PortalFileBrowser helpers", () => {
  it("offers Ver only for PDF, JPEG, PNG, WebP, GIF and Google-native files", () => {
    expect(canPreview(file({ mimeType: "application/pdf" }))).toBe(true);
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(canPreview(file({ mimeType }))).toBe(true);
    }
    expect(canPreview(file({ mimeType: "image/svg+xml" }))).toBe(false);
    expect(canPreview(file({ mimeType: "application/zip" }))).toBe(false);
    expect(canPreview(file({ mimeType: "application/vnd.google-apps.document", deliveredAs: "pdf" }))).toBe(true);
    expect(canPreview(file({ kind: "folder", mimeType: "application/pdf" }))).toBe(false);
  });

  it("formats sizes and builds the list URL", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(portalFilesUrl(PID, null)).toBe(`/api/portal/projects/${PID}/files`);
    expect(portalFilesUrl(PID, "a b")).toBe(`/api/portal/projects/${PID}/files?folder=a%20b`);
  });
});

describe("PortalFileBrowser", () => {
  it("lists the client folder with Descargar always, Ver only where previewable and a PDF badge for Google files", async () => {
    fetchMock.mockResolvedValueOnce(json(root));
    render(<PortalFileBrowser projectId={PID} />);

    expect(await screen.findByText("Plano.pdf")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/portal/projects/${PID}/files`);
    expect(screen.getByText("Archivos")).toBeTruthy();

    const download = screen.getByRole("link", { name: "Descargar Plano.pdf" });
    expect(download.getAttribute("href")).toBe(`/api/portal/projects/${PID}/files/f1/download`);
    const preview = screen.getByRole("link", { name: "Ver Plano.pdf" });
    expect(preview.getAttribute("href")).toBe(`/api/portal/projects/${PID}/files/f1/preview`);
    expect(preview.getAttribute("target")).toBe("_blank");

    expect(screen.getByRole("link", { name: "Ver Foto.jpg" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ver Presupuesto.xlsx" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver Logo.svg" })).toBeNull();
    expect(screen.getByRole("link", { name: "Descargar Presupuesto.xlsx" })).toBeTruthy();

    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar Memoria" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Descargar Renders" })).toBeNull();
  });

  it("navigates into a folder and back through the breadcrumbs", async () => {
    fetchMock.mockResolvedValueOnce(json(root)).mockResolvedValueOnce(json(renders)).mockResolvedValueOnce(json(root));
    render(<PortalFileBrowser projectId={PID} />);

    fireEvent.click(await screen.findByRole("button", { name: /Renders/ }));
    expect(await screen.findByText("Sala.png")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/portal/projects/${PID}/files?folder=d1`);
    expect(screen.getByText("Renders", { selector: "[aria-current='page']" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    expect(await screen.findByText("Plano.pdf")).toBeTruthy();
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/portal/projects/${PID}/files?folder=root`);
  });

  it("aborts the in-flight list request when the folder changes", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      if (init.signal) signals.push(init.signal);
      return signals.length === 1 ? Promise.resolve(json(root)) : new Promise<Response>(() => {});
    });
    render(<PortalFileBrowser projectId={PID} />);

    fireEvent.click(await screen.findByRole("button", { name: /Renders/ }));
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[1].aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/portal/projects/${PID}/files?folder=root`);
  });

  it("aborts the request on unmount", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      if (init.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const { unmount } = render(<PortalFileBrowser projectId={PID} initialFolderId="a" />);
    await waitFor(() => expect(signals).toHaveLength(1));

    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it("shows the pending message while the project's folders aren't ready", async () => {
    fetchMock.mockResolvedValueOnce(json({ pending: true }));
    render(<PortalFileBrowser projectId={PID} />);

    expect(await screen.findByText(PORTAL_FILES_PENDING)).toBeTruthy();
  });

  it("shows the empty, not-found and error states", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...root, items: [] }));
    const { unmount } = render(<PortalFileBrowser projectId={PID} />);
    expect(await screen.findByText(PORTAL_FILES_EMPTY)).toBeTruthy();
    unmount();

    fetchMock.mockResolvedValueOnce(json({ error: "not_found" }, 404));
    const second = render(<PortalFileBrowser projectId={PID} initialFolderId="x" />);
    expect(await screen.findByText(PORTAL_FILES_NOT_FOUND)).toBeTruthy();
    second.unmount();

    fetchMock.mockResolvedValueOnce(json({ error: "drive_unavailable" }, 503)).mockResolvedValueOnce(json(root));
    render(<PortalFileBrowser projectId={PID} />);
    expect(await screen.findByText(PORTAL_FILES_ERROR)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Plano.pdf")).toBeTruthy();
  });

  it("shows the export_too_large message inline when a Google file is too big to export", async () => {
    fetchMock
      .mockResolvedValueOnce(json(root))
      .mockResolvedValueOnce(json({ error: "export_too_large", message: "x" }, 422));
    render(<PortalFileBrowser projectId={PID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Descargar Memoria" }));
    expect(await screen.findByText(PORTAL_EXPORT_TOO_LARGE)).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/portal/projects/${PID}/files/f4/download`);
  });

  it("saves a Google file's PDF export when the download succeeds", async () => {
    const createObjectURL = vi.fn(() => "blob:memoria");
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(json(root))
      .mockResolvedValueOnce(new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 }));
    render(<PortalFileBrowser projectId={PID} />);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Descargar Memoria" }));
    });
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(screen.queryByText(PORTAL_EXPORT_TOO_LARGE)).toBeNull();
    click.mockRestore();
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it("follows the 401 redirect to the portal login", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json({ redirect: "/portal/login" }, 401));
    render(<PortalFileBrowser projectId={PID} />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/portal/login"));
    assign.mockRestore();
  });

  it("stacks each row below sm so it works at 360 px", async () => {
    window.innerWidth = 360;
    fetchMock.mockResolvedValueOnce(json(root));
    render(<PortalFileBrowser projectId={PID} />);

    await screen.findByText("Plano.pdf");
    const row = screen.getByText("Plano.pdf").closest("li");
    expect(row?.className).toContain("flex-col");
    expect(row?.className).toContain("sm:flex-row");
  });
});
