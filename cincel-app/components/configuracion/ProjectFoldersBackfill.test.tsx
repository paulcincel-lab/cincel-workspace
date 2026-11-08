// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

const actions = vi.hoisted(() => ({ ensureMissingProjectFoldersAction: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/actions/workspace-access-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { isProjectArchivosQuery, ProjectFoldersBackfill, projectFoldersSummary } from "./ProjectFoldersBackfill";

let client: QueryClient;

function render(ui: ReactElement) {
  client = createTestQueryClient();
  return renderWithQueryClient(ui, { client });
}

describe("projectFoldersSummary", () => {
  it("formats created and failed like the spec example", () => {
    expect(projectFoldersSummary({ created: 12, skipped: 0, failed: 1 })).toBe("12 creadas, 1 con error");
  });

  it("includes skipped and uses the singular", () => {
    expect(projectFoldersSummary({ created: 1, skipped: 1, failed: 0 })).toBe("1 creada, 1 omitida");
    expect(projectFoldersSummary({ created: 0, skipped: 3, failed: 2 })).toBe("0 creadas, 3 omitidas, 2 con error");
  });
});

describe("ProjectFoldersBackfill", () => {
  beforeEach(() => {
    actions.ensureMissingProjectFoldersAction.mockReset();
    router.refresh.mockReset();
  });
  afterEach(cleanup);

  it("renders the section and the button", () => {
    render(<ProjectFoldersBackfill />);
    expect(screen.getByText("Carpetas de proyectos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear carpetas faltantes" })).toBeTruthy();
  });

  it("disables the button while the action runs, then shows the counts", async () => {
    let resolve: (value: { created: number; skipped: number; failed: number }) => void = () => {};
    actions.ensureMissingProjectFoldersAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ProjectFoldersBackfill />);

    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    const pending = await screen.findByRole("button", { name: "Creando carpetas…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);

    resolve({ created: 12, skipped: 2, failed: 1 });
    expect(await screen.findByText("12 creadas, 2 omitidas, 1 con error")).toBeTruthy();
    expect(actions.ensureMissingProjectFoldersAction).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
    // The label switches back once the transition settles, which can lag the summary text.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(false)
    );
  });

  it("invalidates ajustes.page('google') and every project's archivos listing, nothing else", async () => {
    actions.ensureMissingProjectFoldersAction.mockResolvedValue({ created: 1, skipped: 0, failed: 0 });
    render(<ProjectFoldersBackfill />);
    const seeded = {
      google: qk.ajustes.page("google"),
      archivosRoot: qk.proyectos.archivos("p1", null),
      archivosFolder: qk.proyectos.archivos("p2", "f1"),
      shell: qk.proyectos.shell("p1"),
      puestos: qk.ajustes.page("puestos"),
    };
    for (const key of Object.values(seeded)) client.setQueryData(key, { seeded: true });

    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    expect(await screen.findByText("1 creada")).toBeTruthy();

    await waitFor(() => expect(client.getQueryState(seeded.google)?.isInvalidated).toBe(true));
    expect(client.getQueryState(seeded.archivosRoot)?.isInvalidated).toBe(true);
    expect(client.getQueryState(seeded.archivosFolder)?.isInvalidated).toBe(true);
    expect(client.getQueryState(seeded.shell)?.isInvalidated).toBe(false);
    expect(client.getQueryState(seeded.puestos)?.isInvalidated).toBe(false);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("matches only ['proyectos', id, 'archivos', …] keys", () => {
    expect(isProjectArchivosQuery({ queryKey: qk.proyectos.archivos("p1", null) })).toBe(true);
    expect(isProjectArchivosQuery({ queryKey: qk.proyectos.tab("p1", "tareas") })).toBe(false);
    expect(isProjectArchivosQuery({ queryKey: qk.portal.files("p1", null) })).toBe(false);
  });

  it("disables the button with a hint when no Shared Drive is configured", () => {
    render(<ProjectFoldersBackfill sharedDriveConfigured={false} />);
    const button = screen.getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Configura GOOGLE_SHARED_DRIVE_ID para crear carpetas")).toBeTruthy();
    fireEvent.click(button);
    expect(actions.ensureMissingProjectFoldersAction).not.toHaveBeenCalled();
  });

  it("shows no hint when the Shared Drive is configured", () => {
    render(<ProjectFoldersBackfill sharedDriveConfigured />);
    expect((screen.getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Configura GOOGLE_SHARED_DRIVE_ID para crear carpetas")).toBeNull();
  });

  it("shows an error when the action fails", async () => {
    actions.ensureMissingProjectFoldersAction.mockRejectedValue(new Error("FORBIDDEN"));
    render(<ProjectFoldersBackfill />);
    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    expect(await screen.findByText("No se pudieron crear las carpetas. Intenta de nuevo.")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
