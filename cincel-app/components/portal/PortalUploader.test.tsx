// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MAX_UPLOAD_BYTES, UPLOAD_ALLOWED_EXTENSIONS } from "@/lib/portal/upload-validation";
import type { PortalUploadDTO } from "@/lib/types/portal";

import PortalUploader, {
  checkPortalUploadFile,
  PORTAL_UPLOAD_ACCEPT,
  PORTAL_UPLOAD_EXTENSIONS,
  PORTAL_UPLOAD_MAX_BYTES,
  PORTAL_UPLOAD_MESSAGES,
  PORTAL_UPLOADS_EMPTY,
  portalUploadErrorMessage,
  uploadPortalFile,
} from "./PortalUploader";

/** Minimal XMLHttpRequest stand-in the test drives by hand. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  method = "";
  url = "";
  status = 0;
  responseText = "";
  body: FormData | null = null;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const createXhr = () => new FakeXhr() as unknown as XMLHttpRequest;

const upload = (over: Partial<PortalUploadDTO> = {}): PortalUploadDTO => ({
  id: "u1",
  fileName: "plano.pdf",
  sizeBytes: 2048,
  at: "2026-11-03T18:00:00.000Z",
  ...over,
});

function file(name: string, size = 10): File {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  FakeXhr.instances = [];
  fetchMock = vi.fn(async () => jsonResponse(200, []));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("allowlist and size check", () => {
  it("matches the server allowlist and limit", () => {
    expect([...PORTAL_UPLOAD_EXTENSIONS].sort()).toEqual([...UPLOAD_ALLOWED_EXTENSIONS].sort());
    expect(PORTAL_UPLOAD_MAX_BYTES).toBe(MAX_UPLOAD_BYTES);
    expect(PORTAL_UPLOAD_ACCEPT.split(",")).toContain(".dwg");
  });

  it("accepts allowed extensions in any case", () => {
    expect(checkPortalUploadFile({ name: "Plano.PDF", size: 10 })).toBeNull();
    expect(checkPortalUploadFile({ name: "corte.dxf", size: 10 })).toBeNull();
  });

  it("rejects other extensions and names without one", () => {
    expect(checkPortalUploadFile({ name: "virus.exe", size: 10 })).toBe(PORTAL_UPLOAD_MESSAGES.unsupported);
    expect(checkPortalUploadFile({ name: "sinextension", size: 10 })).toBe(PORTAL_UPLOAD_MESSAGES.unsupported);
    expect(checkPortalUploadFile({ name: "foto.", size: 10 })).toBe(PORTAL_UPLOAD_MESSAGES.unsupported);
  });

  it("rejects files past 50 MB and allows exactly 50 MB", () => {
    expect(checkPortalUploadFile({ name: "a.pdf", size: PORTAL_UPLOAD_MAX_BYTES })).toBeNull();
    expect(checkPortalUploadFile({ name: "a.pdf", size: PORTAL_UPLOAD_MAX_BYTES + 1 })).toBe(
      PORTAL_UPLOAD_MESSAGES.tooLarge
    );
  });

  it("maps 413, 415, 409 and anything else to per-file messages", () => {
    expect(portalUploadErrorMessage(413)).toBe("El archivo supera 50 MB");
    expect(portalUploadErrorMessage(415)).toBe("Tipo de archivo no permitido");
    expect(portalUploadErrorMessage(409)).toBe("Aún no puedes enviar archivos a este proyecto");
    expect(portalUploadErrorMessage(502)).toBe(PORTAL_UPLOAD_MESSAGES.failed);
  });
});

describe("uploadPortalFile", () => {
  it("posts one multipart file and reports progress", async () => {
    const seen: number[] = [];
    const pending = uploadPortalFile("p/1", file("a.pdf"), (pct) => seen.push(pct), createXhr);
    const xhr = FakeXhr.instances[0];

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/portal/projects/p%2F1/uploads");
    expect((xhr.body?.get("file") as File).name).toBe("a.pdf");

    xhr.progress(25, 100);
    xhr.progress(80, 100);
    xhr.respond(201, upload());

    await expect(pending).resolves.toEqual({ ok: true, upload: upload() });
    expect(seen).toEqual([25, 80, 100]);
  });

  it("returns the status message on errors and the redirect on 401", async () => {
    const tooBig = uploadPortalFile("p1", file("a.pdf"), () => {}, createXhr);
    FakeXhr.instances[0].respond(413, { error: "too_large" });
    await expect(tooBig).resolves.toMatchObject({ ok: false, status: 413, message: PORTAL_UPLOAD_MESSAGES.tooLarge });

    const signedOut = uploadPortalFile("p1", file("a.pdf"), () => {}, createXhr);
    FakeXhr.instances[1].respond(401, { redirect: "/portal/login" });
    await expect(signedOut).resolves.toMatchObject({ ok: false, status: 401, redirect: "/portal/login" });

    const offline = uploadPortalFile("p1", file("a.pdf"), () => {}, createXhr);
    FakeXhr.instances[2].onerror?.();
    await expect(offline).resolves.toMatchObject({ ok: false, status: 0, message: PORTAL_UPLOAD_MESSAGES.failed });
  });
});

describe("PortalUploader", () => {
  function input(): HTMLInputElement {
    return screen.getByLabelText("Elegir archivos", { selector: "input" }) as HTMLInputElement;
  }

  it("sets accept from the allowlist and shows the empty Mis envíos", async () => {
    render(<PortalUploader projectId="p1" createXhr={createXhr} />);

    expect(input().accept).toBe(PORTAL_UPLOAD_ACCEPT);
    expect(await screen.findByText(PORTAL_UPLOADS_EMPTY)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/portal/projects/p1/uploads", expect.anything());
  });

  it("rejects disallowed and oversized files without a request", async () => {
    render(<PortalUploader projectId="p1" createXhr={createXhr} />);

    fireEvent.change(input(), { target: { files: [file("a.exe"), file("b.pdf", PORTAL_UPLOAD_MAX_BYTES + 1)] } });

    expect(await screen.findByText(PORTAL_UPLOAD_MESSAGES.unsupported)).toBeTruthy();
    expect(screen.getByText(PORTAL_UPLOAD_MESSAGES.tooLarge)).toBeTruthy();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("shows progress, then success, then the new upload in Mis envíos", async () => {
    render(<PortalUploader projectId="p1" createXhr={createXhr} />);
    await screen.findByText(PORTAL_UPLOADS_EMPTY);

    fireEvent.change(input(), { target: { files: [file("plano.pdf", 2048)] } });
    const xhr = FakeXhr.instances[0];

    const bar = screen.getByRole("progressbar", { name: "Enviando plano.pdf" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");

    act(() => xhr.progress(40, 100));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");

    fetchMock.mockImplementation(async () => jsonResponse(200, [upload()]));
    act(() => xhr.respond(201, upload()));

    expect(await screen.findByText("Enviado")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    const list = await screen.findByRole("list", { name: "Mis envíos" });
    expect(list.textContent).toContain("plano.pdf");
    expect(list.textContent).toContain("2.0 KB");
    expect(list.textContent).toContain("03-11-2026");
  });

  it("keeps one request and one error per file", async () => {
    render(<PortalUploader projectId="p1" createXhr={createXhr} />);

    fireEvent.change(input(), { target: { files: [file("a.pdf"), file("b.pdf"), file("c.pdf")] } });
    expect(FakeXhr.instances).toHaveLength(3);

    act(() => {
      FakeXhr.instances[0].respond(413, {});
      FakeXhr.instances[1].respond(415, {});
      FakeXhr.instances[2].respond(409, {});
    });

    expect(await screen.findByText(PORTAL_UPLOAD_MESSAGES.tooLarge)).toBeTruthy();
    expect(screen.getByText(PORTAL_UPLOAD_MESSAGES.unsupported)).toBeTruthy();
    expect(screen.getByText(PORTAL_UPLOAD_MESSAGES.notReady)).toBeTruthy();
  });

  it("uploads dropped files", async () => {
    render(<PortalUploader projectId="p1" createXhr={createXhr} />);

    fireEvent.drop(screen.getByTestId("portal-drop-zone"), { dataTransfer: { files: [file("foto.png")] } });

    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    expect(screen.getByRole("progressbar", { name: "Enviando foto.png" })).toBeTruthy();
  });

  it("redirects to the portal sign-in on 401", async () => {
    const onUnauthorized = vi.fn();
    render(<PortalUploader projectId="p1" createXhr={createXhr} onUnauthorized={onUnauthorized} />);

    fireEvent.change(input(), { target: { files: [file("a.pdf")] } });
    act(() => FakeXhr.instances[0].respond(401, { redirect: "/portal/login" }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledWith("/portal/login"));
  });
});
