// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { seedSessionUser } from "@/tests/helpers/session-user";

const caps = vi.hoisted(() => ({ canCreateActivity: true }));
const actions = vi.hoisted(() => ({
  previewStartTramoAction: vi.fn(),
  startTramoAction: vi.fn(),
  undoStartTramoAction: vi.fn(),
}));
vi.mock("@/lib/actions/tramo-start-actions", () => actions);
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasStartSlotData: vi.fn().mockResolvedValue({ board: { ready: [], upcoming: [] }, candidates: [], canStart: true }),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: caps.canCreateActivity }),
}));

import { RESUMEN_NO_TRAMO } from "@/lib/proyectos/project-summary";
import { TRAMOS } from "@/tests/unit/fixtures/project-summary";

import { ProjectNoTramo } from "./ProjectNoTramo";

/** A real mouse press on a base-ui Select option: pointerdown, then click (base-ui ignores a bare click). */
function pressOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

function renderEmpty() {
  return renderWithQueryClient(<ProjectNoTramo projectId="p1" tramos={TRAMOS} />, { client: createTestQueryClient() });
}

beforeEach(() => {
  caps.canCreateActivity = true;
  actions.previewStartTramoAction.mockReset().mockReturnValue(new Promise(() => {}));
  seedSessionUser({ member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" });
});
afterEach(cleanup);

describe("ProjectNoTramo", () => {
  it("shows the empty state; without the permission there is no button", () => {
    caps.canCreateActivity = false;
    renderEmpty();
    expect(screen.getByText(RESUMEN_NO_TRAMO)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Iniciar un tramo" })).toBeNull();
  });

  it("opens the Iniciar tramo sheet with a tramo picker and nothing preselected", async () => {
    renderEmpty();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar un tramo" }));

    expect(await screen.findByText("Iniciar tramo")).toBeTruthy();
    const picker = screen.getByRole("combobox", { name: "Tramo" });
    expect(picker.textContent).toContain("Elige un tramo");
    expect(actions.previewStartTramoAction).not.toHaveBeenCalled();

    fireEvent.click(picker);
    pressOption(await screen.findByRole("option", { name: "Diseño" }));
    await waitFor(() => expect(actions.previewStartTramoAction).toHaveBeenCalledWith("p1", "w-diseno"));
  });
});
