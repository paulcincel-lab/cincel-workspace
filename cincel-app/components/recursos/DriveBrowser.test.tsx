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

describe("DriveBrowser with the staff token", () => {
  it("shows Conectar Google Drive when the staff member has no Drive grant", async () => {
    mockFetch({
      status: {
        status: 200,
        body: { configured: true, mode: "staff_token", hasDriveGrant: false, googleLinked: true },
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
        body: { configured: true, mode: "staff_token", hasDriveGrant: true, googleLinked: true },
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
          // stale legacy fields never bring the switcher back
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

describe("DriveBrowser without the old connect-account UI", () => {
  it("never shows the account switcher or Conectar cuenta de Google, even with legacy status fields", async () => {
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

    expect(await screen.findByText("Planos.pdf")).toBeTruthy();
    expect(screen.queryByText("persona@gmail.com")).toBeNull();
    expect(screen.queryByText("Cambiar cuenta")).toBeNull();
    expect(screen.queryByText("Desconectar")).toBeNull();
    expect(screen.queryByText("Conectar cuenta de Google")).toBeNull();
  });

  it("never calls the old OAuth routes", async () => {
    const fetchMock = mockFetch({
      status: { status: 200, body: { configured: true, mode: "staff_token", hasDriveGrant: true, googleLinked: true } },
      list: { status: 200, body: { entries: [], nextPageToken: null } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByText("Carpeta vacía.")).toBeTruthy();
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.startsWith("/api/google/oauth"))).toBe(false);
  });

  it("shows other route errors inline", async () => {
    mockFetch({
      status: { status: 200, body: { configured: true, mode: "staff_token", hasDriveGrant: true, googleLinked: true } },
      list: { status: 502, body: { error: "No se pudo consultar Google Drive." } },
    });
    render(<DriveBrowser active />);

    expect(await screen.findByText("No se pudo consultar Google Drive.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Google Drive" })).toBeNull();
  });
});
