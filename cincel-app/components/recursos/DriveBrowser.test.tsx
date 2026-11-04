// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import DriveBrowser, { driveConsentUrl } from "./DriveBrowser";

type JsonResponse = { status: number; body: unknown };

const ENTRY = {
  id: "file-1",
  name: "Planos.pdf",
  mimeType: "application/pdf",
  iconLink: null,
  thumbnailLink: null,
  webViewLink: "https://drive.google.com/file/d/file-1/view",
  modifiedTime: "2026-10-01T12:00:00.000Z",
  isFolder: false,
};

function mockFetch(routes: { status: JsonResponse; list: JsonResponse }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = url.startsWith("/api/google/drive/status") ? routes.status : routes.list;
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DriveBrowser in staff_token mode", () => {
  it("shows Conectar Google Drive when the staff member has no Drive grant", async () => {
    mockFetch({
      status: {
        status: 200,
        body: { configured: true, mode: "staff_token", hasDriveGrant: false, googleLinked: true, oauthAvailable: false },
      },
      list: { status: 403, body: { error: "needs_consent" } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByRole("button", { name: "Conectar Google Drive" })).toBeTruthy();
    expect(screen.queryByText("Conectar cuenta de Google")).toBeNull();
    expect(screen.queryByPlaceholderText("Buscar por nombre…")).toBeNull();
  });

  it("shows the same button on a 403 needs_consent from the list route", async () => {
    mockFetch({
      status: {
        status: 200,
        body: { configured: true, mode: "staff_token", hasDriveGrant: true, googleLinked: true, oauthAvailable: false },
      },
      list: { status: 403, body: { error: "needs_consent" } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByRole("button", { name: "Conectar Google Drive" })).toBeTruthy();
    expect(screen.queryByText("needs_consent")).toBeNull();
  });

  it("lists files with the grant and hides the account switcher", async () => {
    mockFetch({
      status: {
        status: 200,
        body: {
          configured: true,
          mode: "staff_token",
          hasDriveGrant: true,
          googleLinked: true,
          // even if a stale field said otherwise, staff_token mode never shows the switcher
          oauthAvailable: true,
          connectedEmail: "otra@gmail.com",
        },
      },
      list: { status: 200, body: { entries: [ENTRY], nextPageToken: null } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByText("Planos.pdf")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Cambiar cuenta")).toBeNull());
    expect(screen.queryByText("Desconectar")).toBeNull();
    expect(screen.queryByText("Conectar cuenta de Google")).toBeNull();
    expect(screen.queryByRole("button", { name: "Conectar Google Drive" })).toBeNull();
  });

  it("builds the incremental Drive consent URL with the return path", () => {
    expect(driveConsentUrl("/recursos?tab=drive")).toBe(
      "/api/auth/google/start?scope=drive&return_to=%2Frecursos%3Ftab%3Ddrive"
    );
  });
});

describe("DriveBrowser in delegation mode", () => {
  it("keeps the account switcher for a connected account", async () => {
    mockFetch({
      status: {
        status: 200,
        body: {
          configured: true,
          mode: "delegation",
          hasDriveGrant: true,
          googleLinked: false,
          oauthAvailable: true,
          connectedEmail: "persona@gmail.com",
        },
      },
      list: { status: 200, body: { entries: [ENTRY], nextPageToken: null } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByText("persona@gmail.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar cuenta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeTruthy();
    expect(await screen.findByText("Planos.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Google Drive" })).toBeNull();
  });

  it("offers Conectar cuenta de Google when no account is connected", async () => {
    mockFetch({
      status: {
        status: 200,
        body: { configured: true, oauthAvailable: true, connectedEmail: null },
      },
      list: { status: 200, body: { entries: [], nextPageToken: null } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByRole("button", { name: "Conectar cuenta de Google" })).toBeTruthy();
    expect(await screen.findByText("Carpeta vacía.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Google Drive" })).toBeNull();
  });

  it("shows the route error as before", async () => {
    mockFetch({
      status: { status: 200, body: { configured: true, mode: "delegation", oauthAvailable: false } },
      list: {
        status: 403,
        body: { error: "Conecta tu cuenta de Google o configura un correo institucional." },
      },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByText("Conecta tu cuenta de Google o configura un correo institucional.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Google Drive" })).toBeNull();
  });
});
