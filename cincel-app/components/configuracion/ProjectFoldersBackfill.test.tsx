// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({ ensureMissingProjectFoldersAction: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/actions/workspace-access-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ProjectFoldersBackfill, projectFoldersSummary } from "./ProjectFoldersBackfill";

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
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "Crear carpetas faltantes" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an error when the action fails", async () => {
    actions.ensureMissingProjectFoldersAction.mockRejectedValue(new Error("FORBIDDEN"));
    render(<ProjectFoldersBackfill />);
    fireEvent.click(screen.getByRole("button", { name: "Crear carpetas faltantes" }));
    expect(await screen.findByText("No se pudieron crear las carpetas. Intenta de nuevo.")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
