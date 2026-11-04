// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { GoogleHealth } from "@/lib/types/workspace-access";

import { GoogleHealthStatus, googleSignInProgress } from "./GoogleHealthStatus";

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
};

describe("GoogleHealthStatus", () => {
  afterEach(cleanup);

  it("renders every field of a healthy setup", () => {
    render(<GoogleHealthStatus health={healthy} />);
    expect(screen.getByText("Estado")).toBeTruthy();
    expect(screen.getByText("example.test")).toBeTruthy();
    expect(screen.getByText(healthy.serviceAccountEmail as string)).toBeTruthy();
    expect(screen.getByText(healthy.sharedDriveId as string)).toBeTruthy();
    expect(screen.getAllByText("Configurado")).toHaveLength(2);
    expect(screen.getByText("(2 con rol)")).toBeTruthy();
    expect(screen.getAllByText("Sin errores")).toHaveLength(2);
    expect(screen.getByText("4 de 9 colaboradores activos ya entraron con Google")).toBeTruthy();
    expect(screen.queryByText("No hay grupos de Google asignados")).toBeNull();
    expect(screen.queryByText("No configurado")).toBeNull();
  });

  it("shows missing settings as not configured", () => {
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
    expect(screen.getAllByText("No configurado")).toHaveLength(5);
  });

  it("renders status badges in monochrome outline style with a warning icon", () => {
    const { container } = render(
      <GoogleHealthStatus
        health={{
          ...healthy,
          workspaceDomain: null,
          oauthClientConfigured: false,
          lastDriveError: { at: "2026-11-01T10:00:00.000Z", message: "Shared Drive no encontrado" },
        }}
      />,
    );
    const badges = Array.from(container.querySelectorAll('[data-slot="badge"]'));
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) expect(badge.getAttribute("data-variant")).not.toBe("destructive");
    for (const label of ["No configurado", "Error"]) {
      for (const badge of badges.filter((b) => b.textContent === label)) {
        expect(badge.getAttribute("data-variant")).toBe("outline");
        expect(badge.querySelector("svg")).toBeTruthy();
      }
    }
  });

  it("warns when there are no group mappings", () => {
    render(<GoogleHealthStatus health={{ ...healthy, groupMappingCount: 0, roleGroupMappingCount: 0 }} />);
    expect(screen.getByText("No hay grupos de Google asignados")).toBeTruthy();
  });

  it("warns when no mapping gives a role", () => {
    render(<GoogleHealthStatus health={{ ...healthy, groupMappingCount: 2, roleGroupMappingCount: 0 }} />);
    expect(screen.getByText("No hay grupos con rol")).toBeTruthy();
  });

  it("shows the last Directory error with its HTTP status and the last Drive error", () => {
    render(
      <GoogleHealthStatus
        health={{
          ...healthy,
          lastDirectoryError: {
            at: "2026-11-02T15:30:00.000Z",
            source: "recheck",
            kind: "http",
            status: 403,
            message: "El Directorio de Google respondió 403",
          },
          lastDriveError: { at: "2026-11-01T10:00:00.000Z", message: "Shared Drive no encontrado" },
        }}
      />,
    );
    expect(screen.getByText(/El Directorio de Google respondió 403 \(HTTP 403\)/)).toBeTruthy();
    expect(screen.getByText(/revisión de acceso/)).toBeTruthy();
    expect(screen.getByText(/Shared Drive no encontrado/)).toBeTruthy();
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
    expect(screen.queryByText(/colaboradores activos/)).toBeNull();
  });

  it("formats N de M", () => {
    expect(googleSignInProgress({ googleLinkedStaff: 0, activeStaff: 12 })).toBe(
      "0 de 12 colaboradores activos ya entraron con Google",
    );
  });
});
