// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import type { GoogleHealth } from "@/lib/types/workspace-access";

import {
  GoogleAccessProgress,
  GoogleHealthStatus,
  googleNotConfigured,
  googleSignInPercent,
  googleSignInProgress,
  middleTruncate,
  pendingStaffText,
} from "./GoogleHealthStatus";

const healthy: GoogleHealth = {
  workspaceDomain: "example.test",
  oauthClientConfigured: true,
  groupMappingCount: 3,
  roleGroupMappingCount: 2,
  serviceAccountEmail: "drive-sa@example-project.iam.gserviceaccount.com",
  sharedDriveId: "0AbCdEfGhIjKlUk9PVA",
  tokenKeyConfigured: true,
  lastDirectoryError: null,
  lastDriveError: null,
  googleLinkedStaff: 4,
  activeStaff: 9,
  pendingGoogleStaff: [
    { id: "a", name: "Ana" },
    { id: "b", name: "Beto" },
    { id: "c", name: "Carla" },
    { id: "d", name: "Diego" },
    { id: "e", name: "Elena" },
  ],
  projectsWithoutFolder: 0,
  projectsWithFolder: 4,
};

function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest('[data-slot="google-status-row"]') as HTMLElement;
}

describe("GoogleHealthStatus", () => {
  afterEach(cleanup);

  it("renders every setting of a healthy setup with Configurado", () => {
    render(<GoogleHealthStatus health={healthy} />);
    expect(screen.getByRole("heading", { name: "Estado" })).toBeTruthy();
    expect(within(rowOf("Dominio de Workspace")).getByText("example.test")).toBeTruthy();
    expect(within(rowOf("Cuenta de servicio")).getByText(healthy.serviceAccountEmail as string)).toBeTruthy();
    expect(within(rowOf("Shared Drive ID")).getByText("0AbCd…Uk9PVA")).toBeTruthy();
    expect(within(rowOf("Llave de cifrado de tokens")).getByText("••••••••")).toBeTruthy();
    expect(screen.getAllByText("Configurado")).toHaveLength(5);
    expect(screen.getAllByText("Sin errores")).toHaveLength(2);
    expect(screen.queryByText("Falta")).toBeNull();
  });

  it("shows missing settings as Falta", () => {
    render(
      <GoogleHealthStatus
        health={{
          ...healthy,
          workspaceDomain: null,
          oauthClientConfigured: false,
          serviceAccountEmail: null,
          sharedDriveId: null,
          tokenKeyConfigured: false,
        }}
      />,
    );
    expect(screen.getAllByText("Falta")).toHaveLength(5);
    expect(screen.queryByText("••••••••")).toBeNull();
  });

  it("tints the pills: Configurado success, Error destructive, Falta outline", () => {
    const { container } = render(
      <GoogleHealthStatus
        health={{ ...healthy, workspaceDomain: null, lastDriveError: { at: "2026-11-01T10:00:00.000Z", message: "Shared Drive no encontrado" } }}
      />,
    );
    const tone = (label: string) =>
      Array.from(container.querySelectorAll('[data-slot="google-status"]')).find((pill) => pill.textContent === label);
    expect(tone("Configurado")?.getAttribute("data-tone")).toBe("configured");
    expect(tone("Falta")?.getAttribute("data-tone")).toBe("missing");
    expect(tone("Error")?.getAttribute("data-tone")).toBe("error");
  });

  it("warns when no mapping gives a role", () => {
    render(<GoogleHealthStatus health={{ ...healthy, groupMappingCount: 2, roleGroupMappingCount: 0 }} />);
    expect(screen.getByText("No hay grupos con rol")).toBeTruthy();
  });

  it("shows the last Directory error with its date and HTTP status, and the last Drive error", () => {
    render(
      <GoogleHealthStatus
        health={{
          ...healthy,
          lastDirectoryError: {
            at: "2026-11-07T15:30:00.000Z",
            source: "recheck",
            kind: "http",
            status: 403,
            message: "El Directorio de Google respondió 403",
          },
          lastDriveError: { at: "2026-11-01T18:00:00.000Z", message: "Shared Drive no encontrado" },
        }}
      />,
    );
    expect(within(rowOf("Último error del Directorio")).getByText("7 nov · El Directorio de Google respondió 403 (HTTP 403)")).toBeTruthy();
    expect(within(rowOf("Último error de Drive")).getByText("1 nov · Shared Drive no encontrado")).toBeTruthy();
    expect(screen.getAllByText("Error")).toHaveLength(2);
    expect(screen.queryByText("Sin errores")).toBeNull();
  });

  it("omits the HTTP status when the Directory error has none", () => {
    render(
      <GoogleHealthStatus
        health={{
          ...healthy,
          lastDirectoryError: {
            at: "2026-11-02T15:30:00.000Z",
            source: "sign_in",
            kind: "timeout",
            status: null,
            message: "El Directorio de Google no respondió a tiempo",
          },
        }}
      />,
    );
    expect(screen.getByText(/El Directorio de Google no respondió a tiempo/)).toBeTruthy();
    expect(screen.queryByText(/HTTP/)).toBeNull();
  });

  it("shows an error state when the health could not be loaded", () => {
    render(<GoogleHealthStatus health={null} />);
    expect(screen.getByText("No se pudo cargar el estado de Google.")).toBeTruthy();
    expect(screen.queryByText("Dominio de Workspace")).toBeNull();
  });
});

describe("GoogleAccessProgress", () => {
  afterEach(cleanup);

  it("ring label reads the progress sentence", () => {
    render(<GoogleAccessProgress health={healthy} />);
    const ring = screen.getByRole("img", { name: "4 de 9 colaboradores activos ya entraron con Google" });
    expect(within(ring).getByText("44 %")).toBeTruthy();
    expect(ring.querySelector("circle.ring")?.getAttribute("style")).toContain("--ring-offset: 56");
  });

  it("lists pending people, truncates after 5", () => {
    const { rerender } = render(<GoogleAccessProgress health={healthy} />);
    expect(screen.getByText("Faltan: Ana, Beto, Carla, Diego, Elena.")).toBeTruthy();

    rerender(
      <GoogleAccessProgress
        health={{ ...healthy, pendingGoogleStaff: [...healthy.pendingGoogleStaff, { id: "f", name: "Fer" }, { id: "g", name: "Gabi" }] }}
      />,
    );
    expect(screen.getByText("Faltan: Ana, Beto, Carla, Diego, Elena y 2 más.")).toBeTruthy();
  });

  it("hides the hint at 100 % and links to the first steps", () => {
    render(<GoogleAccessProgress health={{ ...healthy, googleLinkedStaff: 9, pendingGoogleStaff: [] }} />);
    expect(screen.getByText("100 %")).toBeTruthy();
    expect(screen.queryByText(/^Faltan:/)).toBeNull();
    expect(screen.getByRole("link", { name: "Primeros pasos →" }).getAttribute("href")).toBe("/ajustes/google/primeros-pasos");
  });
});

describe("Google health helpers", () => {
  it("formats N de M and the percent", () => {
    expect(googleSignInProgress({ googleLinkedStaff: 0, activeStaff: 12 })).toBe(
      "0 de 12 colaboradores activos ya entraron con Google",
    );
    expect(googleSignInPercent({ googleLinkedStaff: 11, activeStaff: 14 })).toBe(79);
    expect(googleSignInPercent({ googleLinkedStaff: 0, activeStaff: 0 })).toBe(0);
  });

  it("truncates long ids in the middle and leaves short ones", () => {
    expect(middleTruncate("0AJk3abcdefghijUk9PVA")).toBe("0AJk3…Uk9PVA");
    expect(middleTruncate("0AbCdEf")).toBe("0AbCdEf");
  });

  it("pendingStaffText is null when nobody is missing", () => {
    expect(pendingStaffText([])).toBeNull();
  });

  it("is not configured without an OAuth client or any group", () => {
    expect(googleNotConfigured(healthy)).toBe(false);
    expect(googleNotConfigured({ ...healthy, groupMappingCount: 0 })).toBe(true);
    expect(googleNotConfigured({ ...healthy, oauthClientConfigured: false })).toBe(true);
  });
});
